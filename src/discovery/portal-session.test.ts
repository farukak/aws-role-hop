import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  discoverPortalProfiles,
  PortalDiscoveryError,
  type PortalTransport,
} from './portal-session';

const PORTAL = 'https://ssoins-1234567890abcdef.portal.eu-west-1.app.aws';

interface PortalAnswer {
  status: number;
  payload: unknown;
}

function queueTransport(answers: PortalAnswer[]): {
  open: () => Promise<PortalTransport>;
  endpoints: string[];
} {
  const endpoints: string[] = [];
  let index = 0;

  const transport: PortalTransport = (endpoint: string) => {
    endpoints.push(endpoint);
    const answer = answers[index] ?? { status: 200, payload: { result: [] } };
    index += 1;
    return Promise.resolve(answer);
  };

  return { open: () => Promise.resolve(transport), endpoints };
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
    const { open, endpoints } = queueTransport([]);

    await expect(discoverPortalProfiles(PORTAL, open)).rejects.toMatchObject({
      code: 'permissionDenied',
    });
    expect(endpoints).toEqual([]);
  });

  it('turns accounts and their permission sets into drafts', async () => {
    grantAccess(true);
    const { open, endpoints } = queueTransport([
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
    expect(endpoints[0]).toContain('/api/portal/instance/appinstances');
    expect(endpoints[1]).toContain('/api/portal/instance/appinstance/ins-1/profiles');
  });

  it('follows the pagination token the portal reports', async () => {
    grantAccess(true);
    const { open, endpoints } = queueTransport([
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
    expect(endpoints[1]).toContain('pagination_token=page-2');
    expect(endpoints[0]).not.toContain('pagination_token');
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
    expect(discoveryError.message).toContain('503');
  });

  it('returns nothing when the portal offers no accounts', async () => {
    grantAccess(true);
    const { open } = queueTransport([{ status: 200, payload: { result: [] } }]);

    const result = await discoverPortalProfiles(PORTAL, open);
    expect(result).toMatchObject({ accountCount: 0, skipped: 0 });
    expect(result.drafts).toEqual([]);
  });
});
