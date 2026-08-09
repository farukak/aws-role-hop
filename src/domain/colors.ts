import type { Environment, ProfileColorId, ProfileDraft } from './profile';

export interface SoftColor {
  id: ProfileColorId;
  label: string;
  light: {
    surface: string;
    border: string;
    accent: string;
    text: string;
  };
  dark: {
    surface: string;
    border: string;
    accent: string;
    text: string;
  };
}

export const PROFILE_COLORS: readonly SoftColor[] = [
  {
    id: 'rose',
    label: 'Soft rose',
    light: { surface: '#fff1f2', border: '#fecdd3', accent: '#e98b9a', text: '#881d35' },
    dark: { surface: '#3a1d27', border: '#713044', accent: '#f0a0ad', text: '#ffe4e8' },
  },
  {
    id: 'peach',
    label: 'Soft peach',
    light: { surface: '#fff4ec', border: '#fed7bd', accent: '#ed9d70', text: '#7c3216' },
    dark: { surface: '#39251d', border: '#70452f', accent: '#f2b18d', text: '#ffe8d8' },
  },
  {
    id: 'amber',
    label: 'Soft amber',
    light: { surface: '#fffae8', border: '#f5dda0', accent: '#d5aa45', text: '#694a0a' },
    dark: { surface: '#332b18', border: '#66552a', accent: '#e6c360', text: '#fff0b8' },
  },
  {
    id: 'mint',
    label: 'Soft mint',
    light: { surface: '#eefbf3', border: '#bfe7cd', accent: '#72bd8d', text: '#14532d' },
    dark: { surface: '#183126', border: '#2f6448', accent: '#82cea0', text: '#d9fbe6' },
  },
  {
    id: 'teal',
    label: 'Soft teal',
    light: { surface: '#edfbf9', border: '#b9e8df', accent: '#62bbae', text: '#124f49' },
    dark: { surface: '#17302f', border: '#2c625e', accent: '#75c9be', text: '#d5faf5' },
  },
  {
    id: 'sky',
    label: 'Soft sky',
    light: { surface: '#eef8ff', border: '#bcdff5', accent: '#69b4e3', text: '#164e73' },
    dark: { surface: '#172d3c', border: '#2b5b78', accent: '#7bc4ed', text: '#d9f2ff' },
  },
  {
    id: 'indigo',
    label: 'Soft indigo',
    light: { surface: '#f0f3ff', border: '#c9d2fa', accent: '#8294e8', text: '#303f83' },
    dark: { surface: '#20263e', border: '#414e7d', accent: '#9cacf2', text: '#e3e8ff' },
  },
  {
    id: 'lilac',
    label: 'Soft lilac',
    light: { surface: '#faf2ff', border: '#e4c9f2', accent: '#ba8bd2', text: '#65317d' },
    dark: { surface: '#30213a', border: '#603f73', accent: '#ca9ee0', text: '#f5e2ff' },
  },
];

const ENVIRONMENT_COLOR: Partial<Record<Environment, string>> = {
  production: 'rose',
  staging: 'amber',
  development: 'sky',
  sandbox: 'mint',
  shared: 'teal',
};

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function getProfileColor(profile: {
  accountId: string;
  environment: Environment;
  colorId?: ProfileColorId | undefined;
}): SoftColor {
  if (profile.colorId) {
    const persistedColor = getColorById(profile.colorId);
    if (persistedColor) return persistedColor;
  }

  const semanticColor = ENVIRONMENT_COLOR[profile.environment];
  if (semanticColor) {
    const match = PROFILE_COLORS.find((color) => color.id === semanticColor);
    if (match) return match;
  }

  return (
    PROFILE_COLORS[hash(profile.accountId.toLowerCase()) % PROFILE_COLORS.length] ??
    PROFILE_COLORS[0]!
  );
}

export function getColorById(id: string): SoftColor | undefined {
  return PROFILE_COLORS.find((color) => color.id === id);
}

/**
 * Assigns a stable pastel while avoiding colors already used in the target list
 * until the palette is exhausted. No manual or high-saturation color input is
 * stored, so imported configuration remains data-only and safe to render.
 */
export function chooseProfileColorId(
  profile: Pick<ProfileDraft, 'accountId' | 'roleName'>,
  existing: readonly { colorId: ProfileColorId }[],
): ProfileColorId {
  const start =
    hash(`${profile.accountId.toLowerCase()}|${profile.roleName.toLowerCase()}`) %
    PROFILE_COLORS.length;
  const used = new Set(existing.map(({ colorId }) => colorId));

  for (let offset = 0; offset < PROFILE_COLORS.length; offset += 1) {
    const candidate = PROFILE_COLORS[(start + offset) % PROFILE_COLORS.length];
    if (candidate && !used.has(candidate.id)) {
      return candidate.id;
    }
  }

  return PROFILE_COLORS[(start + existing.length) % PROFILE_COLORS.length]!.id;
}
