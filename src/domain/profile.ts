import * as z from 'zod/mini';

export const PROFILE_LIMIT = 500;
export const PROFILE_LIST_LIMIT = 100;
export const PROFILE_LIST_NAME_MAX_LENGTH = 48;
export const AWS_ACCOUNT_ID_LENGTH = 12;
export const ACCOUNT_ALIAS_MAX_LENGTH = 63;
export const ROLE_NAME_MAX_LENGTH = 64;
export const PORTAL_URL_MAX_LENGTH = 2_048;
export const REGION_MAX_LENGTH = 32;
export const TAG_MAX_LENGTH = 24;
export const DEFAULT_PROFILE_LIST_ID = '00000000-0000-4000-8000-000000000001';
export const PROFILE_COLOR_IDS = [
  'rose',
  'peach',
  'amber',
  'mint',
  'teal',
  'sky',
  'indigo',
  'lilac',
] as const;

const ENVIRONMENT_VALUES = [
  'production',
  'staging',
  'development',
  'sandbox',
  'shared',
  'other',
] as const;

export const ENVIRONMENT_OPTIONS = [
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Development' },
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'shared', label: 'Shared services' },
  { value: 'other', label: 'Other' },
] as const;

export const PARTITION_OPTIONS = [
  { value: 'aws', label: 'AWS' },
  { value: 'aws-us-gov', label: 'AWS GovCloud (US)' },
  { value: 'aws-cn', label: 'AWS China' },
] as const;

const singleLineText = z.refine(
  (value) =>
    typeof value === 'string' &&
    [...value].every((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint >= 32 && codePoint !== 127;
    }),
  'Control characters and line breaks are not allowed.',
);

const profileNameSchema = z
  .string()
  .check(
    z.trim(),
    z.minLength(1, 'Profile name is required.'),
    z.maxLength(48, 'Profile name must be 48 characters or fewer.'),
    singleLineText,
  );

const accountIdentifierSchema = z.string().check(
  z.trim(),
  z.minLength(1, 'Account ID or alias is required.'),
  z.refine((value) => {
    if (/^\d+$/.test(value)) return /^\d{12}$/.test(value);
    return (
      value.length >= 3 &&
      value.length <= ACCOUNT_ALIAS_MAX_LENGTH &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)
    );
  }, 'Use exactly 12 digits for an account ID, or a valid lowercase account alias.'),
);

const ssoAccountIdSchema = z
  .string()
  .check(z.trim(), z.regex(/^\d{12}$/, 'Identity Center profiles require a 12-digit account ID.'));

const roleNameSchema = z.string().check(
  z.trim(),
  z.minLength(1, 'Role or permission set name is required.'),
  z.maxLength(ROLE_NAME_MAX_LENGTH, 'Role path and name must be 64 characters or fewer.'),
  z.regex(/^[\w+=,.@/-]+$/, 'Role names may contain letters, numbers, and _+=,.@/- only.'),
  z.refine(
    (value) => !value.startsWith('/') && !value.endsWith('/') && !value.includes('//'),
    'Role paths cannot contain empty segments.',
  ),
);

const regionSchema = z.string().check(
  z.trim(),
  z.overwrite((value) => value.toLowerCase()),
  z.minLength(3, 'Enter a valid AWS region.'),
  z.maxLength(REGION_MAX_LENGTH, 'Enter a valid AWS region.'),
  z.regex(/^[a-z0-9]+(?:-[a-z0-9]+)+-\d$/, 'Enter a region such as us-east-1.'),
);

export function isAllowedPortalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const allowedHost =
      hostname.endsWith('.awsapps.com') ||
      hostname.endsWith('.awsapps.cn') ||
      hostname.endsWith('.app.aws');

    // Older portals live under /start; the current ones are served from the root
    // of their own host. Both answer the same #/console shortcut.
    const path = url.pathname.replace(/\/+$/, '');
    const allowedPath = path === '' || path === '/start';

    return (
      url.protocol === 'https:' &&
      allowedHost &&
      allowedPath &&
      url.username === '' &&
      url.password === '' &&
      url.port === ''
    );
  } catch {
    return false;
  }
}

const portalUrlSchema = z
  .string()
  .check(
    z.trim(),
    z.minLength(1, 'AWS access portal URL is required.'),
    z.maxLength(PORTAL_URL_MAX_LENGTH, 'AWS access portal URL is too long.'),
    z.refine(isAllowedPortalUrl, 'Use a valid HTTPS AWS access portal URL.'),
  );

