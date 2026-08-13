/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleSwitchRequest, RoleSwitchResult } from './domain/role-handoff';
import pageBridge from './entrypoints/aws-console-bridge';

const BRIDGE_ID = 'rolehop-aws-console-bridge';
const REQUEST_EVENT = 'rolehop:switch-request';
const RESPONSE_EVENT = 'rolehop:switch-response';
const REQUEST: RoleSwitchRequest = {
  type: 'rolehop:switch-role',
  account: '123456789012',
  roleName: 'Developer',
  displayName: 'Development',
  color: '69b4e3',
  partition: 'aws',
};

function setupBridge(metadata?: Record<string, unknown>): HTMLElement {
  document.head.innerHTML = metadata
    ? `<meta name="awsc-session-data" content='${JSON.stringify(metadata)}'>`
    : '';
  document.body.innerHTML = `<div id="${BRIDGE_ID}"></div>`;
  pageBridge.main();
  return document.getElementById(BRIDGE_ID)!;
}

function dispatch(bridge: HTMLElement): Promise<RoleSwitchResult> {
  return new Promise((resolve) => {
    bridge.addEventListener(
      RESPONSE_EVENT,
      () => resolve(JSON.parse(bridge.dataset.response ?? 'null') as RoleSwitchResult),
      { once: true },
    );
    bridge.dataset.request = JSON.stringify(REQUEST);
    bridge.dispatchEvent(new Event(REQUEST_EVENT));
  });
}

beforeEach(() => {
  Reflect.deleteProperty(globalThis, 'AWSC');
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'AWSC');
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('AWS Console page bridge', () => {
  it('submits a standard switch when AWS returns an asynchronous boxed CSRF value', async () => {
    Object.defineProperty(globalThis, 'AWSC', {
      configurable: true,
      value: {
        Auth: { getMbtc: () => Promise.resolve(new String('csrf-value')) },
      },
    });
    const submit = vi
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => undefined);
    const bridge = setupBridge();

    await expect(dispatch(bridge)).resolves.toEqual({ ok: true });
    expect(document.querySelector<HTMLInputElement>('input[name="csrf"]')?.value).toBe(
      'csrf-value',
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(bridge.dataset.request).toBeUndefined();
  });

  it('rejects a standard switch without CSRF and clears the request dataset', async () => {
    const bridge = setupBridge();

    await expect(dispatch(bridge)).resolves.toEqual({
      ok: false,
      error: 'AWS Console did not provide a CSRF value. Refresh the Console and try again.',
    });
    expect(bridge.dataset.request).toBeUndefined();
    expect(document.querySelector('form')).toBeNull();
  });

  it('reports an unauthorized multi-session switch with its classified cause', async () => {
    const bridge = setupBridge({
      prismModeEnabled: true,
      sessionDifferentiator: 'session-1',
      signInEndpoint: 'signin.aws.amazon.com',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 401 }))),
    );

    await expect(dispatch(bridge)).resolves.toEqual({
      ok: false,
      code: 'unauthorized',
      error: 'AWS switch-role request failed (401).',
    });
    expect(bridge.dataset.request).toBeUndefined();
  });

  it('refuses a multi-session switch when AWS omits the session sign-in host', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const bridge = setupBridge({ prismModeEnabled: true, sessionDifferentiator: 'session-1' });

    await expect(dispatch(bridge)).resolves.toEqual({
      ok: false,
      error: 'AWS multi-session details are incomplete. Reload the AWS Console tab and try again.',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('aborts a multi-session request before the content-script deadline', async () => {
    vi.useFakeTimers();
    const bridge = setupBridge({
      prismModeEnabled: true,
      sessionDifferentiator: 'session-1',
      signInEndpoint: 'signin.aws.amazon.com',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );

    const result = dispatch(bridge);
    await vi.advanceTimersByTimeAsync(14_000);

    await expect(result).resolves.toEqual({
      ok: false,
      error: 'AWS switch-role request timed out. Refresh the Console and try again.',
    });
    expect(bridge.dataset.request).toBeUndefined();
  });
});
