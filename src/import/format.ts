/** A problem with one entry or section of an import, surfaced in the review step. */
export interface ImportIssue {
  line?: number;
  section?: string;
  message: string;
}

/** A section that was understood but carried nothing importable. */
export interface IgnoredSection {
  section: string;
  reason: string;
}

export type ImportFormat = 'aws-config' | 'organizations' | 'unknown';

/**
 * Decides which parser an input belongs to. Detection is structural rather than
 * name-based because both formats arrive as pasted text with no filename: an AWS
 * CLI config is INI with `[section]` headers, and `aws organizations
 * list-accounts` output is JSON carrying an `Accounts` array.
 */
export function detectImportFormat(input: string): ImportFormat {
  const trimmed = input.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return 'unknown';

  if (trimmed.startsWith('{') || /^\[\s*(?:\{|])/.test(trimmed)) {
    return looksLikeOrganizations(trimmed) ? 'organizations' : 'unknown';
  }

  // An INI section header on its own line, which a JSON array never produces.
  return /^\[[^\]\n]+]\s*$/m.test(trimmed) ? 'aws-config' : 'unknown';
}

function looksLikeOrganizations(input: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return false;
  }

  const candidates = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.Accounts)
      ? parsed.Accounts
      : null;

  return candidates !== null && candidates.every((entry) => isRecord(entry) && 'Id' in entry);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
