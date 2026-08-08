import { describe, expect, it } from 'vitest';
import { buildRoleSwitchRequest, buildRoleSwitchUrl, isRoleSwitchRequest } from './role-handoff';
import { profileSchema, type Profile } from './profile';

const ISO = '2026-01-01T00:00:00.000Z';
type RoleProfile = Extract<Profile, { type: 'role' }>;

function profile(overrides: Record<string, unknown> = {}): RoleProfile {
  return profileSchema.parse({
    type: 'role',
    name: 'Production read-only',
    accountId: '123456789012',
    roleName: 'team/ReadOnlyRole',
    partition: 'aws',
    region: 'eu-west-1',
    environment: 'production',
    favorite: false,
    tags: ['platform'],
    id: crypto.randomUUID(),
    listId: '00000000-0000-4000-8000-000000000001',
    colorId: 'rose',
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  }) as RoleProfile;
}

describe('direct role switch request', () => {
  it.each([
    ['aws', 'signin.aws.amazon.com'],
    ['aws-us-gov', 'signin.amazonaws-us-gov.com'],
    ['aws-cn', 'signin.amazonaws.cn'],
  ] as const)('builds the partition-correct %s endpoint', (partition, host) => {
    expect(buildRoleSwitchUrl(profile({ partition }))).toBe(`https://${host}/switchrole`);
  });

  it('carries only the fields required by the AWS native switch contract', () => {
    const request = buildRoleSwitchRequest(profile());
    expect(request).toEqual({
      type: 'rolehop:switch-role',
      account: '123456789012',
      roleName: 'team/ReadOnlyRole',
      displayName: 'Production read-only',
      color: 'e98b9a',
      partition: 'aws',
      region: 'eu-west-1',
    });
    expect(isRoleSwitchRequest(request)).toBe(true);
    expect(JSON.stringify(request)).not.toMatch(/tags|favorite|listId|credentials|secret/i);
  });

  it('omits an absent landing region and rejects malformed or unsafe colors', () => {
    const request = buildRoleSwitchRequest(profile({ region: undefined }));
    expect(request).not.toHaveProperty('region');
    expect(isRoleSwitchRequest({ ...request, color: '#e98b9a' })).toBe(false);
    expect(isRoleSwitchRequest({ ...request, color: 'javascript:alert(1)' })).toBe(false);
    expect(isRoleSwitchRequest(null)).toBe(false);
  });
});
