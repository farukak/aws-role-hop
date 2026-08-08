import { beforeEach, describe, expect, it } from 'vitest';
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
