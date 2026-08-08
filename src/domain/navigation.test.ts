import { describe, expect, it } from 'vitest';
import { buildProfileUrl } from './navigation';
import { profileSchema, type Profile } from './profile';

const ISO = '2026-01-01T00:00:00.000Z';

function profile(overrides: Record<string, unknown>): Profile {
  return profileSchema.parse({
    type: 'role',
    name: 'Production read-only',
    accountId: '123456789012',
    roleName: 'team/ReadOnlyRole',
    partition: 'aws',
    environment: 'production',
    favorite: false,
    tags: [],
    id: crypto.randomUUID(),
    listId: '00000000-0000-4000-8000-000000000001',
    colorId: 'rose',
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  });
}

describe('buildProfileUrl — IAM role profiles', () => {
  it.each([
    ['aws', 'signin.aws.amazon.com'],
    ['aws-us-gov', 'signin.amazonaws-us-gov.com'],
    ['aws-cn', 'signin.amazonaws.cn'],
  ])('uses the global partition switch-role endpoint for %s', (partition, signinHost) => {
    const url = new URL(buildProfileUrl(profile({ partition })));
    expect(url.protocol).toBe('https:');
    expect(url.host).toBe(signinHost);
    expect(url.pathname).toBe('/switchrole');
  });

  it('keeps account, role, display name, color, and region out of the endpoint URL', () => {
    const url = new URL(
      buildProfileUrl(
        profile({
          accountId: 'acme-production',
          name: 'Prod & Ops #1',
          region: 'eu-west-1',
        }),
      ),
    );
    expect([...url.searchParams]).toEqual([]);
    expect(url.hash).toBe('');
  });

  it('never carries profile data into the endpoint URL', () => {
    const url = new URL(
      buildProfileUrl(profile({ tags: ['platform'], environment: 'production' })),
    );
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });
});

describe('buildProfileUrl — Identity Center profiles', () => {
  function ssoProfile(overrides: Record<string, unknown> = {}): Profile {
    return profileSchema.parse({
      type: 'sso',
      name: 'Platform',
      accountId: '123456789012',
      roleName: 'PlatformAccess',
      portalUrl: 'https://example.awsapps.com/start',
      environment: 'shared',
      favorite: false,
      tags: [],
      id: crypto.randomUUID(),
      listId: '00000000-0000-4000-8000-000000000001',
      colorId: 'rose',
      createdAt: ISO,
      updatedAt: ISO,
      ...overrides,
    });
  }

  it('builds a shortcut link on the portal origin', () => {
    expect(buildProfileUrl(ssoProfile())).toBe(
      'https://example.awsapps.com/start/#/console?account_id=123456789012&role_name=PlatformAccess',
    );
  });

  it('keeps a nested portal path', () => {
    expect(buildProfileUrl(ssoProfile({ portalUrl: 'https://example.app.aws/start' }))).toBe(
      'https://example.app.aws/start/#/console?account_id=123456789012&role_name=PlatformAccess',
    );
  });

  it('adds a console destination when a landing region is set', () => {
    const url = buildProfileUrl(ssoProfile({ region: 'eu-west-1' }));
    const destination = new URLSearchParams(url.split('?')[1]).get('destination');
    expect(destination).toBe(
      'https://eu-west-1.console.aws.amazon.com/console/home?region=eu-west-1',
    );
  });

  it.each([
    ['eu-west-1', 'https://eu-west-1.console.aws.amazon.com/console/home?region=eu-west-1'],
    ['cn-north-1', 'https://cn-north-1.console.amazonaws.cn/console/home?region=cn-north-1'],
    [
      'us-gov-west-1',
      'https://us-gov-west-1.console.amazonaws-us-gov.com/console/home?region=us-gov-west-1',
    ],
  ])('routes %s to the right console root domain', (region, expected) => {
    const url = buildProfileUrl(ssoProfile({ region }));
    expect(new URLSearchParams(url.split('?')[1]).get('destination')).toBe(expected);
  });

  it('omits the destination when no region is set', () => {
    expect(buildProfileUrl(ssoProfile())).not.toContain('destination');
  });

  it('only ever produces an HTTPS Identity Center destination', () => {
    for (const candidate of [ssoProfile(), ssoProfile({ region: 'eu-west-1' })]) {
      expect(buildProfileUrl(candidate).startsWith('https://')).toBe(true);
    }
  });
});
