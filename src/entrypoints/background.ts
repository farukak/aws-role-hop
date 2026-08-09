import { browser } from 'wxt/browser';
import { isVersionUpgrade } from '../domain/release-notes';
import { ensureAppState } from '../storage/app-state';

export default defineBackground(() => {
  void ensureAppState();
  browser.runtime.onInstalled.addListener((details) => {
    void ensureAppState();
    if (details.reason !== 'update') return;

    const currentVersion = browser.runtime.getManifest().version;
    if (!isVersionUpgrade(currentVersion, details.previousVersion)) return;

    const url = browser.runtime.getURL('/options.html#whats-new');
    void browser.tabs.create({ url }).catch(() => undefined);
  });
});
