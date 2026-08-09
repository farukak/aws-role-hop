/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoleSwitchRequest } from './domain/role-handoff';
import { dispatchSwitchRequest } from './entrypoints/aws-switch-role.content';

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

afterEach(() => vi.useRealTimers());

describe('AWS Console content bridge', () => {
  it('returns the page response and removes transient dataset metadata', async () => {
    const bridge = document.createElement('div');
    bridge.addEventListener(REQUEST_EVENT, () => {
      expect(JSON.parse(bridge.dataset.request ?? 'null')).toEqual(REQUEST);
      delete bridge.dataset.request;
      bridge.dataset.response = JSON.stringify({ ok: true });
      bridge.dispatchEvent(new Event(RESPONSE_EVENT));
    });

    await expect(dispatchSwitchRequest(bridge, REQUEST)).resolves.toEqual({ ok: true });
    expect(bridge.dataset.request).toBeUndefined();
    expect(bridge.dataset.response).toBeUndefined();
  });

  it('clears request and response metadata when the page bridge times out', async () => {
    vi.useFakeTimers();
    const bridge = document.createElement('div');
    bridge.dataset.response = JSON.stringify({ ok: true });

    const result = dispatchSwitchRequest(bridge, REQUEST);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(result).resolves.toEqual({
      ok: false,
      error: 'AWS Console did not respond to the AWS Role Hop request.',
    });
    expect(bridge.dataset.request).toBeUndefined();
    expect(bridge.dataset.response).toBeUndefined();
  });
});
