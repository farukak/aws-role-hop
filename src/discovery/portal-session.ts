import { browser } from 'wxt/browser';
import {
  buildPortalAccountsEndpoint,
  buildPortalRolesEndpoint,
  discoveredRolesToDrafts,
  parsePortalAccounts,
  parsePortalRoles,
  portalOriginPattern,
  type DiscoveredRole,
  type PortalPage,
} from '../domain/portal-discovery';
import type { ProfileDraft } from '../domain/profile';

export const PORTAL_DISCOVERY_FAILURES = [
  'permissionDenied',
  'portalTabUnavailable',
  'unauthorized',
  'failed',
] as const;

export type PortalDiscoveryFailure = (typeof PORTAL_DISCOVERY_FAILURES)[number];

export class PortalDiscoveryError extends Error {
  readonly code: PortalDiscoveryFailure;

  constructor(code: PortalDiscoveryFailure, message: string) {
    super(message);
    this.name = 'PortalDiscoveryError';
    this.code = code;
  }
}

/** The portal answers a handful of pages at most; the cap only stops a runaway loop. */
const MAX_PAGES = 20;
const TAB_READY_TIMEOUT_MS = 15000;
const TAB_POLL_INTERVAL_MS = 250;

type PermissionsDescriptor = Parameters<typeof browser.permissions.contains>[0];

function accessRequest(portalUrl: string): PermissionsDescriptor {
  return { permissions: ['scripting'], origins: [portalOriginPattern(portalUrl)] };
}

export async function hasPortalAccess(portalUrl: string): Promise<boolean> {
  const granted: unknown = await browser.permissions.contains(accessRequest(portalUrl));
  return granted === true;
}

/** Must be called straight from a click: browsers only grant permissions on a gesture. */
export async function requestPortalAccess(portalUrl: string): Promise<boolean> {
  const granted: unknown = await browser.permissions.request(accessRequest(portalUrl));
  return granted === true;
}

/**
 * Runs inside the portal tab, so the request is same-origin and the browser
 * attaches the portal's own session cookie. AWS Role Hop never reads it.
 */
async function portalRequest(endpoint: string): Promise<{ status: number; payload: unknown }> {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'enable-pagination': 'true',
    },
    body: '{}',
  });

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    payload = null;
  }

  return { status: response.status, payload };
}

async function waitForTab(tabId: number): Promise<void> {
  const deadline = Date.now() + TAB_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const tab = await browser.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await new Promise((resolve) => setTimeout(resolve, TAB_POLL_INTERVAL_MS));
  }
  throw new PortalDiscoveryError('portalTabUnavailable', 'The access portal tab did not load.');
}

async function portalTabId(portalUrl: string): Promise<number> {
  const open = await browser.tabs.query({ url: portalOriginPattern(portalUrl) });
  const ready = open.find((tab) => typeof tab.id === 'number' && tab.status === 'complete');
  if (typeof ready?.id === 'number') return ready.id;

  const created = await browser.tabs.create({ url: portalUrl, active: false });
  if (typeof created.id !== 'number') {
    throw new PortalDiscoveryError(
      'portalTabUnavailable',
      'The access portal could not be opened.',
    );
  }
  await waitForTab(created.id);
  return created.id;
}

/**
 * Pagination is carried as a query parameter. The portal reports the token it
 * wants back, so nothing is sent until it asks for a next page.
 */
function withToken(endpoint: string, token: string | null): string {
  if (token === null) return endpoint;
  const url = new URL(endpoint);
  url.searchParams.set('pagination_token', token);
  return url.toString();
}

function readInjectionResult(injected: unknown): { status: number; payload: unknown } {
  const first = Array.isArray(injected) ? (injected[0] as unknown) : undefined;
  const result =
    typeof first === 'object' && first !== null
      ? (first as { result?: unknown }).result
      : undefined;

  if (typeof result === 'object' && result !== null && 'status' in result) {
    const { status, payload } = result as { status: unknown; payload?: unknown };
    if (typeof status === 'number') return { status, payload };
  }

  throw new PortalDiscoveryError('failed', 'The access portal tab returned nothing.');
}

/** One same-origin call against the portal. The tab-backed one is the real path. */
export type PortalTransport = (endpoint: string) => Promise<{ status: number; payload: unknown }>;

export async function openPortalTransport(portalUrl: string): Promise<PortalTransport> {
  const tabId = await portalTabId(portalUrl);
  return async (endpoint: string) => {
    const injected: unknown = await browser.scripting.executeScript({
      target: { tabId },
      args: [endpoint],
      func: portalRequest,
    });
    return readInjectionResult(injected);
  };
}

async function collect<T>(
  transport: PortalTransport,
  endpoint: string,
  parse: (payload: unknown) => PortalPage<T>,
): Promise<T[]> {
  const items: T[] = [];
  let token: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await transport(withToken(endpoint, token));
    if (answer.status === 401 || answer.status === 403) {
      throw new PortalDiscoveryError(
        'unauthorized',
        'The access portal did not accept the session.',
      );
    }
    if (answer.status < 200 || answer.status >= 300) {
      throw new PortalDiscoveryError('failed', `The access portal answered ${answer.status}.`);
    }

    const parsed = parse(answer.payload);
    items.push(...parsed.items);
    if (parsed.nextToken === null) break;
    token = parsed.nextToken;
  }

  return items;
}

export interface PortalDiscoveryResult {
  drafts: ProfileDraft[];
  accountCount: number;
  skipped: number;
}

export async function discoverPortalProfiles(
  portalUrl: string,
  openTransport: (url: string) => Promise<PortalTransport> = openPortalTransport,
): Promise<PortalDiscoveryResult> {
  if (!(await hasPortalAccess(portalUrl))) {
    throw new PortalDiscoveryError(
      'permissionDenied',
      'Access to the AWS access portal is needed.',
    );
  }

  const transport = await openTransport(portalUrl);
  const accounts = await collect(
    transport,
    buildPortalAccountsEndpoint(portalUrl),
    parsePortalAccounts,
  );

  const discovered: DiscoveredRole[] = [];
  for (const account of accounts) {
    const roles = await collect(
      transport,
      buildPortalRolesEndpoint(portalUrl, account.instanceId),
      parsePortalRoles,
    );
    for (const roleName of roles) discovered.push({ account, roleName });
  }

  const { drafts, skipped } = discoveredRolesToDrafts(discovered, portalUrl);
  return { drafts, accountCount: accounts.length, skipped };
}
