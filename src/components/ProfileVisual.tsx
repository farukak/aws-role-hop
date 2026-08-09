import type { CSSProperties } from 'react';
import { getProfileColor } from '../domain/colors';
import {
  ENVIRONMENT_OPTIONS,
  type Environment,
  type Profile,
  type ProfileColorId,
} from '../domain/profile';
import { useI18n } from '../i18n';

interface ProfileLike {
  name: string;
  accountId: string;
  environment: Environment;
  colorId?: ProfileColorId | undefined;
}

type ToneStyle = CSSProperties & {
  '--profile-surface-light': string;
  '--profile-border-light': string;
  '--profile-accent-light': string;
  '--profile-text-light': string;
  '--profile-surface-dark': string;
  '--profile-border-dark': string;
  '--profile-accent-dark': string;
  '--profile-text-dark': string;
};

export function getProfileToneStyle(profile: ProfileLike): ToneStyle {
  const color = getProfileColor(profile);
  return {
    '--profile-surface-light': color.light.surface,
    '--profile-border-light': color.light.border,
    '--profile-accent-light': color.light.accent,
    '--profile-text-light': color.light.text,
    '--profile-surface-dark': color.dark.surface,
    '--profile-border-dark': color.dark.border,
    '--profile-accent-dark': color.dark.accent,
    '--profile-text-dark': color.dark.text,
  };
}

export function ProfileAvatar({ profile }: { profile: ProfileLike }) {
  return (
    <span
      className="profile-avatar profile-tone"
      style={getProfileToneStyle(profile)}
      aria-hidden="true"
    >
      {getInitials(profile.name)}
    </span>
  );
}

export function EnvironmentBadge({ profile }: { profile: ProfileLike }) {
  const { t } = useI18n();
  const label =
    ENVIRONMENT_OPTIONS.find((option) => option.value === profile.environment)?.label ?? 'Other';
  return (
    <span className="environment-badge profile-tone" style={getProfileToneStyle(profile)}>
      {t(label)}
    </span>
  );
}

export function ProfileTypeBadge({ type }: { type: Profile['type'] }) {
  return <span className="type-badge">{type === 'sso' ? 'SSO' : 'IAM'}</span>;
}

export function formatAccountId(accountId: string, hidden: boolean): string {
  if (hidden) return `•••• ${accountId.slice(-4)}`;
  if (/^\d{12}$/.test(accountId)) return accountId.replace(/(\d{4})(?=\d)/g, '$1 ');
  return accountId;
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (parts.length === 0) return 'RH';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
}
