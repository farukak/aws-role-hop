import {
  inferEnvironment,
  PROFILE_LIMIT,
  profileDraftSchema,
  type Partition,
  type ProfileDraft,
} from '../domain/profile';
import type { ImportIssue, IgnoredSection } from './format';

export interface AwsConfigImportResult {
  profiles: ProfileDraft[];
  issues: ImportIssue[];
  ignored: IgnoredSection[];
  credentialsIgnored: boolean;
}

interface Entry {
  value: string;
  line: number;
}

interface Section {
  name: string;
  line: number;
  entries: Map<string, Entry>;
  /** Credential keys seen and discarded, used to explain an empty section. */
  sensitiveKeys: number;
}

type SectionOutcome =
  | { kind: 'profile'; draft: ProfileDraft }
  | { kind: 'issue' }
  | { kind: 'ignored'; reason: string };

const SENSITIVE_KEYS = new Set([
  'aws_access_key_id',
  'aws_secret_access_key',
  'aws_session_token',
  'credential_process',
  'credential_source',
  'web_identity_token_file',
]);

export function parseAwsConfig(input: string): AwsConfigImportResult {
  const issues: ImportIssue[] = [];
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let credentialsIgnored = false;

  for (const [index, rawLine] of input
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const sectionMatch = /^\[([^\]]+)]$/.exec(line);
    if (sectionMatch?.[1]) {
      currentSection = {
        name: sectionMatch[1].trim(),
        line: lineNumber,
        entries: new Map(),
        sensitiveKeys: 0,
      };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) {
      issues.push({ line: lineNumber, message: 'Entry appears before a section header.' });
      continue;
    }

    const separatorIndex = rawLine.indexOf('=');
    if (separatorIndex < 1) {
      issues.push({
        line: lineNumber,
        section: currentSection.name,
        message: 'Expected a key = value entry.',
      });
      continue;
    }

    const key = rawLine.slice(0, separatorIndex).trim().toLowerCase();
    if (SENSITIVE_KEYS.has(key)) {
      credentialsIgnored = true;
      currentSection.sensitiveKeys += 1;
      continue;
    }

    const value = parseValue(rawLine.slice(separatorIndex + 1));
    currentSection.entries.set(key, { value, line: lineNumber });
  }

  const ssoSessions = new Map<string, Section>();
  for (const section of sections) {
    const match = /^sso-session\s+(.+)$/i.exec(section.name);
    if (match?.[1]) ssoSessions.set(match[1].trim(), section);
  }

  const profileSections = new Map<string, Section>();
  for (const section of sections) {
    if (!/^sso-session\s+/i.test(section.name)) {
      profileSections.set(profileSectionKey(section.name), section);
    }
  }
  const referencedSources = new Set(
    sections
      .map((section) => section.entries.get('source_profile')?.value)
      .filter((value): value is string => Boolean(value))
      .map(profileSectionKey),
  );

  const profiles: ProfileDraft[] = [];
  const ignored: IgnoredSection[] = [];
  let profileLimitReported = false;

  for (const section of sections) {
    if (/^sso-session\s+/i.test(section.name)) continue;
    const outcome = sectionToDraft(
      section,
      ssoSessions,
      profileSections,
      referencedSources,
      issues,
    );
    if (outcome.kind === 'profile') {
      if (profiles.length < PROFILE_LIMIT) {
        profiles.push(outcome.draft);
      } else if (!profileLimitReported) {
        issues.push({
          section: 'Import limit',
          message: `Only the first ${PROFILE_LIMIT} valid profiles are shown and can be imported.`,
        });
        profileLimitReported = true;
      }
    } else if (outcome.kind === 'ignored') {
      ignored.push({ section: section.name, reason: outcome.reason });
    }
  }

  return { profiles, issues, ignored, credentialsIgnored };
}

/**
 * A malformed ARN is far easier to fix when the message names what is wrong with
 * it. Lists carried between tools sometimes pick up a space after `iam::`, and the
 * generic message left the reader guessing.
 */
function describeRoleProfileIssue(roleArn: string | undefined): string {
  if (roleArn === undefined) {
    return 'Role profile requires both an account ID or alias and a role name.';
  }
  if (/\s/.test(roleArn)) {
    return 'Role ARN cannot contain spaces. Remove the space, for example in "iam:: 123456789012".';
  }
  return 'Role ARN must contain a supported partition, 12-digit account ID, and role name.';
}

