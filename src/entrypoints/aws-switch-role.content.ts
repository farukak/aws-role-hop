import { browser } from 'wxt/browser';
import { injectScript } from 'wxt/utils/inject-script';
import {
  isRoleSwitchRequest,
  ROLE_SWITCH_READY_MESSAGE_TYPE,
  type RoleSwitchRequest,
  type RoleSwitchResult,
} from '../domain/role-handoff';

const BRIDGE_ID = 'rolehop-aws-console-bridge';
const REQUEST_EVENT = 'rolehop:switch-request';
const RESPONSE_EVENT = 'rolehop:switch-response';
const RESPONSE_TIMEOUT_MS = 15_000;

export default defineContentScript({
  matches: [
    'https://*.console.aws.amazon.com/*',
    'https://health.aws.amazon.com/*',
    'https://lightsail.aws.amazon.com/*',
    'https://*.console.amazonaws-us-gov.com/*',
    'https://phd.amazonaws-us-gov.com/*',
    'https://*.console.amazonaws.cn/*',
    'https://health.amazonaws.cn/*',
  ],
  runAt: 'document_end',
  main() {
    const existingBridge = document.getElementById(BRIDGE_ID);
    const bridge =
      existingBridge instanceof HTMLElement ? existingBridge : document.createElement('div');
    if (!existingBridge) {
      bridge.id = BRIDGE_ID;
      bridge.hidden = true;
      document.documentElement.append(bridge);
    }

    const bridgeReady =
      bridge.dataset.rolehopReady === 'true'
        ? Promise.resolve()
        : injectScript('/aws-console-bridge.js').then(() => {
            if (bridge.dataset.rolehopReady !== 'true') {
              throw new Error('AWS Console blocked the AWS Role Hop page bridge.');
            }
          });

    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (message === ROLE_SWITCH_READY_MESSAGE_TYPE) {
        void bridgeReady
          .then(() => sendResponse({ ok: true } satisfies RoleSwitchResult))
          .catch((error: unknown) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : 'AWS Console bridge failed to start.',
            } satisfies RoleSwitchResult),
          );
        return true;
      }
      if (!isRoleSwitchRequest(message)) return undefined;
      void bridgeReady
        .then(() => dispatchSwitchRequest(bridge, message))
        .catch((error: unknown): RoleSwitchResult => ({
          ok: false,
          error: error instanceof Error ? error.message : 'AWS Console bridge failed to start.',
        }))
        .then(sendResponse);
      return true;
    });
  },
});

function dispatchSwitchRequest(
  bridge: HTMLElement,
  request: RoleSwitchRequest,
): Promise<RoleSwitchResult> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      bridge.removeEventListener(RESPONSE_EVENT, onResponse);
      resolve({ ok: false, error: 'AWS Console did not respond to the AWS Role Hop request.' });
    }, RESPONSE_TIMEOUT_MS);

    const onResponse = (): void => {
      window.clearTimeout(timeout);
      bridge.removeEventListener(RESPONSE_EVENT, onResponse);
      try {
        resolve(JSON.parse(bridge.dataset.response ?? 'null') as RoleSwitchResult);
      } catch {
        resolve({ ok: false, error: 'AWS Console returned an invalid AWS Role Hop response.' });
      }
    };

    bridge.addEventListener(RESPONSE_EVENT, onResponse);
    bridge.dataset.request = JSON.stringify(request);
    bridge.dispatchEvent(new Event(REQUEST_EVENT));
  });
}
