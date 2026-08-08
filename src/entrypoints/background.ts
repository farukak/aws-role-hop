import { browser } from 'wxt/browser';
import { ensureAppState } from '../storage/app-state';

export default defineBackground(() => {
  void ensureAppState();
  browser.runtime.onInstalled.addListener(() => {
    void ensureAppState();
  });
});
