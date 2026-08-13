import { describe, expect, it } from 'vitest';
import {
  buildPortalAccountsEndpoint,
  buildPortalRolesEndpoint,
  discoveredRolesToDrafts,
  parsePortalAccounts,
  parsePortalRoles,
  portalOriginPattern,
  type PortalAccount,
} from './portal-discovery';

const ROOT_PORTAL = 'https://ssoins-1234567890abcdef.portal.eu-west-1.app.aws';
const START_PORTAL = 'https://example.awsapps.com/start';

function account(overrides: Partial<PortalAccount> = {}): PortalAccount {
  return {
    instanceId: 'ins-123',
    accountId: '024314596708',
    accountName: 'Core Production',
    ...overrides,
  };
}

describe('portal endpoints', () => {
  it('addresses the account list on both portal formats', () => {
    expect(buildPortalAccountsEndpoint(ROOT_PORTAL)).toBe(
      `${ROOT_PORTAL}/api/portal/instance/appinstances`,
    );
    expect(buildPortalAccountsEndpoint(START_PORTAL)).toBe(
      'https://example.awsapps.com/api/portal/instance/appinstances',
    );
  });

  it('escapes the instance id in the role list', () => {
    expect(buildPortalRolesEndpoint(ROOT_PORTAL, 'ins 1/2')).toBe(
      `${ROOT_PORTAL}/api/portal/instance/appinstance/ins%201%2F2/profiles`,
    );
  });

  it('asks for access to the portal origin only', () => {
    expect(portalOriginPattern(ROOT_PORTAL)).toBe(`${ROOT_PORTAL}/*`);
  });

  it('refuses a host that is not an AWS access portal', () => {
    expect(() => buildPortalAccountsEndpoint('https://portal.example.com/start')).toThrow(
      /not an AWS access portal/i,
    );
    expect(() => portalOriginPattern('http://example.awsapps.com/start')).toThrow();
  });
});

describe('parsePortalAccounts', () => {
  it('reads the account id and name the portal reports', () => {
    const page = parsePortalAccounts({
      paginationToken: null,
      result: [
        {
          id: 'ins-1',
          name: 'AWS Account',
          searchMetadata: {
            AccountId: '024314596708',
            AccountName: 'Core Production',
            AccountEmail: 'aws+core@example.com',
          },
        },
      ],
    });

    expect(page.items).toEqual([
      { instanceId: 'ins-1', accountId: '024314596708', accountName: 'Core Production' },
    ]);
    expect(page.nextToken).toBeNull();
  });

  it('falls back to the application name when metadata has none', () => {
    const page = parsePortalAccounts({
      result: [{ id: 'ins-1', name: 'Sandbox', searchMetadata: { AccountId: '315351460784' } }],
    });
    expect(page.items[0]?.accountName).toBe('Sandbox');
  });

  it('skips entries that cannot become a profile', () => {
    const page = parsePortalAccounts({
      result: [
        { name: 'No instance id', searchMetadata: { AccountId: '024314596708' } },
        { id: 'ins-2', searchMetadata: { AccountId: 'not-an-account' } },
        { id: 'ins-3', searchMetadata: {} },
        'nonsense',
      ],
    });
    expect(page.items).toEqual([]);
  });

  it('treats a written-out null token as the end of the list', () => {
    expect(parsePortalAccounts({ result: [], paginationToken: 'null' }).nextToken).toBeNull();
    expect(parsePortalAccounts({ result: [], paginationToken: '  ' }).nextToken).toBeNull();
    expect(parsePortalAccounts({ result: [], paginationToken: 'page-2' }).nextToken).toBe('page-2');
  });

  it('survives a payload that is not a list at all', () => {
    expect(parsePortalAccounts({ error: 'nope' }).items).toEqual([]);
    expect(parsePortalAccounts(null).items).toEqual([]);
  });
});

describe('parsePortalRoles', () => {
  it('collects permission set names and ignores blanks', () => {
    const page = parsePortalRoles({
      result: [{ name: 'PlatformAccess' }, { name: '   ' }, { url: 'https://example.test' }],
      paginationToken: null,
    });
    expect(page.items).toEqual(['PlatformAccess']);
  });
});

describe('discoveredRolesToDrafts', () => {
  it('builds an Identity Center draft per account and role', () => {
    const { drafts, skipped } = discoveredRolesToDrafts(
      [
        { account: account(), roleName: 'PlatformAccess' },
        { account: account(), roleName: 'ReadOnly' },
      ],
      ROOT_PORTAL,
    );

    expect(skipped).toBe(0);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      type: 'sso',
      name: 'Core Production',
      accountId: '024314596708',
      roleName: 'PlatformAccess',
      portalUrl: ROOT_PORTAL,
      environment: 'production',
      favorite: false,
    });
  });

  it('infers the environment from the account name', () => {
    const { drafts } = discoveredRolesToDrafts(
      [{ account: account({ accountName: 'Core Test' }), roleName: 'ReadOnly' }],
      ROOT_PORTAL,
    );
    expect(drafts[0]?.environment).not.toBe('production');
  });

  it('reports rather than throws when a role cannot become a profile', () => {
    const { drafts, skipped } = discoveredRolesToDrafts(
      [{ account: account(), roleName: 'x'.repeat(200) }],
      ROOT_PORTAL,
    );
    expect(drafts).toEqual([]);
    expect(skipped).toBe(1);
  });
});