function sectionToDraft(
  section: Section,
  ssoSessions: Map<string, Section>,
  profileSections: Map<string, Section>,
  referencedSources: Set<string>,
  issues: ImportIssue[],
): SectionOutcome {
  const get = (key: string): string | undefined => section.entries.get(key)?.value || undefined;
  const profileName = section.name.replace(/^profile\s+/i, '').trim();
  const ssoAccountId = get('sso_account_id');
  const ssoRoleName = get('sso_role_name');
  const ssoSessionName = get('sso_session');
  const directStartUrl = get('sso_start_url');
  const sessionStartUrl = ssoSessionName
    ? ssoSessions.get(ssoSessionName)?.entries.get('sso_start_url')?.value
    : undefined;

  if (ssoAccountId || ssoRoleName || directStartUrl || ssoSessionName) {
    if (!ssoAccountId || !ssoRoleName || !(directStartUrl || sessionStartUrl)) {
      issues.push({
        line: section.line,
        section: section.name,
        message: 'Identity Center profile is missing account ID, permission set, or start URL.',
      });
      return { kind: 'issue' };
    }

    return validateDraft(
      {
        type: 'sso',
        name: profileName,
        accountId: ssoAccountId,
        roleName: ssoRoleName,
        portalUrl: directStartUrl ?? sessionStartUrl!,
        ...(get('region') ? { region: get('region') } : {}),
        environment: inferEnvironment(profileName),
        favorite: parseBoolean(get('favorite')),
        tags: parseTags(get('tags')),
      },
      section,
      issues,
    );
  }

  const sectionKey = profileSectionKey(section.name);
  if (referencedSources.has(sectionKey)) {
    return {
      kind: 'ignored',
      reason: 'Base account used to resolve source_profile defaults; it is not a switch target.',
    };
  }

  const sourceName = get('source_profile');
  const sourceSection = sourceName ? profileSections.get(profileSectionKey(sourceName)) : undefined;
  if (sourceName && !sourceSection) {
    issues.push({
      line: section.line,
      section: section.name,
      message: `source_profile references an unknown section: ${sourceName}.`,
    });
    return { kind: 'issue' };
  }
  const sourceGet = (key: string): string | undefined =>
    sourceSection?.entries.get(key)?.value || undefined;

  const roleArn = get('role_arn');
  const roleArnMatch = roleArn
    ? /^arn:(aws|aws-us-gov|aws-cn):iam::(\d{12}):role\/(.+)$/.exec(roleArn)
    : null;
  const accountId =
    roleArnMatch?.[2] ?? get('aws_account_id') ?? get('account_id') ?? get('aws_account_alias');
  const roleName =
    roleArnMatch?.[3] ??
    get('role_name') ??
    get('target_role_name') ??
    sourceGet('target_role_name');
  const region = get('region') ?? get('target_region') ?? sourceGet('target_region');

  // A section with no role information at all is simply not a role profile.
  // A section that *does* declare `role_arn` must always be reported, even when
  // the ARN is malformed, so the import review step never drops it silently.
  if (!accountId && !roleName && !roleArn) {
    return {
      kind: 'ignored',
      reason:
        section.sensitiveKeys > 0 && section.entries.size === 0
          ? 'Only credential fields, which AWS Role Hop never imports.'
          : 'No role ARN, account ID, or Identity Center fields.',
    };
  }
  if (!accountId || !roleName || (roleArn && !roleArnMatch)) {
    issues.push({
      line: section.line,
      section: section.name,
      message: describeRoleProfileIssue(roleArn),
    });
    return { kind: 'issue' };
  }

  const configuredPartition = get('partition') ?? sourceGet('partition');
  const partition: Partition = roleArnMatch?.[1]
    ? (roleArnMatch[1] as Partition)
    : configuredPartition === 'aws-us-gov' || configuredPartition === 'aws-cn'
      ? configuredPartition
      : 'aws';

  return validateDraft(
    {
      type: 'role',
      name: profileName,
      accountId,
      roleName,
      partition,
      ...(region ? { region } : {}),
      environment: inferEnvironment(profileName),
      favorite: parseBoolean(get('favorite')),
      tags: parseTags(get('tags')),
    },
    section,
    issues,
  );
}

function profileSectionKey(value: string): string {
  return value
    .replace(/^profile\s+/i, '')
    .trim()
    .toLowerCase();
}

function validateDraft(value: unknown, section: Section, issues: ImportIssue[]): SectionOutcome {
  const result = profileDraftSchema.safeParse(value);
  if (result.success) return { kind: 'profile', draft: result.data };

  issues.push({
    line: section.line,
    section: section.name,
    message: result.error.issues[0]?.message ?? 'Profile is invalid.',
  });
  return { kind: 'issue' };
}

function parseValue(input: string): string {
  const value = input.trim();
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1).trim();
  }
  return value.replace(/\s+[;#].*$/, '').trim();
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

function parseTags(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}