const tagSchema = z
  .string()
  .check(z.trim(), z.minLength(1), z.maxLength(TAG_MAX_LENGTH), singleLineText);
const environmentSchema = z.enum(ENVIRONMENT_VALUES);
const partitionSchema = z.enum(['aws', 'aws-us-gov', 'aws-cn']);

const draftBaseShape = {
  name: profileNameSchema,
  roleName: roleNameSchema,
  environment: environmentSchema,
  favorite: z.boolean(),
  tags: z.array(tagSchema).check(z.maxLength(8, 'Use no more than 8 tags.')),
  colorId: z.optional(z.enum(PROFILE_COLOR_IDS)),
};

export const roleProfileDraftSchema = z.strictObject({
  ...draftBaseShape,
  type: z.literal('role'),
  accountId: accountIdentifierSchema,
  partition: partitionSchema,
  region: z.optional(regionSchema),
});

export const ssoProfileDraftSchema = z.strictObject({
  ...draftBaseShape,
  type: z.literal('sso'),
  accountId: ssoAccountIdSchema,
  portalUrl: portalUrlSchema,
  region: z.optional(regionSchema),
});

export const profileDraftSchema = z.discriminatedUnion('type', [
  roleProfileDraftSchema,
  ssoProfileDraftSchema,
]);

const persistedShape = {
  id: z.uuid(),
  listId: z.uuid(),
  colorId: z.enum(PROFILE_COLOR_IDS),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lastUsedAt: z.optional(z.iso.datetime()),
};

const roleProfileSchema = z.extend(roleProfileDraftSchema, persistedShape);
const ssoProfileSchema = z.extend(ssoProfileDraftSchema, persistedShape);

export const profileSchema = z.discriminatedUnion('type', [roleProfileSchema, ssoProfileSchema]);

/**
 * Which AWS access path the interface is set up for. `unset` means the choice has
 * not been made yet, which is what triggers the first-run question.
 */
export const ACCESS_MODES = ['unset', 'iam', 'sso'] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export const settingsSchema = z.strictObject({
  accessMode: z.enum(ACCESS_MODES),
  theme: z.enum(['system', 'light', 'dark']),
  language: z.enum(['system', 'en', 'tr']),
  openBehavior: z.enum(['current', 'new']),
  confirmProduction: z.boolean(),
  hideAccountIds: z.boolean(),
});

const profileListNameSchema = z
  .string()
  .check(
    z.trim(),
    z.minLength(1, 'Profile list name is required.'),
    z.maxLength(
      PROFILE_LIST_NAME_MAX_LENGTH,
      `Profile list name must be ${PROFILE_LIST_NAME_MAX_LENGTH} characters or fewer.`,
    ),
    singleLineText,
  );

export const profileListSchema = z.strictObject({
  id: z.uuid(),
  name: profileListNameSchema,
});

export const appStateSchema = z
  .strictObject({
    version: z.literal(4),
    profiles: z.array(profileSchema).check(z.maxLength(PROFILE_LIMIT)),
    profileLists: z
      .array(profileListSchema)
      .check(
        z.minLength(1, 'At least one profile list is required.'),
        z.maxLength(PROFILE_LIST_LIMIT, `Use no more than ${PROFILE_LIST_LIMIT} profile lists.`),
      ),
    activeProfileListId: z.uuid(),
    defaultProfileListId: z.uuid(),
    settings: settingsSchema,
  })
  .check(
    z.refine((state) => {
      const listIds = new Set(state.profileLists.map(({ id }) => id));
      return (
        listIds.has(state.activeProfileListId) &&
        listIds.has(state.defaultProfileListId) &&
        state.profiles.every(({ listId }) => listIds.has(listId))
      );
    }, 'Profile list references are invalid.'),
    z.refine(
      (state) => new Set(state.profileLists.map(({ id }) => id)).size === state.profileLists.length,
      'Profile list IDs must be unique.',
    ),
    z.refine(
      (state) =>
        new Set(state.profileLists.map(({ name }) => name.trim().toLowerCase())).size ===
        state.profileLists.length,
      'Profile list names must be unique.',
    ),
    z.refine(
      (state) => new Set(state.profiles.map(({ id }) => id)).size === state.profiles.length,
      'Profile IDs must be unique.',
    ),
    z.refine(
      (state) =>
        new Set(state.profiles.map((profile) => `${profile.listId}|${profileIdentity(profile)}`))
          .size === state.profiles.length,
      'Duplicate profile targets are not allowed in the same list.',
    ),
  );

