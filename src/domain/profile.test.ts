import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_LIST_ID,
  PROFILE_LIMIT,
  appStateSchema,
  createDefaultState,
  createProfile,
  inferEnvironment,
  normalizePortalUrl,
  normalizeProfileDraft,
  profileDraftSchema,
  profileIdentity,
  profileSchema,
  settingsSchema,
  sortProfiles,
  updateProfileRecord,
  type Profile,
  type ProfileDraft,
} from './profile';

const ISO = '2026-01-01T00:00:00.000Z';

function roleDraft(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: 'role',
    name: 'Production read-only',
    accountId: '123456789012',
    roleName: 'team/ReadOnlyRole',
    partition: 'aws',
    environment: 'production',
    favorite: false,
    tags: [],
    ...overrides,
  };
}

function ssoDraft(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: 'sso',
    name: 'Platform',
    accountId: '123456789012',
    roleName: 'PlatformAccess',
    portalUrl: 'https://example.awsapps.com/start',
    environment: 'shared',
    favorite: false,
    tags: [],
    ...overrides,
  };
}

function makeProfile(overrides: Record<string, unknown> = {}): Profile {
  return profileSchema.parse({
    ...(roleDraft() as Record<string, unknown>),
    id: crypto.randomUUID(),
    listId: DEFAULT_PROFILE_LIST_ID,
    colorId: 'rose',
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  });
}

function firstIssuePath(value: unknown): (string | number | symbol)[] {
  const result = profileDraftSchema.safeParse(value);
  if (result.success) throw new Error('Expected the draft to be rejected.');
  return result.error.issues.flatMap((issue) => issue.path);
}

describe('profileDraftSchema — IAM role profiles', () => {
  it('accepts a 12-digit account ID', () => {
    expect(profileDraftSchema.safeParse(roleDraft()).success).toBe(true);
  });

  it('accepts a lowercase account alias', () => {
    expect(profileDraftSchema.safeParse(roleDraft({ accountId: 'my-company-prod' })).success).toBe(
      true,
    );
  });

  it.each([
    ['too short', '12'],
    ['11-digit numeric value', '12345678901'],
    ['13-digit numeric value', '1234567890123'],
    ['uppercase', 'My-Alias'],
    ['leading hyphen', '-alias'],
    ['trailing hyphen', 'alias-'],
    ['underscore', 'my_alias'],
    ['dot', 'my.alias'],
    ['64 characters', 'a'.repeat(64)],
  ])('rejects an invalid account identifier (%s)', (_label, accountId) => {
    expect(firstIssuePath(roleDraft({ accountId }))).toContain('accountId');
  });

  it.each([
    ['empty path segment', 'team//Role'],
    ['leading empty path segment', '/team/Role'],
    ['trailing empty path segment', 'team/Role/'],
    ['whitespace', 'bad role'],
    ['disallowed character', 'role$name'],
    ['too long', 'a'.repeat(65)],
    ['empty', ''],
  ])('rejects an invalid role name (%s)', (_label, roleName) => {
    expect(firstIssuePath(roleDraft({ roleName }))).toContain('roleName');
  });

  it('accepts a role path', () => {
    expect(profileDraftSchema.safeParse(roleDraft({ roleName: 'team/sub/Role' })).success).toBe(
      true,
    );
  });

  it('enforces the 48-character name limit after trimming', () => {
    expect(profileDraftSchema.safeParse(roleDraft({ name: `  ${'a'.repeat(48)}  ` })).success).toBe(
      true,
    );
    expect(firstIssuePath(roleDraft({ name: 'a'.repeat(49) }))).toContain('name');
  });

  it('rejects a blank or multi-line name', () => {
    expect(firstIssuePath(roleDraft({ name: '   ' }))).toContain('name');
    expect(firstIssuePath(roleDraft({ name: 'Production\nAdmin' }))).toContain('name');
  });

  it('allows at most 8 tags', () => {
    const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(profileDraftSchema.safeParse(roleDraft({ tags })).success).toBe(true);
    expect(firstIssuePath(roleDraft({ tags: [...tags, 'i'] }))).toContain('tags');
  });

  it('rejects a tag longer than 24 characters', () => {
    expect(firstIssuePath(roleDraft({ tags: ['a'.repeat(25)] }))).toContain('tags');
  });

  it('rejects unknown keys (strict object)', () => {
    expect(
      profileDraftSchema.safeParse(roleDraft({ credential_process: 'EXAMPLE_COMMAND_NOT_STORED' }))
        .success,
    ).toBe(false);
  });

  it.each(['aws', 'aws-us-gov', 'aws-cn'])('accepts the %s partition', (partition) => {
    expect(profileDraftSchema.safeParse(roleDraft({ partition })).success).toBe(true);
  });

  it('accepts and normalizes an optional IAM landing region', () => {
    const result = profileDraftSchema.safeParse(roleDraft({ region: ' EU-WEST-1 ' }));
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'role') {
      expect(result.data.region).toBe('eu-west-1');
    }
  });

  it('rejects an invalid IAM landing region', () => {
    expect(firstIssuePath(roleDraft({ region: 'eu-west' }))).toContain('region');
  });

  it('accepts a supported optional profile color and rejects unknown colors', () => {
    const selected = profileDraftSchema.safeParse(roleDraft({ colorId: 'lilac' }));
    expect(selected.success).toBe(true);
    if (selected.success) expect(selected.data.colorId).toBe('lilac');
    expect(firstIssuePath(roleDraft({ colorId: 'chartreuse' }))).toContain('colorId');
  });

  it('rejects an unknown partition', () => {
    expect(firstIssuePath(roleDraft({ partition: 'aws-iso' }))).toContain('partition');
  });
});

