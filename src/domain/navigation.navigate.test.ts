import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import { isAwsConsoleUrl, navigateToProfile } from './navigation';
import { ROLE_SWITCH_READY_MESSAGE_TYPE } from './role-handoff';
import { profileSchema, type Profile } from './profile';

const ISO = '2026-01-01T00:00:00.000Z';

function profile(overrides: Record<string, unknown> = {}): Profile {
  return profileSchema.parse({
    type: 'role',
    name: 'Production read-only',
    accountId: '123456789012',
    roleName: 'team/ReadOnlyRole',
    partition: 'aws',
    environment: 'production',
    favorite: false,
    tags: [],
    id: crypto.randomUUID(),
    listId: '00000000-0000-4000-8000-000000000001',
    colorId: 'rose',
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  });
}

beforeEach(() => fakeBrowser.reset());

describe('navigateToProfile', () => {
  it('switches a role through the active AWS Console content bridge', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: 42, url: 'https://eu-west-1.console.aws.amazon.com/console/home', status: 'complete' },
    ] as never);
    const send = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ ok: true } as never);

    await navigateToProfile(profile(), 'current');

    expect(send).toHaveBeenNthCalledWith(1, 42, ROLE_SWITCH_READY_MESSAGE_TYPE);
    expect(send).toHaveBeenNthCalledWith(2, 42, {
      type: 'rolehop:switch-role',
      account: '123456789012',
      roleName: 'team/ReadOnlyRole',
      displayName: 'Production read-only',
      color: 'e98b9a',
      partition: 'aws',
    });
  });

  it('waits for a newly loaded Console bridge before sending one switch request', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: 42, url: 'https://console.aws.amazon.com/console/home', status: 'complete' },
    ] as never);
    const send = vi
      .spyOn(browser.tabs, 'sendMessage')
      .mockRejectedValueOnce(new Error('Receiving end does not exist.'))
      .mockResolvedValueOnce({ ok: true } as never)
      .mockResolvedValueOnce({ ok: true } as never);

    await navigateToProfile(profile(), 'current');

    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenNthCalledWith(1, 42, ROLE_SWITCH_READY_MESSAGE_TYPE);
    expect(send).toHaveBeenNthCalledWith(2, 42, ROLE_SWITCH_READY_MESSAGE_TYPE);
    expect(
      send.mock.calls.filter(([, message]) => message !== ROLE_SWITCH_READY_MESSAGE_TYPE),
    ).toHaveLength(1);
  });

  it('duplicates the AWS Console tab before switching in new-tab mode', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: 42, url: 'https://console.aws.amazon.com/console/home', status: 'complete' },
    ] as never);
    const duplicate = vi
      .spyOn(browser.tabs, 'duplicate')
      .mockResolvedValue({ id: 84, status: 'complete' } as never);
    const send = vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ ok: true } as never);

    await navigateToProfile(profile(), 'new');

    expect(duplicate).toHaveBeenCalledWith(42);
    expect(send.mock.calls[0]?.[0]).toBe(84);
  });

  it.each(['current', 'new'] as const)(
    'requires an authenticated AWS Console tab in %s-tab mode without side effects',
    async (openBehavior) => {
      vi.spyOn(browser.tabs, 'query').mockResolvedValue([
        { id: 42, url: 'https://example.com', status: 'complete' },
      ] as never);
      const duplicate = vi.spyOn(browser.tabs, 'duplicate');
      const send = vi.spyOn(browser.tabs, 'sendMessage');

      await expect(navigateToProfile(profile(), openBehavior)).rejects.toThrow(
        'Open AWS Role Hop from an authenticated AWS Console tab',
      );
      expect(duplicate).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('reports a bridge rejection', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: 42, url: 'https://console.aws.amazon.com/console/home', status: 'complete' },
    ] as never);
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({
      ok: false,
      error: 'AWS rejected the request.',
    } as never);

    await expect(navigateToProfile(profile(), 'current')).rejects.toThrow(
      'AWS rejected the request.',
    );
  });

  it('navigates an Identity Center profile to its shortcut link', async () => {
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    const ssoProfile = profileSchema.parse({
      type: 'sso',
      name: 'Platform',
      accountId: '123456789012',
      roleName: 'PlatformAccess',
      portalUrl: 'https://example.awsapps.com/start',
      environment: 'shared',
      favorite: false,
      tags: [],
      id: crypto.randomUUID(),
      listId: '00000000-0000-4000-8000-000000000001',
      colorId: 'rose',
      createdAt: ISO,
      updatedAt: ISO,
    });

    await navigateToProfile(ssoProfile, 'new');
    expect(create.mock.calls[0]?.[0]?.url).toBe(
      'https://example.awsapps.com/start/#/console?account_id=123456789012&role_name=PlatformAccess',
    );
  });
});

describe('isAwsConsoleUrl', () => {
  it.each([
    'https://eu-west-1.console.aws.amazon.com/console/home',
    'https://health.aws.amazon.com/',
    'https://us-gov-west-1.console.amazonaws-us-gov.com/',
    'https://cn-north-1.console.amazonaws.cn/',
  ])('accepts supported AWS Console URL %s', (url) => {
    expect(isAwsConsoleUrl(url)).toBe(true);
  });

  it.each([
    'http://console.aws.amazon.com/',
    'https://console.aws.amazon.com.evil.test/',
    undefined,
  ])('rejects unsupported URL %s', (url) => expect(isAwsConsoleUrl(url)).toBe(false));
});
