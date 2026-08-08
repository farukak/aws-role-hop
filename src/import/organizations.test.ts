import { describe, expect, it } from 'vitest';
import { organizationAccountsToDrafts, parseOrganizationsAccounts } from './organizations';

const LIST_ACCOUNTS = JSON.stringify({
  Accounts: [
    {
      Id: '111111111111',
      Arn: 'arn:aws:organizations::999999999999:account/o-exampleorgid/111111111111',
      Email: 'prod-owner@example.com',
      Name: 'workload-production',
      State: 'ACTIVE',
      JoinedMethod: 'CREATED',
      JoinedTimestamp: '2024-01-01T00:00:00.000Z',
    },
    {
      Id: '222222222222',
      Email: 'staging-owner@example.com',
      Name: 'workload-staging',
      State: 'ACTIVE',
    },
    {
      Id: '333333333333',
      Email: 'closed-owner@example.com',
      Name: 'retired-account',
      State: 'SUSPENDED',
    },
  ],
  NextToken: 'eyJOZXh0VG9rZW4i',
});

describe('parseOrganizationsAccounts', () => {
  it('reads active accounts and reports how many were skipped', () => {
    const result = parseOrganizationsAccounts(LIST_ACCOUNTS);

    expect(result.accounts).toEqual([
      { id: '111111111111', name: 'workload-production' },
      { id: '222222222222', name: 'workload-staging' },
    ]);
    expect(result.skippedInactive).toBe(1);
    expect(result.issues).toHaveLength(0);
  });

  it('never reads the account email address or ARN', () => {
    const serialized = JSON.stringify(parseOrganizationsAccounts(LIST_ACCOUNTS));

    for (const value of [
      'prod-owner@example.com',
      'staging-owner@example.com',
      'example.com',
      'arn:aws:organizations',
      'o-exampleorgid',
      'JoinedMethod',
      'eyJOZXh0VG9rZW4i',
    ]) {
      expect(serialized).not.toContain(value);
    }
  });

  it('accepts a bare array of accounts', () => {
    const result = parseOrganizationsAccounts(
      '[{"Id":"111111111111","Name":"only","State":"ACTIVE"}]',
    );
    expect(result.accounts).toEqual([{ id: '111111111111', name: 'only' }]);
  });

  it('reports a missing state instead of assuming the account is active', () => {
    const result = parseOrganizationsAccounts('{"Accounts":[{"Id":"111111111111","Name":"a"}]}');
    expect(result.accounts).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('state is missing');
  });

  it('accepts deprecated Status output during AWS migration to State', () => {
    const result = parseOrganizationsAccounts(
      '{"Accounts":[{"Id":"111111111111","Name":"legacy","Status":"ACTIVE"}]}',
    );
    expect(result.accounts).toEqual([{ id: '111111111111', name: 'legacy' }]);
  });

  it.each(['PENDING_ACTIVATION', 'SUSPENDED', 'PENDING_CLOSURE', 'CLOSED'])(
    'skips the inactive %s state',
    (state) => {
      const result = parseOrganizationsAccounts(
        JSON.stringify({ Accounts: [{ Id: '111111111111', Name: 'inactive', State: state }] }),
      );
      expect(result.accounts).toHaveLength(0);
      expect(result.skippedInactive).toBe(1);
    },
  );

  it('rejects account-creation status output with an actionable message', () => {
    const result = parseOrganizationsAccounts(
      '{"Accounts":[{"AccountId":"111111111111","AccountName":"new","State":"SUCCEEDED"}]}',
    );
    expect(result.issues[0]?.message).toContain('list-accounts');
  });

  it('falls back to the account ID when the name is missing or blank', () => {
    const result = parseOrganizationsAccounts(
      '{"Accounts":[{"Id":"111111111111","State":"ACTIVE"},{"Id":"222222222222","Name":"   ","State":"ACTIVE"}]}',
    );
    expect(result.accounts.map((account) => account.name)).toEqual([
      '111111111111',
      '222222222222',
    ]);
  });

  it('reports an account whose ID is not 12 digits', () => {
    const result = parseOrganizationsAccounts('{"Accounts":[{"Id":"123","Name":"short"}]}');
    expect(result.accounts).toHaveLength(0);
    expect(result.issues[0]).toEqual({
      section: 'Account 1',
      message: 'Account ID must be 12 digits.',
    });
  });

  it('reports a non-object entry without discarding the rest', () => {
    const result = parseOrganizationsAccounts(
      '{"Accounts":["nope",{"Id":"111111111111","Name":"good","State":"ACTIVE"}]}',
    );
    expect(result.accounts).toHaveLength(1);
    expect(result.issues[0]?.message).toContain('not an account object');
  });

  it('collapses duplicate account IDs', () => {
    const result = parseOrganizationsAccounts(
      '{"Accounts":[{"Id":"111111111111","Name":"a","State":"ACTIVE"},{"Id":"111111111111","Name":"b","State":"ACTIVE"}]}',
    );
    expect(result.accounts).toHaveLength(1);
  });

  it('explains invalid JSON instead of throwing', () => {
    const result = parseOrganizationsAccounts('{"Accounts":[');
    expect(result.accounts).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('not valid JSON');
  });

  it('explains JSON that is not Organizations output', () => {
    const result = parseOrganizationsAccounts('{"Roles":[]}');
    expect(result.accounts).toHaveLength(0);
    expect(result.issues[0]?.message).toContain('Accounts');
  });

  it('returns nothing for an empty account list', () => {
    expect(parseOrganizationsAccounts('{"Accounts":[]}')).toEqual({
      accounts: [],
      issues: [],
      skippedInactive: 0,
    });
  });
});

describe('organizationAccountsToDrafts', () => {
  const accounts = [
    { id: '111111111111', name: 'workload-production' },
    { id: '222222222222', name: 'workload-staging' },
  ];

  it('creates one role profile per account and infers the environment', () => {
    const { profiles, issues } = organizationAccountsToDrafts(
      accounts,
      'OrganizationAccountAccessRole',
      'aws',
    );

    expect(issues).toHaveLength(0);
    expect(profiles).toHaveLength(2);
    expect(profiles[0]).toMatchObject({
      type: 'role',
      name: 'workload-production',
      accountId: '111111111111',
      roleName: 'OrganizationAccountAccessRole',
      partition: 'aws',
      environment: 'production',
      favorite: false,
      tags: [],
    });
    expect(profiles[1]?.environment).toBe('staging');
  });

  it.each(['aws', 'aws-us-gov', 'aws-cn'] as const)('applies the %s partition', (partition) => {
    const { profiles } = organizationAccountsToDrafts(accounts, 'Role', partition);
    expect(
      profiles.every((profile) => profile.type === 'role' && profile.partition === partition),
    ).toBe(true);
  });

  it('truncates an account name to the profile name limit', () => {
    const { profiles } = organizationAccountsToDrafts(
      [{ id: '111111111111', name: 'a'.repeat(90) }],
      'Role',
      'aws',
    );
    expect(profiles[0]?.name).toHaveLength(48);
  });

  it('reports an invalid role name once per account instead of failing silently', () => {
    const { profiles, issues } = organizationAccountsToDrafts(accounts, 'bad role name', 'aws');
    expect(profiles).toHaveLength(0);
    expect(issues).toHaveLength(2);
    expect(issues[0]?.message).toContain('Role names may contain');
  });

  it('produces nothing for an empty account list', () => {
    expect(organizationAccountsToDrafts([], 'Role', 'aws')).toEqual({ profiles: [], issues: [] });
  });
});