describe('profileDraftSchema — Identity Center profiles', () => {
  it('accepts a valid Identity Center profile', () => {
    expect(profileDraftSchema.safeParse(ssoDraft()).success).toBe(true);
  });

  it('requires a 12-digit account ID and rejects aliases', () => {
    expect(firstIssuePath(ssoDraft({ accountId: 'my-alias' }))).toContain('accountId');
  });

  it.each([
    ['https://example.awsapps.com/start'],
    ['https://example.awsapps.cn/start'],
    ['https://example.app.aws/start'],
  ])('accepts the allowed portal host %s', (portalUrl) => {
    expect(profileDraftSchema.safeParse(ssoDraft({ portalUrl })).success).toBe(true);
  });

  it.each([
    ['plain http', 'http://example.awsapps.com/start'],
    ['unrelated host', 'https://example.com/start'],
    ['suffix spoofing', 'https://example.awsapps.com.evil.test/start'],
    ['host without the required dot', 'https://notawsapps.com/start'],
    [
      'embedded credentials',
      'https://placeholder-user:placeholder-password@example.awsapps.com/start',
    ],
    ['explicit port', 'https://example.awsapps.com:8443/start'],
    ['wrong AWS path', 'https://example.awsapps.com/not-start'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['not a URL', 'example.awsapps.com'],
  ])('rejects a disallowed portal URL (%s)', (_label, portalUrl) => {
    expect(firstIssuePath(ssoDraft({ portalUrl }))).toContain('portalUrl');
  });

  it('treats the landing region as optional', () => {
    expect(profileDraftSchema.safeParse(ssoDraft()).success).toBe(true);
    expect(profileDraftSchema.safeParse(ssoDraft({ region: 'eu-west-1' })).success).toBe(true);
    expect(profileDraftSchema.safeParse(ssoDraft({ region: 'us-gov-west-1' })).success).toBe(true);
  });

  it('normalizes an uppercase region instead of rejecting it', () => {
    const result = profileDraftSchema.safeParse(ssoDraft({ region: 'EU-WEST-1' }));
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'sso') {
      expect(result.data.region).toBe('eu-west-1');
    }
  });

  it.each([
    ['missing numeric suffix', 'eu-west'],
    ['single segment', 'euwest1'],
    ['trailing hyphen', 'eu-west-'],
  ])('rejects an invalid region (%s)', (_label, region) => {
    expect(firstIssuePath(ssoDraft({ region }))).toContain('region');
  });
});

describe('normalizeProfileDraft', () => {
  it('trims the name, account ID and role name', () => {
    const draft = normalizeProfileDraft(
      profileDraftSchema.parse(
        roleDraft({ name: '  Prod  ', accountId: ' 123456789012 ', roleName: '  Role  ' }),
      ),
    );
    expect(draft.name).toBe('Prod');
    expect(draft.accountId).toBe('123456789012');
    expect(draft.roleName).toBe('Role');
  });

  it('removes blank and case-insensitive duplicate tags while preserving order', () => {
    const draft = normalizeProfileDraft(
      profileDraftSchema.parse(
        roleDraft({ tags: [' platform ', 'PLATFORM', 'I', 'i', 'payments'] }),
      ),
    );
    expect(draft.tags).toEqual(['platform', 'I', 'payments']);
  });

  it('lowercases the region and normalizes the portal URL', () => {
    const draft = normalizeProfileDraft(
      profileDraftSchema.parse(
        ssoDraft({ portalUrl: 'https://example.awsapps.com/start/?x=1#y', region: ' EU-WEST-1 ' }),
      ),
    );
    if (draft.type !== 'sso') throw new Error('Expected an Identity Center draft.');
    expect(draft.portalUrl).toBe('https://example.awsapps.com/start');
    expect(draft.region).toBe('eu-west-1');
  });
});

