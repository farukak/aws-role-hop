import { browser } from 'wxt/browser';
import type { AppSettings, Profile, SsoProfileDraft } from './profile';
import {
  buildRoleSwitchRequest,
  buildRoleSwitchUrl,
  isRoleSwitchResult,
  ROLE_SWITCH_READY_MESSAGE_TYPE,
  type AwsSwitchFailureCode,
  type RoleSwitchRequest,
} from './role-handoff';

/** A switch AWS itself rejected, tagged so the interface can explain the cause. */
export class RoleSwitchError extends Error {
  readonly code?: AwsSwitchFailureCode;

  constructor(message: string, code?: AwsSwitchFailureCode) {
    super(message);
    this.name = 'RoleSwitchError';
    if (code) this.code = code;
  }
}

const TAB_READY_TIMEOUT_MS = 15_000;
const BRIDGE_READY_TIMEOUT_MS = 3_000;
const BRIDGE_RETRY_INTERVAL_MS = 100;

export function buildProfileUrl(profile: Profile): string {
  if (profile.type === 'sso') return buildIdentityCenterUrl(profile);
  return buildRoleSwitchUrl(profile);
}

function buildIdentityCenterUrl(profile: SsoProfileDraft): string {
  const portal = new URL(profile.portalUrl);
  const portalPath = portal.pathname.replace(/\/+$/, '');
  const parameters = new URLSearchParams({
    account_id: profile.accountId,
    role_name: profile.roleName,
  });

  if (profile.region) parameters.set('destination', buildConsoleDestination(profile.region));
  return `${portal.origin}${portalPath}/#/console?${parameters.toString()}`;
}

function buildConsoleDestination(region: string): string {
  const rootDomain = region.startsWith('cn-')
    ? 'amazonaws.cn'
    : region.startsWith('us-gov-')
      ? 'amazonaws-us-gov.com'
      : 'aws.amazon.com';
  const destination = new URL(`https://${region}.console.${rootDomain}/console/home`);
  destination.searchParams.set('region', region);
  return destination.toString();
}

export async function navigateToProfile(
  profile: Profile,
  openBehavior: AppSettings['openBehavior'],
): Promise<void> {
  if (profile.type === 'sso') {
    await navigateToUrl(buildIdentityCenterUrl(profile), openBehavior);
    return;
  }

  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id === undefined || !isAwsConsoleUrl(activeTab.url)) {
    throw new Error('Open AWS Role Hop from an authenticated AWS Console tab and try again.');
  }

  const targetTab = openBehavior === 'new' ? await duplicateConsoleTab(activeTab.id) : activeTab;
  if (!targetTab || targetTab.id === undefined) {
    throw new Error('The browser did not create an AWS Console tab.');
  }

  if (targetTab.status !== 'complete') await waitForTabReady(targetTab.id);
  const result = await sendSwitchRequestWhenReady(targetTab.id, buildRoleSwitchRequest(profile));
  if (!isRoleSwitchResult(result) || !result.ok) {
    const failure = isRoleSwitchResult(result) ? result : undefined;
    throw new RoleSwitchError(
      failure?.error ?? 'AWS Console rejected the AWS Role Hop request.',
      failure?.code,
    );
  }
}

async function sendSwitchRequestWhenReady(
  tabId: number,
  request: RoleSwitchRequest,
): Promise<unknown> {
  const deadline = Date.now() + BRIDGE_READY_TIMEOUT_MS;
  while (true) {
    let readiness: unknown;
    try {
      readiness = await browser.tabs.sendMessage(tabId, ROLE_SWITCH_READY_MESSAGE_TYPE);
    } catch {
      if (Date.now() >= deadline) {
        throw new Error('Open AWS Role Hop from an authenticated AWS Console tab and try again.');
      }
      await new Promise((resolve) => setTimeout(resolve, BRIDGE_RETRY_INTERVAL_MS));
      continue;
    }

    if (!isRoleSwitchResult(readiness) || !readiness.ok) {
      throw new Error(
        isRoleSwitchResult(readiness) && readiness.error
          ? readiness.error
          : 'AWS Console rejected the AWS Role Hop bridge.',
      );
    }
    break;
  }

  try {
    return await browser.tabs.sendMessage(tabId, request);
  } catch {
    throw new Error('Open AWS Role Hop from an authenticated AWS Console tab and try again.');
  }
}

async function navigateToUrl(
  url: string,
  openBehavior: AppSettings['openBehavior'],
): Promise<void> {
  if (openBehavior === 'new') {
    await browser.tabs.create({ url });
    return;
  }

  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id !== undefined) {
    await browser.tabs.update(activeTab.id, { url });
    return;
  }
  await browser.tabs.create({ url });
}

async function duplicateConsoleTab(tabId: number) {
  try {
    return await browser.tabs.duplicate(tabId);
  } catch {
    const source = await browser.tabs.get(tabId);
    if (!source.url) throw new Error('The active AWS Console URL is unavailable.');
    return browser.tabs.create({ url: source.url, active: true });
  }
}

function waitForTabReady(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('The duplicated AWS Console tab did not finish loading.'));
    }, TAB_READY_TIMEOUT_MS);

    const onUpdated = (updatedTabId: number, changeInfo: { status?: string }): void => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    browser.tabs.onUpdated.addListener(onUpdated);
  });
}

export function isAwsConsoleUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const { protocol, hostname } = new URL(value);
    if (protocol !== 'https:') return false;
    return [
      'console.aws.amazon.com',
      'health.aws.amazon.com',
      'lightsail.aws.amazon.com',
      'console.amazonaws-us-gov.com',
      'phd.amazonaws-us-gov.com',
      'console.amazonaws.cn',
      'health.amazonaws.cn',
    ].some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}
