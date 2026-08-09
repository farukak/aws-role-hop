import {
  inferEnvironment,
  PROFILE_LIMIT,
  profileDraftSchema,
  type Partition,
  type ProfileDraft,
} from '../domain/profile';
import { isRecord, type ImportIssue } from './format';

export interface OrganizationAccount {
  id: string;
  name: string;
}

export interface OrganizationsParseResult {
  accounts: OrganizationAccount[];
  issues: ImportIssue[];
  /** Accounts excluded because they are not ACTIVE (suspended or closing). */
  skippedInactive: number;
}

/**
 * Reads `aws organizations list-accounts` output. Only the account ID and name
 * are taken: the email address is personal data, and the ARN, join method, and
 * timestamps are irrelevant to a console shortcut, so none of them are read into
 * the profile model.
 */
export function parseOrganizationsAccounts(input: string): OrganizationsParseResult {
  const issues: ImportIssue[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.replace(/^\uFEFF/, ''));
  } catch {
    return {
      accounts: [],
      issues: [{ message: 'This is not valid JSON. Paste the full command output.' }],
      skippedInactive: 0,
    };
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.Accounts)
      ? parsed.Accounts
      : null;

  if (!entries) {
    return {
      accounts: [],
      issues: [
        {
          message:
            'Expected an "Accounts" array from aws organizations list-accounts, or a JSON array of accounts.',
        },
      ],
      skippedInactive: 0,
    };
  }

  const accounts: OrganizationAccount[] = [];
  const seen = new Set<string>();
  let skippedInactive = 0;
  let profileLimitReported = false;

  for (const [index, entry] of entries.entries()) {
    const position = `Account ${index + 1}`;

    if (!isRecord(entry)) {
      issues.push({ section: position, message: 'Entry is not an account object.' });
      continue;
    }

    if ('AccountId' in entry && !('Id' in entry)) {
      issues.push({
        section: position,
        message:
          'This looks like account-creation status output. Use aws organizations list-accounts.',
      });
      continue;
    }

    const id = typeof entry.Id === 'string' ? entry.Id.trim() : '';
    if (!/^\d{12}$/.test(id)) {
      issues.push({ section: position, message: 'Account ID must be 12 digits.' });
      continue;
    }

    const rawState = typeof entry.State === 'string' ? entry.State : entry.Status;
    if (typeof rawState !== 'string' || !rawState.trim()) {
      issues.push({
        section: position,
        message: 'Account state is missing. Export fresh aws organizations list-accounts output.',
      });
      continue;
    }

    const state = rawState.toUpperCase();
    if (
      !['PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'PENDING_CLOSURE', 'CLOSED'].includes(state)
    ) {
      issues.push({ section: position, message: `Unknown account state: ${rawState}.` });
      continue;
    }
    if (state !== 'ACTIVE') {
      skippedInactive += 1;
      continue;
    }

    if (seen.has(id)) continue;
    seen.add(id);

    if (accounts.length >= PROFILE_LIMIT) {
      if (!profileLimitReported) {
        issues.push({
          section: 'Import limit',
          message: `Only the first ${PROFILE_LIMIT} active accounts are shown and can be imported.`,
        });
        profileLimitReported = true;
      }
      continue;
    }

    const name = typeof entry.Name === 'string' && entry.Name.trim() ? entry.Name.trim() : id;
    accounts.push({ id, name });
  }

  return { accounts, issues, skippedInactive };
}

export interface AccountsToDraftsResult {
  profiles: ProfileDraft[];
  issues: ImportIssue[];
}

/**
 * Organizations output names accounts but not roles, so the caller supplies the
 * role every account should be reached through — typically the organization's
 * standard cross-account role.
 */
export function organizationAccountsToDrafts(
  accounts: OrganizationAccount[],
  roleName: string,
  partition: Partition,
): AccountsToDraftsResult {
  const profiles: ProfileDraft[] = [];
  const issues: ImportIssue[] = [];

  for (const account of accounts) {
    const result = profileDraftSchema.safeParse({
      type: 'role',
      name: account.name.slice(0, 48),
      accountId: account.id,
      roleName,
      partition,
      environment: inferEnvironment(account.name),
      favorite: false,
      tags: [],
    });

    if (result.success) {
      profiles.push(result.data);
      continue;
    }

    issues.push({
      section: account.name,
      message: result.error.issues[0]?.message ?? 'Account could not be converted to a profile.',
    });
  }

  return { profiles, issues };
}