describe('normalizePortalUrl', () => {
  it.each([
    ['https://example.awsapps.com/start/', 'https://example.awsapps.com/start'],
    ['https://example.awsapps.com/start?token=abc', 'https://example.awsapps.com/start'],
    ['https://example.awsapps.com/start#/console', 'https://example.awsapps.com/start'],
    ['  https://example.awsapps.com/start///  ', 'https://example.awsapps.com/start'],
    ['https://example.awsapps.com/', 'https://example.awsapps.com/'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePortalUrl(input)).toBe(expected);
  });

  it('drops query strings that could carry a token', () => {
    expect(
      normalizePortalUrl('https://example.awsapps.com/start?access_token=secret'),
    ).not.toContain('secret');
  });
});

describe('profileIdentity', () => {
  it('is case-insensitive on the role name', () => {
    const left = profileDraftSchema.parse(roleDraft({ roleName: 'Team/ReadOnly' }));
    const right = profileDraftSchema.parse(roleDraft({ roleName: 'team/readonly' }));
    expect(profileIdentity(left)).toBe(profileIdentity(right));
  });

  it('separates IAM role and Identity Center profiles with the same account and role', () => {
    const role = profileDraftSchema.parse(roleDraft({ roleName: 'Same' }));
    const sso = profileDraftSchema.parse(ssoDraft({ roleName: 'Same' }));
    expect(profileIdentity(role)).not.toBe(profileIdentity(sso));
  });

  it('includes the normalized portal URL for Identity Center profiles', () => {
    const withSlash = profileDraftSchema.parse(
      ssoDraft({ portalUrl: 'https://example.awsapps.com/start/' }),
    );
    const withoutSlash = profileDraftSchema.parse(
      ssoDraft({ portalUrl: 'https://example.awsapps.com/start' }),
    );
    expect(profileIdentity(withSlash)).toBe(profileIdentity(withoutSlash));
  });

  it('separates the same account and role in different partitions', () => {
    const commercial = profileDraftSchema.parse(roleDraft({ accountId: 'acme-prod' }));
    const govCloud = profileDraftSchema.parse(
      roleDraft({ accountId: 'acme-prod', partition: 'aws-us-gov' }),
    );
    expect(profileIdentity(commercial)).not.toBe(profileIdentity(govCloud));
  });

  it('separates the same account and role behind different access portals', () => {
    const first = profileDraftSchema.parse(ssoDraft());
    const second = profileDraftSchema.parse(
      ssoDraft({ portalUrl: 'https://other.awsapps.com/start' }),
    );
    expect(profileIdentity(first)).not.toBe(profileIdentity(second));
  });
});

describe('sortProfiles', () => {
  it('orders favorites first, then most recently used, then by name', () => {
    const profiles = [
      makeProfile({ name: 'Zulu' }),
      makeProfile({ name: 'Alpha' }),
      makeProfile({ name: 'Recent', lastUsedAt: '2026-02-01T00:00:00.000Z' }),
      makeProfile({ name: 'Favorite', favorite: true }),
    ];

    expect(sortProfiles(profiles).map((profile) => profile.name)).toEqual([
      'Favorite',
      'Recent',
      'Alpha',
      'Zulu',
    ]);
  });

  it('does not mutate the input array', () => {
    const profiles = [makeProfile({ name: 'Zulu' }), makeProfile({ name: 'Alpha' })];
    const snapshot = profiles.map((profile) => profile.name);
    sortProfiles(profiles);
    expect(profiles.map((profile) => profile.name)).toEqual(snapshot);
  });
});

describe('inferEnvironment', () => {
  it.each([
    ['prod', 'production'],
    ['acme-production', 'production'],
    ['Prod_Payments', 'production'],
    ['staging', 'staging'],
    ['acme-stg', 'staging'],
    ['dev', 'development'],
    ['acme-development', 'development'],
    ['sandbox', 'sandbox'],
    ['acme-test', 'sandbox'],
    ['shared', 'shared'],
    ['acme-management', 'shared'],
    ['acme-security', 'shared'],
    ['payments', 'other'],
    ['reproduction', 'other'],
    ['products', 'other'],
  ])('maps %s to %s', (value, expected) => {
    expect(inferEnvironment(value)).toBe(expected);
  });
});

