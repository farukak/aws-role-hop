import { getProfileColor } from './colors';
import type { Partition, Profile, RoleProfileDraft } from './profile';

export const ROLE_SWITCH_MESSAGE_TYPE = 'rolehop:switch-role';
export const ROLE_SWITCH_READY_MESSAGE_TYPE = 'rolehop:switch-ready';

export interface RoleSwitchRequest {
  type: typeof ROLE_SWITCH_MESSAGE_TYPE;
  account: string;
  roleName: string;
  displayName: string;
  color: string;
  partition: Partition;
  region?: string;
}

export interface RoleSwitchResult {
  ok: boolean;
  error?: string;
}

const SWITCH_ROLE_DOMAINS: Record<Partition, string> = {
  aws: 'signin.aws.amazon.com',
  'aws-us-gov': 'signin.amazonaws-us-gov.com',
  'aws-cn': 'signin.amazonaws.cn',
};

export function buildRoleSwitchUrl(profile: RoleProfileDraft): string {
  return `https://${SWITCH_ROLE_DOMAINS[profile.partition]}/switchrole`;
}

export function buildRoleSwitchRequest(
  profile: Extract<Profile, { type: 'role' }>,
): RoleSwitchRequest {
  const color = getProfileColor(profile).light.accent.replace(/^#/, '').toLowerCase();
  const base = {
    type: ROLE_SWITCH_MESSAGE_TYPE,
    account: profile.accountId,
    roleName: profile.roleName,
    displayName: profile.name,
    color,
    partition: profile.partition,
  } satisfies Omit<RoleSwitchRequest, 'region'>;

  return profile.region ? { ...base, region: profile.region } : base;
}

export function isRoleSwitchRequest(value: unknown): value is RoleSwitchRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === ROLE_SWITCH_MESSAGE_TYPE &&
    typeof candidate.account === 'string' &&
    candidate.account.length > 0 &&
    typeof candidate.roleName === 'string' &&
    candidate.roleName.length > 0 &&
    typeof candidate.displayName === 'string' &&
    candidate.displayName.length > 0 &&
    typeof candidate.color === 'string' &&
    /^[0-9a-f]{6}$/i.test(candidate.color) &&
    (candidate.partition === 'aws' ||
      candidate.partition === 'aws-us-gov' ||
      candidate.partition === 'aws-cn') &&
    (candidate.region === undefined ||
      (typeof candidate.region === 'string' && candidate.region.length > 0))
  );
}

export function isRoleSwitchResult(value: unknown): value is RoleSwitchResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.ok === 'boolean' &&
    (candidate.error === undefined || typeof candidate.error === 'string')
  );
}
