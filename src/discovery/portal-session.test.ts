import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  discoverPortalProfiles,
  PortalDiscoveryError,
  portalRequest,
  type PortalTransport,
} from './portal-session';

const PORTAL = 'https://ssoins-1234567890abcdef.portal.eu-west-1.app.aws';

interface PortalAnswer {
  status: number;
  payload: unknown;
}

interface PortalCall {
  endpoint: string;
  nextToken: string | null;
}

function queueTransport(answers: PortalAnswer[]): {
  open: () => Promise<PortalTransport>;
  calls: PortalCall[];
} {
  const calls: PortalCall[] = [];
  let index = 0;

  const transport: PortalTransport = (endpoint: string, nextToken: string | null) => {
    calls.push({ endpoint, nextToken });
    const answer = answers[index] ?? { status: 200, payload: { result: [] } };
    index += 1;
    return Promise.resolve(answer);
  };

  return { open: () => Promise.resolve(transport), calls };
}

function accountPayload(accountId: string, instanceId: string, name: string): unknown {
  return {
    paginationToken: null,
    result: [{ id: instanceId, searchMetadata: { AccountId: accountId, AccountName: name } }],
  };
}

function grantAccess(granted: boolean): void {
  vi.spyOn(browser.permissions, 'contains').mockResolvedValue(granted as never);
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
});

describe('discoverPortalProfiles', () => {
  it('refuses to reach the portal before access is granted', async () => {
    grantAccess(false);
    const { open, calls } = queueTransport([]);

    await expect(discoverPortalProfiles(PORTAL, open)).rejects.toMatchObject({
      code: 'permissionDenied',
    });
    expect(calls).toEqual([]);
  });

  it('turns accounts and their permission sets into drafts', async () => {
    grantAccess(true);
    const { open, calls } = queueTransport([
      { status: 200, payload: accountPayload('024314596708', 'ins-1', 'Core Production') },
      {
        status: 200,
        payload: {
          paginationToken: null,
          result: [{ name: 'PlatformAccess' }, { name: 'ReadOnly' }],
        },
      },
    ]);

    const result = await discoverPortalProfiles(PORTAL, open);

    expect(result.accountCount).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.drafts.map((draft) => draft.roleName)).toEqual(['PlatformAccess', 'ReadOnly']);
    expect(result.drafts[0]).toMatchObject({
      type: 'sso',
      accountId: '024314596708',
      name: 'Core Production',
      portalUrl: PORTAL,
    });
    expect(calls[0]).toEqual({
      endpoint: `${PORTAL}/api/portal/instance/appinstances`,
      nextToken: null,
    });
    expect(calls[1]?.endpoint).toContain('/api/portal/instance/appinstance/ins-1/profiles');
  });

  it('follows the pagination token the portal reports', async () => {
    grantAccess(true);
    const { open, calls } = queueTransport([
      {
        status: 200,
        payload: {
          paginationToken: 'page-2',
          result: [
            { id: 'ins-1', searchMetadata: { AccountId: '024314596708', AccountName: 'A' } },
          ],
        },
      },
      { status: 200, payload: accountPayload('315351460784', 'ins-2', 'B') },
      { status: 200, payload: { result: [{ name: 'ReadOnly' }] } },
      { status: 200, payload: { result: [{ name: 'ReadOnly' }] } },
    ]);

    const result = await discoverPortalProfiles(PORTAL, open);

    expect(result.accountCount).toBe(2);
    expect(result.drafts).toHaveLength(2);
    // The cursor travels as a request argument, the way the portal's client sends it.
    expect(calls[0]?.nextToken).toBeNull();
    expect(calls[1]).toEqual({
      endpoint: `${PORTAL}/api/portal/instance/appinstances`,
      nextToken: 'page-2',
    });
  });

  it('reports an expired portal session separately from other failures', async () => {
    grantAccess(true);
    const { open } = queueTransport([{ status: 401, payload: null }]);

    await expect(discoverPortalProfiles(PORTAL, open)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('reports an unexpected portal answer', async () => {
    grantAccess(true);
    const { open } = queueTransport([{ status: 503, payload: null }]);

    let failure: unknown;
    try {
      await discoverPortalProfiles(PORTAL, open);
    } catch (error: unknown) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(PortalDiscoveryError);
    const discoveryError = failure as PortalDiscoveryError;
    expect(discoveryError.code).toBe('failed');
    // The typed message stays translatable; the detail carries what actually happened.
    expect(discoveryError.detail).toContain('503');
    expect(discoveryError.detail).toContain('/api/portal/instance/appinstances');
  });

  it('returns nothing when the portal offers no accounts', async () => {
    grantAccess(true);
    const { open } = queueTransport([{ status: 200, payload: { result: [] } }]);

    const result = await discoverPortalProfiles(PORTAL, open);
    expect(result).toMatchObject({ accountCount: 0, skipped: 0 });
    expect(result.drafts).toEqual([]);
  });
});

describe('portalRequest', () => {
  const ENDPOINT = `${PORTAL}/api/portal/instance/appinstances`;

  function mockFetch(status: number, body: unknown, contentType = 'application/json') {
    const response = new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': contentType },
    });
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
  }

  it('asks for the first page the way the portal client does: a plain GET', async () => {
    const fetchSpy = mockFetch(200, { result: [] });

    const answer = await portalRequest(ENDPOINT, null);

    expect(answer.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(ENDPOINT);
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
    expect(init?.credentials).toBe('include');
  });

  it('carries the cursor as a form-encoded POST for later pages', async () => {
    const fetchSpy = mockFetch(200, { result: [] });

    await portalRequest(ENDPOINT, 'page 2/2');

    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('next_token=page%202%2F2');
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['content-type']).toBe('application/x-www-form-urlencoded');
    expect(headers?.['enable-pagination']).toBe('true');
  });

  it('keeps the status when the portal answers something that is not JSON', async () => {
    mockFetch(400, 'Bad Request', 'text/plain');

    const answer = await portalRequest(ENDPOINT, null);

    expect(answer).toEqual({ status: 400, payload: null });
  });
});