describe('createProfile and updateProfileRecord', () => {
  it('creates a profile with a UUID and matching timestamps', () => {
    const profile = createProfile(profileDraftSchema.parse(roleDraft()) satisfies ProfileDraft);
    expect(profile.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(profile.createdAt).toBe(profile.updatedAt);
  });

  it('preserves the id, creation time and last-used time while bumping updatedAt', () => {
    const existing = makeProfile({ lastUsedAt: '2026-03-01T00:00:00.000Z' });
    const updated = updateProfileRecord(
      existing,
      profileDraftSchema.parse(roleDraft({ name: 'Renamed' })),
    );

    expect(updated.id).toBe(existing.id);
    expect(updated.createdAt).toBe(existing.createdAt);
    expect(updated.lastUsedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(updated.name).toBe('Renamed');
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(existing.updatedAt));
  });
});

describe('appStateSchema', () => {
  it('accepts the default state', () => {
    expect(appStateSchema.safeParse(createDefaultState()).success).toBe(true);
  });

  it('pins the schema version to 4', () => {
    expect(appStateSchema.safeParse({ ...createDefaultState(), version: 3 }).success).toBe(false);
    expect(appStateSchema.safeParse({ ...createDefaultState(), version: 5 }).success).toBe(false);
  });

  it('rejects dangling profile-list references', () => {
    expect(
      appStateSchema.safeParse({
        ...createDefaultState(),
        activeProfileListId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate list IDs and case-insensitive list names', () => {
    const state = createDefaultState();
    const original = state.profileLists[0]!;
    expect(
      appStateSchema.safeParse({
        ...state,
        profileLists: [original, { ...original, name: 'Other' }],
      }).success,
    ).toBe(false);
    expect(
      appStateSchema.safeParse({
        ...state,
        profileLists: [original, { id: crypto.randomUUID(), name: ' default ' }],
      }).success,
    ).toBe(false);
    expect(
      appStateSchema.safeParse({
        ...state,
        profileLists: [
          { ...original, name: 'I' },
          { id: crypto.randomUUID(), name: 'i' },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate profile IDs and duplicate targets within one list', () => {
    const first = makeProfile();
    expect(
      appStateSchema.safeParse({
        ...createDefaultState(),
        profiles: [first, { ...makeProfile({ roleName: 'Other' }), id: first.id }],
      }).success,
    ).toBe(false);
    expect(
      appStateSchema.safeParse({
        ...createDefaultState(),
        profiles: [first, makeProfile({ name: 'Same target, different label' })],
      }).success,
    ).toBe(false);
  });

  it('rejects unknown top-level keys', () => {
    expect(appStateSchema.safeParse({ ...createDefaultState(), extra: true }).success).toBe(false);
  });

  it(`rejects more than ${PROFILE_LIMIT} profiles`, () => {
    const profiles = Array.from({ length: PROFILE_LIMIT + 1 }, (_unused, index) =>
      makeProfile({ name: `Profile ${index}` }),
    );
    expect(appStateSchema.safeParse({ ...createDefaultState(), profiles }).success).toBe(false);
  });

  it('rejects unknown settings and invalid enum values', () => {
    expect(settingsSchema.safeParse({ ...createDefaultState().settings, extra: 1 }).success).toBe(
      false,
    );
    expect(
      settingsSchema.safeParse({ ...createDefaultState().settings, theme: 'sepia' }).success,
    ).toBe(false);
  });

  it('defaults to a single click, leaving the production confirmation opt-in', () => {
    expect(createDefaultState().settings.confirmProduction).toBe(false);
  });
});

describe('access mode setting', () => {
  it('starts unset so the first-run choice is still owed', () => {
    expect(createDefaultState().settings.accessMode).toBe('unset');
  });

  it.each(['unset', 'iam', 'sso'] as const)('accepts %s', (accessMode) => {
    const state = createDefaultState();
    const parsed = appStateSchema.safeParse({
      ...state,
      settings: { ...state.settings, accessMode },
    });
    expect(parsed.success).toBe(true);
  });

  it.each(['identity-center', '', 'IAM'])('rejects %s', (accessMode) => {
    const state = createDefaultState();
    const parsed = appStateSchema.safeParse({
      ...state,
      settings: { ...state.settings, accessMode },
    });
    expect(parsed.success).toBe(false);
  });
});
