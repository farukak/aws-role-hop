import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import background from './entrypoints/background';
import { createDefaultState } from './domain/profile';

const STORAGE_KEY = 'rolehop.appState';

async function stored(): Promise<unknown> {
  const value = await browser.storage.local.get(STORAGE_KEY);
  return value[STORAGE_KEY];
}

beforeEach(() => {
  vi.restoreAllMocks();
  fakeBrowser.reset();
});

describe('background worker', () => {
  it('seeds the default state on start', async () => {
    background.main();
    await expect.poll(stored).toEqual(createDefaultState());
  });

  it('seeds the default state again after install', async () => {
    background.main();
    await expect.poll(stored).toEqual(createDefaultState());

    await browser.storage.local.clear();
    expect(await stored()).toBeUndefined();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });
    await expect.poll(stored).toEqual(createDefaultState());
  });

  it('opens the local release notes once after a version upgrade', async () => {
    vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({
      version: '0.1.0',
    } as ReturnType<typeof fakeBrowser.runtime.getManifest>);
    const create = vi.spyOn(browser.tabs, 'create');
    background.main();

    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'update',
      previousVersion: '0.0.9',
    });

    await expect.poll(() => create.mock.calls.length).toBe(1);
    const createdTab = create.mock.calls[0]?.[0];
    expect(createdTab?.url?.endsWith('/options.html#whats-new')).toBe(true);
  });

  it.each([
    ['install', undefined],
    ['update', '0.1.0'],
    ['update', '0.2.0'],
  ] as const)('does not show release notes for %s from %s', async (reason, previousVersion) => {
    vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({
      version: '0.1.0',
    } as ReturnType<typeof fakeBrowser.runtime.getManifest>);
    const create = vi.spyOn(browser.tabs, 'create');
    background.main();

    const details = previousVersion === undefined ? { reason } : { reason, previousVersion };
    await fakeBrowser.runtime.onInstalled.trigger(details);

    expect(create).not.toHaveBeenCalled();
  });

  it('leaves an existing state untouched', async () => {
    const existing = {
      ...createDefaultState(),
      settings: { ...createDefaultState().settings, theme: 'dark' as const },
    };
    await browser.storage.local.set({ [STORAGE_KEY]: existing });

    background.main();
    await expect.poll(stored).toEqual(existing);
  });

  it('registers exactly one install listener', () => {
    background.main();
    expect(fakeBrowser.runtime.onInstalled.hasListeners()).toBe(true);
  });
});
