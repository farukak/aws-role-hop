import type { Message } from '../i18n';

export interface ReleaseNote {
  version: string;
  date: string;
  highlights: readonly Message[];
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '0.3.0',
    date: '2026-08-16',
    highlights: [
      'Reach both IAM roles and SSO without choosing a mode first: Import and Discover are always available.',
      'Imported Identity Center profiles now land in the SSO list on their own, so the lists never mix.',
      'The list you are looking at decides what the popup offers, which removes a setting you had to think about.',
      'Fixed a stray line that appeared inside a field while typing in it.',
      'An import that trips over a stray space in a role ARN now says so instead of restating the format.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-08-13',
    highlights: [
      'Choose between IAM and SSO when you first open AWS Role Hop, and switch access path whenever you want.',
      'Let AWS Role Hop read your accounts and permission sets from your AWS access portal instead of typing them.',
      'Scan the portal straight from the popup while you are on it.',
      'Keep IAM and SSO profiles apart in their own default lists.',
      'Open any profile in a single click, with the production confirmation available when you want it.',
    ],
  },
  {
    version: '0.1.3',
    date: '2026-08-13',
    highlights: [
      'Switch roles in AWS multi-session windows without losing the session you signed in with.',
      'See which profiles already exist or reuse a name before an import runs.',
      'Load a saved profile list back into the import editor to review or extend it.',
      'Read a clear explanation when AWS refuses a role switch.',
    ],
  },
  {
    version: '0.1.2',
    date: '2026-08-09',
    highlights: [
      'Choose and persist one of eight pastel colors when adding or editing a profile.',
      'Return a profile to automatic color assignment from the accessible color picker.',
    ],
  },
  {
    version: '0.1.1',
    date: '2026-08-09',
    highlights: [
      'Open release notes directly from the options sidebar.',
      "Open Faruk AK's GitHub profile from below the Local by design card.",
    ],
  },
  {
    version: '0.1.0',
    date: '2026-08-09',
    highlights: [
      'Organize AWS roles and Identity Center profiles in named local lists.',
      "Switch IAM roles through AWS's native flow without an intermediate page.",
      'Import AWS config and Organizations JSON without retaining raw configuration.',
      'Open the import screen directly from the empty popup.',
      'Use English or Turkish with light, dark, or system themes.',
      'Benefit from safer consecutive switching, bounded imports, and clearer errors.',
    ],
  },
] as const;

export function latestRelease(): ReleaseNote {
  const release = RELEASE_NOTES[0];
  if (!release) throw new Error('AWS Role Hop has no bundled release notes.');
  return release;
}

export function isVersionUpgrade(currentVersion: string, previousVersion?: string): boolean {
  if (!previousVersion) return false;
  const current = parseVersion(currentVersion);
  const previous = parseVersion(previousVersion);
  if (!current || !previous) return false;

  const length = Math.max(current.length, previous.length);
  for (let index = 0; index < length; index += 1) {
    const currentPart = current[index] ?? 0;
    const previousPart = previous[index] ?? 0;
    if (currentPart !== previousPart) return currentPart > previousPart;
  }
  return false;
}

function parseVersion(version: string): number[] | null {
  const parts = version.split('.');
  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) return null;
  return parts.map(Number);
}
