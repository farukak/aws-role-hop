import { profileIdentity, type Profile, type ProfileDraft } from '../domain/profile';

export interface ImportCollisions {
  /** Profiles whose sign-in target already exists, so importing skips them. */
  duplicateTargets: number;
  /** Names that would appear twice once the import completes, in paste order. */
  duplicateNames: string[];
}

/**
 * Import skips a profile whose account, role and partition already exist, but a
 * reused *name* is still accepted and only shows up later as two identical rows.
 * Both are reported so the interface can warn before anything is stored.
 */
export function findImportCollisions(
  drafts: ProfileDraft[],
  destinationProfiles: Profile[],
): ImportCollisions {
  const identities = new Set(destinationProfiles.map(profileIdentity));
  const names = new Set(destinationProfiles.map((profile) => profile.name.toLowerCase()));
  const duplicateNames: string[] = [];
  let duplicateTargets = 0;

  for (const draft of drafts) {
    const identity = profileIdentity(draft);
    if (identities.has(identity)) {
      // Skipped on import, so it can never contribute a repeated name.
      duplicateTargets += 1;
      continue;
    }
    identities.add(identity);

    const name = draft.name.toLowerCase();
    if (names.has(name) && !duplicateNames.includes(draft.name)) duplicateNames.push(draft.name);
    names.add(name);
  }

  return { duplicateTargets, duplicateNames };
}