export type Environment = z.infer<typeof environmentSchema>;
export type Partition = z.infer<typeof partitionSchema>;
export type ProfileColorId = (typeof PROFILE_COLOR_IDS)[number];
export type ProfileDraft = z.infer<typeof profileDraftSchema>;
export type RoleProfileDraft = z.infer<typeof roleProfileDraftSchema>;
export type SsoProfileDraft = z.infer<typeof ssoProfileDraftSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type ProfileList = z.infer<typeof profileListSchema>;
export type AppSettings = z.infer<typeof settingsSchema>;
export type AppState = z.infer<typeof appStateSchema>;

export function createDefaultState(): AppState {
  return {
    version: 4,
    profiles: [],
    profileLists: [{ id: DEFAULT_PROFILE_LIST_ID, name: 'Default' }],
    activeProfileListId: DEFAULT_PROFILE_LIST_ID,
    defaultProfileListId: DEFAULT_PROFILE_LIST_ID,
    settings: {
      accessMode: 'unset',
      theme: 'system',
      language: 'system',
      openBehavior: 'current',
      confirmProduction: false,
      hideAccountIds: false,
    },
  };
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();

  return tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      if (!tag) return false;
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeProfileDraft(draft: ProfileDraft): ProfileDraft {
  const normalized = {
    ...draft,
    name: draft.name.trim(),
    accountId: draft.accountId.trim(),
    roleName: draft.roleName.trim(),
    tags: normalizeTags(draft.tags),
    ...(draft.type === 'sso' ? { portalUrl: normalizePortalUrl(draft.portalUrl) } : {}),
    ...(draft.region ? { region: draft.region.trim().toLowerCase() } : {}),
  };

  return profileDraftSchema.parse(normalized);
}

export function createProfile(
  draft: ProfileDraft,
  listId = DEFAULT_PROFILE_LIST_ID,
  colorId: ProfileColorId = PROFILE_COLOR_IDS[0],
): Profile {
  const now = new Date().toISOString();
  return profileSchema.parse({
    ...normalizeProfileDraft(draft),
    id: crypto.randomUUID(),
    listId,
    colorId,
    createdAt: now,
    updatedAt: now,
  });
}

export function updateProfileRecord(
  existing: Profile,
  draft: ProfileDraft,
  colorId: ProfileColorId = draft.colorId ?? existing.colorId,
): Profile {
  return profileSchema.parse({
    ...normalizeProfileDraft(draft),
    id: existing.id,
    listId: existing.listId,
    colorId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    ...(existing.lastUsedAt ? { lastUsedAt: existing.lastUsedAt } : {}),
  });
}

export function profileIdentity(profile: Profile | ProfileDraft): string {
  // The trailing qualifier is the dimension that makes two otherwise identical
  // account/role pairs genuinely different sign-in targets: the AWS partition
  // for IAM roles, the access portal for Identity Center.
  const qualifier =
    profile.type === 'sso' ? normalizePortalUrl(profile.portalUrl) : profile.partition;
  return `${profile.type}|${profile.accountId.toLowerCase()}|${profile.roleName.toLowerCase()}|${qualifier}`;
}

export function sortProfiles(profiles: Profile[]): Profile[] {
  return [...profiles].sort((left, right) => {
    if (left.favorite !== right.favorite) return left.favorite ? -1 : 1;

    const lastUsedDifference =
      (right.lastUsedAt ? Date.parse(right.lastUsedAt) : 0) -
      (left.lastUsedAt ? Date.parse(left.lastUsedAt) : 0);
    if (lastUsedDifference !== 0) return lastUsedDifference;

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

export function inferEnvironment(value: string): Environment {
  const normalized = value.toLowerCase();
  if (/(^|[\s_-])(prod|production)([\s_-]|$)/.test(normalized)) return 'production';
  if (/(^|[\s_-])(stage|staging|stg)([\s_-]|$)/.test(normalized)) return 'staging';
  if (/(^|[\s_-])(dev|development)([\s_-]|$)/.test(normalized)) return 'development';
  if (/(^|[\s_-])(sandbox|sbx|test)([\s_-]|$)/.test(normalized)) return 'sandbox';
  if (/(^|[\s_-])(shared|management|security)([\s_-]|$)/.test(normalized)) return 'shared';
  return 'other';
}

export function normalizePortalUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, url.pathname === '/' ? '/' : '');
}
