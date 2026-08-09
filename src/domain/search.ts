import type { Profile } from './profile';

interface RankedProfile {
  profile: Profile;
  score: number;
  index: number;
}

const FIELD_WEIGHTS = [120, 110, 100, 80, 60, 40] as const;

/**
 * Ranks profiles by exact, prefix, substring, then subsequence matches. Every
 * query token must match at least one searchable field. Input order breaks ties,
 * so favorite/recency ordering from `sortProfiles` remains stable.
 */
export function searchProfiles(profiles: Profile[], query: string): Profile[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return profiles;

  return profiles
    .map((profile, index): RankedProfile | null => {
      const fields = searchableFields(profile).map(normalize);
      let total = 0;

      for (const token of tokens) {
        let best = -1;
        for (const [fieldIndex, field] of fields.entries()) {
          const match = scoreMatch(field, token);
          if (match >= 0) best = Math.max(best, match + (FIELD_WEIGHTS[fieldIndex] ?? 0));
        }
        if (best < 0) return null;
        total += best;
      }

      return { profile, score: total, index };
    })
    .filter((entry): entry is RankedProfile => entry !== null)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ profile }) => profile);
}

function searchableFields(profile: Profile): string[] {
  return [
    profile.name,
    profile.roleName,
    profile.accountId,
    profile.tags.join(' '),
    profile.environment,
    profile.type,
  ];
}

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

function scoreMatch(field: string, token: string): number {
  if (field === token) return 1_000;
  if (field.startsWith(token)) return 800 - Math.min(field.length - token.length, 100);

  const substringIndex = field.indexOf(token);
  if (substringIndex >= 0) return 600 - Math.min(substringIndex, 100);

  let tokenIndex = 0;
  let firstMatch = -1;
  let previousMatch = -1;
  let gaps = 0;

  for (
    let fieldIndex = 0;
    fieldIndex < field.length && tokenIndex < token.length;
    fieldIndex += 1
  ) {
    if (field[fieldIndex] !== token[tokenIndex]) continue;
    if (firstMatch < 0) firstMatch = fieldIndex;
    if (previousMatch >= 0) gaps += fieldIndex - previousMatch - 1;
    previousMatch = fieldIndex;
    tokenIndex += 1;
  }

  if (tokenIndex !== token.length) return -1;
  return 400 - Math.min(firstMatch * 2 + gaps, 200);
}
