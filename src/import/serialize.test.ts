import { describe, expect, it } from 'vitest';
import { serializeProfilesToAwsConfig } from './serialize';
import { parseAwsConfig } from './aws-config';
import { profileSchema, type Profile } from '../domain/profile';

const ISO = '2026-01-01T00:00:00.000Z';
const LIST_ID = '00000000-0000-4000-8000-000000000001';

const STORED = {
  environment: 'production',
  favorite: false,
  tags: [],
  listId: LIST_ID,
  colorId: 'rose',
  createdAt: ISO,
  updatedAt: ISO,
};

function profile(overrides: Record<string, unknown> = {}): Profile {
  return profileSchema.parse({
    type: 'role',
    name: 'Core Production',
    accountId: '024314596708',
    roleName: 'OrganizationAccountAccessRole',
    partition: 'aws',
    id: crypto.randomUUID(),
    ...STORED,
    ...overrides,
  });
}

/** Identity Center profiles carry a portal instead of a partition. */
function ssoProfile(overrides: Record<string, unknown> = {}): Profile {
  return profileSchema.parse({
    type: 'sso',
    name: 'Platform',
    accountId: '024314596708',
    roleName: 'PlatformAccess',
    portalUrl: 'https://corp.awsapps.com/start',
    id: crypto.randomUUID(),
    ...STORED,
    ...overrides,
  });
}

describe('serializeProfilesToAwsConfig', () => {
  it('returns nothing for an empty list', () => {
    expect(serializeProfilesToAwsConfig([])).toBe('');
  });

  it('round-trips an IAM role profile through the importer', () => {
    const original = profile({ region: 'eu-west-1', favorite: true, tags: ['platform', 'core'] });

    const parsed = parseAwsConfig(serializeProfilesToAwsConfig([original]));

    expect(parsed.issues).toEqual([]);
    expect(parsed.profiles).toHaveLength(1);
    expect(parsed.profiles[0]).toMatchObject({
      type: 'role',
      name: 'Core Production',
      accountId: '024314596708',
      roleName: 'OrganizationAccountAccessRole',
      partition: 'aws',
      region: 'eu-west-1',
      favorite: true,
      tags: ['platform', 'core'],
    });
  });

  it('keeps a non-default partition', () => {
    const text = serializeProfilesToAwsConfig([profile({ partition: 'aws-cn' })]);
    expect(text).toContain('partition = aws-cn');
    expect(parseAwsConfig(text).profiles[0]).toMatchObject({ partition: 'aws-cn' });
  });

  it('round-trips Identity Center profiles sharing one access portal', () => {
    const text = serializeProfilesToAwsConfig([
      ssoProfile(),
      ssoProfile({ name: 'Audit', accountId: '891377166946', roleName: 'AuditAccess' }),
    ]);

    // One session block is enough for both profiles on the same portal.
    expect(text.match(/\[sso-session /g)).toHaveLength(1);
    expect(text).toContain('[sso-session corp]');
    const parsed = parseAwsConfig(text);
    expect(parsed.issues).toEqual([]);
    expect(parsed.profiles.map((entry) => entry.name)).toEqual(['Platform', 'Audit']);
    expect(parsed.profiles[0]).toMatchObject({
      type: 'sso',
      portalUrl: 'https://corp.awsapps.com/start',
      roleName: 'PlatformAccess',
      accountId: '024314596708',
    });
  });

  it('gives each distinct access portal its own session block', () => {
    const text = serializeProfilesToAwsConfig([
      ssoProfile(),
      ssoProfile({ name: 'Partner', portalUrl: 'https://partner.awsapps.com/start' }),
    ]);

    expect(text.match(/\[sso-session /g)).toHaveLength(2);
    expect(parseAwsConfig(text).profiles).toHaveLength(2);
  });
});
