import type { Profile } from '../domain/profile';

/**
 * Renders stored profiles back into AWS CLI config text using only the fields
 * the importer reads, so the result can be edited and imported again. Raw import
 * text is never kept; this is generated from the canonical profiles instead.
 *
 * Environment is deliberately absent: the importer infers it from the profile
 * name rather than reading a field.
 */
export function serializeProfilesToAwsConfig(profiles: Profile[]): string {
  const sessionNames = new Map<string, string>();
  const blocks: string[] = [];

  for (const profile of profiles) {
    const lines = [`[profile ${profile.name}]`];

    if (profile.type === 'sso') {
      lines.push(`sso_session = ${resolveSessionName(sessionNames, profile.portalUrl)}`);
      lines.push(`sso_account_id = ${profile.accountId}`);
      lines.push(`sso_role_name = ${profile.roleName}`);
    } else {
      lines.push(`aws_account_id = ${profile.accountId}`);
      lines.push(`role_name = ${profile.roleName}`);
      if (profile.partition !== 'aws') lines.push(`partition = ${profile.partition}`);
    }

    if (profile.region) lines.push(`region = ${profile.region}`);
    if (profile.favorite) lines.push('favorite = true');
    if (profile.tags.length > 0) lines.push(`tags = ${profile.tags.join(', ')}`);

    blocks.push(lines.join('\n'));
  }

  const sessionBlocks = [...sessionNames].map(
    ([portalUrl, name]) => `[sso-session ${name}]\nsso_start_url = ${portalUrl}`,
  );
  const document = [...sessionBlocks, ...blocks].join('\n\n');
  return document ? `${document}\n` : '';
}

/** Identity Center profiles share one session block per access portal. */
function resolveSessionName(sessionNames: Map<string, string>, portalUrl: string): string {
  const existing = sessionNames.get(portalUrl);
  if (existing) return existing;

  let label = 'sso';
  try {
    const [host] = new URL(portalUrl).hostname.split('.');
    if (host) label = host.replace(/[^a-z0-9-]/gi, '') || 'sso';
  } catch {
    // An unparsable portal still needs a usable section name.
  }

  const taken = new Set(sessionNames.values());
  let name = label;
  for (let suffix = 2; taken.has(name); suffix += 1) name = `${label}-${suffix}`;
  sessionNames.set(portalUrl, name);
  return name;
}
