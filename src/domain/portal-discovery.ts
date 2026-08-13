import * as z from 'zod/mini';
import {
  inferEnvironment,
  isAllowedPortalUrl,
  profileDraftSchema,
  type ProfileDraft,
} from './profile';

/** One account the access portal offers, with the id its permission sets are listed under. */
export interface PortalAccount {
  instanceId: string;
  accountId: string;
  accountName: string;
}

export interface PortalPage<T> {
  items: T[];
  nextToken: string | null;
}

export interface DiscoveredRole {
  account: PortalAccount;
  roleName: string;
}

const portalListSchema = z.object({
  result: z.array(z.unknown()),
  // The portal has answered with more than one name for the same cursor.
  paginationToken: z.optional(z.nullable(z.string())),
  nextToken: z.optional(z.nullable(z.string())),
  next_token: z.optional(z.nullable(z.string())),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The portal reports the end of a list as a missing token. It has also been seen
 * answering with the literal string, so both are treated as "no more pages".
 */
function normalizeToken(token: string | null | undefined): string | null {
  if (typeof token !== 'string') return null;
  const trimmed = token.trim();
  return trimmed === '' || trimmed === 'null' ? null : trimmed;
}

function readPage(payload: unknown): PortalPage<Record<string, unknown>> {
  const parsed = portalListSchema.safeParse(payload);
  if (!parsed.success) return { items: [], nextToken: null };
  const { paginationToken, nextToken, next_token: snakeToken } = parsed.data;
  return {
    items: parsed.data.result.filter(isRecord),
    nextToken: normalizeToken(paginationToken ?? nextToken ?? snakeToken),
  };
}

/** Only the portal hosts the profile schema already trusts may be reached. */
function portalOrigin(portalUrl: string): string {
  if (!isAllowedPortalUrl(portalUrl)) {
    throw new Error('Refusing to reach a URL that is not an AWS access portal.');
  }
  return new URL(portalUrl).origin;
}

export function buildPortalAccountsEndpoint(portalUrl: string): string {
  return `${portalOrigin(portalUrl)}/api/portal/instance/appinstances`;
}

export function buildPortalRolesEndpoint(portalUrl: string, instanceId: string): string {
  const id = encodeURIComponent(instanceId);
  return `${portalOrigin(portalUrl)}/api/portal/instance/appinstance/${id}/profiles`;
}

export function portalOriginPattern(portalUrl: string): string {
  return `${portalOrigin(portalUrl)}/*`;
}

export function parsePortalAccounts(payload: unknown): PortalPage<PortalAccount> {
  const page = readPage(payload);
  const accounts: PortalAccount[] = [];

  for (const item of page.items) {
    const metadata = isRecord(item.searchMetadata) ? item.searchMetadata : {};
    const instanceId = typeof item.id === 'string' ? item.id.trim() : '';
    const accountId = typeof metadata.AccountId === 'string' ? metadata.AccountId.trim() : '';
    const metadataName =
      typeof metadata.AccountName === 'string' ? metadata.AccountName.trim() : '';
    const applicationName = typeof item.name === 'string' ? item.name.trim() : '';

    // An entry without an instance id cannot be asked for roles, and an entry
    // without a real account id cannot become a profile.
    if (instanceId === '' || !/^\d{12}$/.test(accountId)) continue;

    accounts.push({
      instanceId,
      accountId,
      accountName: metadataName || applicationName || accountId,
    });
  }

  return { items: accounts, nextToken: page.nextToken };
}

export function parsePortalRoles(payload: unknown): PortalPage<string> {
  const page = readPage(payload);
  const names = page.items
    .map((item) => (typeof item.name === 'string' ? item.name.trim() : ''))
    .filter((name) => name !== '');
  return { items: names, nextToken: page.nextToken };
}

export interface DiscoveryDraftResult {
  drafts: ProfileDraft[];
  skipped: number;
}

/**
 * Turns what the portal reported into Identity Center drafts. The account name
 * carries the environment the same way an imported profile name does.
 */
export function discoveredRolesToDrafts(
  discovered: DiscoveredRole[],
  portalUrl: string,
): DiscoveryDraftResult {
  const drafts: ProfileDraft[] = [];
  let skipped = 0;

  for (const { account, roleName } of discovered) {
    const result = profileDraftSchema.safeParse({
      type: 'sso',
      name: account.accountName.slice(0, 48),
      accountId: account.accountId,
      roleName,
      portalUrl,
      environment: inferEnvironment(account.accountName),
      favorite: false,
      tags: [],
    });

    if (result.success) drafts.push(result.data);
    else skipped += 1;
  }

  return { drafts, skipped };
}
