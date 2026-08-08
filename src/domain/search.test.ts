import { describe, expect, it } from 'vitest';
import { createProfile, profileDraftSchema, type Profile } from './profile';
import { searchProfiles } from './search';

function profile(name: string, overrides: Record<string, unknown> = {}): Profile {
  return createProfile(
    profileDraftSchema.parse({
      type: 'role',
      name,
      accountId: '123456789012',
      roleName: 'ReadOnlyAccess',
      partition: 'aws',
      environment: 'other',
      favorite: false,
      tags: [],
      ...overrides,
    }),
  );
}

const profiles = [
  profile('Production admin', {
    accountId: '111111111111',
    roleName: 'AdministratorAccess',
    environment: 'production',
  }),
  profile('Platform sandbox', {
    accountId: '222222222222',
    roleName: 'DeveloperRole',
    environment: 'sandbox',
    tags: ['payments', 'engineering'],
  }),
  profile('Staging audit', {
    accountId: '333333333333',
    roleName: 'SecurityAudit',
    environment: 'staging',
  }),
];

describe('searchProfiles', () => {
  it('returns the existing order for a blank query', () => {
    expect(searchProfiles(profiles, '  ')).toEqual(profiles);
  });

  it.each([
    ['profile name', 'platform', 'Platform sandbox'],
    ['account ID', '333333333333', 'Staging audit'],
    ['role name', 'developer', 'Platform sandbox'],
    ['environment', 'production', 'Production admin'],
    ['tag', 'payments', 'Platform sandbox'],
  ])('matches a %s', (_label, query, expected) => {
    expect(searchProfiles(profiles, query).map(({ name }) => name)).toEqual([expected]);
  });

  it('supports subsequence matches without a fuzzy-search dependency', () => {
    expect(searchProfiles(profiles, 'prd adm').map(({ name }) => name)).toEqual([
      'Production admin',
    ]);
  });

  it('requires every query token to match', () => {
    expect(searchProfiles(profiles, 'platform audit')).toEqual([]);
  });

  it('ranks an exact name ahead of a weaker match', () => {
    const exact = profile('Admin');
    const weaker = profile('Production admin', { accountId: '444444444444' });
    expect(searchProfiles([weaker, exact], 'admin')).toEqual([exact, weaker]);
  });

  it('keeps input order when scores tie', () => {
    const first = profile('Alpha dev', { accountId: '555555555555' });
    const second = profile('Gamma dev', { accountId: '666666666666' });
    expect(searchProfiles([first, second], 'dev')).toEqual([first, second]);
  });

  it('matches diacritic-insensitively', () => {
    const turkish = profile('Üretim yönetimi');
    expect(searchProfiles([turkish], 'uretim')).toEqual([turkish]);
  });
});
