import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const EXTENSION_PATH = resolve(import.meta.dirname, '../.output/chrome-mv3');
const STORAGE_KEY = 'rolehop.appState';
const DEFAULT_LIST_ID = '00000000-0000-4000-8000-000000000001';
const COLORS = ['rose', 'peach', 'amber', 'mint', 'teal', 'sky', 'indigo', 'lilac'] as const;

/** Console hostnames starting with this label are served as AWS multi-session tabs. */
export const MULTI_SESSION_PREFIX = 'ms-';
export const MULTI_SESSION_DESTINATION =
  'https://eu-west-1.console.aws.amazon.com/console/home?region=eu-west-1';

/** Every external request is intercepted; only recognized AWS hosts receive a local stub. */
const AWS_HOST_SUFFIXES = [
  'signin.aws.amazon.com',
  'signin.amazonaws-us-gov.com',
  'signin.amazonaws.cn',
  'console.aws.amazon.com',
  'console.amazonaws-us-gov.com',
  'console.amazonaws.cn',
  'awsapps.com',
  'awsapps.cn',
  'app.aws',
];

function isAwsHost(hostname: string): boolean {
  return AWS_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

export interface Extension {
  context: BrowserContext;
  extensionId: string;
  popup: Page;
  options: Page;
}

export const test = base.extend<Extension>({
  context: async ({ browserName }, provide) => {
    if (browserName !== 'chromium') {
      throw new Error('Loaded-extension E2E tests require Chromium.');
    }
    const manifestPath = resolve(EXTENSION_PATH, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`Build the extension first: npm run build:chrome (missing ${manifestPath})`);
    }

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      // Playwright launches with --disable-extensions by default, which silently
      // wins over --load-extension and leaves the browser with no extension and
      // no service worker to wait for.
      ignoreDefaultArgs: [
        '--disable-extensions',
        '--disable-component-extensions-with-background-pages',
      ],
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });

    // External requests are sandboxed. Console pages expose the same metadata
    // and page-context CSRF API used by AWS's own navigation; switch-role POSTs
    // are fulfilled locally after Playwright records their exact method/body.
    await context.route(/^https:\/\//, (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const hostname = url.hostname.toLowerCase();
      if (!isAwsHost(hostname)) return route.abort('blockedbyclient');

      // AWS multi-session posts JSON to a session-scoped endpoint from the
      // Console origin, so the stub has to answer its CORS preflight too.
      const isMultiSessionSwitch = /^\/sessions\/[^/]+\/v1\/switchrole$/.test(url.pathname);
      if (isMultiSessionSwitch) {
        const origin = request.headers()['origin'] ?? '';
        const corsHeaders = {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
        };
        if (request.method() === 'OPTIONS') {
          return route.fulfill({
            status: 204,
            headers: {
              ...corsHeaders,
              'access-control-allow-methods': 'POST, OPTIONS',
              'access-control-allow-headers': 'content-type, x-csrf-protection',
            },
            body: '',
          });
        }
        return route.fulfill({
          status: 200,
          headers: { ...corsHeaders, 'content-type': 'application/json' },
          body: JSON.stringify({ destination: MULTI_SESSION_DESTINATION }),
        });
      }

      const isStandardSwitch =
        request.method() === 'POST' &&
        hostname === 'signin.aws.amazon.com' &&
        url.pathname === '/switchrole';
      if (isStandardSwitch) {
        const fields = new URLSearchParams(request.postData() ?? '');
        const encodedDestination = fields.get('redirect_uri');
        if (!encodedDestination) return route.abort('failed');

        const destination = new URL(decodeURIComponent(encodedDestination));
        if (destination.protocol !== 'https:' || !isAwsHost(destination.hostname)) {
          return route.abort('blockedbyclient');
        }
        return route.fulfill({
          status: 302,
          headers: { location: destination.toString() },
          body: '',
        });
      }

      const isConsole = hostname.includes('.console.');
      if (!isConsole) {
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<title>AWS sign-in stub</title><main>AWS sign-in response</main>',
        });
      }

      // A leading multi-session label marks the tab as one AWS session among
      // several, mirroring how the Console advertises its session data.
      const [firstLabel = ''] = hostname.split('.');
      const sessionData = firstLabel.startsWith(MULTI_SESSION_PREFIX)
        ? {
            prismModeEnabled: true,
            sessionDifferentiator: firstLabel,
            signInEndpoint: 'eu-west-1.signin.aws.amazon.com',
          }
        : { prismModeEnabled: false, signInEndpoint: 'signin.aws.amazon.com' };

      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<meta name="awsc-session-data" content='${JSON.stringify(sessionData)}'><script>globalThis.AWSC={Auth:{getMbtc:()=>"test-csrf"}}</script><title>AWS Console stub</title><main id="aws-console-stub">AWS Console</main>`,
      });
    });

    await provide(context);
    await context.close();
  },

  extensionId: async ({ context }, provide) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await provide(new URL(worker.url()).host);
  },

  popup: async ({ context, extensionId }, provide) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await provide(page);
  },

  options: async ({ context, extensionId }, provide) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await provide(page);
  },
});

export const expect = test.expect;

export interface SeedProfile {
  type: 'role' | 'sso';
  name: string;
  accountId: string;
  roleName: string;
  environment: string;
  favorite?: boolean;
  tags?: string[];
  partition?: string;
  portalUrl?: string;
  region?: string;
}

export interface SeedOptions {
  profiles?: SeedProfile[];
  settings?: Record<string, unknown>;
}

/**
 * Writes state straight into extension storage. Creating fixtures through the
 * interface is covered by the "add a profile" journey; every other test seeds so
 * it exercises one behaviour rather than re-testing the form.
 */
export async function seed(page: Page, options: SeedOptions = {}): Promise<void> {
  const now = new Date().toISOString();
  const state = {
    version: 4,
    profileLists: [{ id: DEFAULT_LIST_ID, name: 'Default' }],
    activeProfileListId: DEFAULT_LIST_ID,
    defaultProfileListId: DEFAULT_LIST_ID,
    settings: {
      accessMode: 'iam',
      theme: 'system',
      language: 'system',
      openBehavior: 'new',
      confirmProduction: true,
      hideAccountIds: false,
      ...options.settings,
    },
    profiles: (options.profiles ?? []).map((profile, index) => ({
      favorite: false,
      tags: [],
      ...(profile.type === 'role' ? { partition: profile.partition ?? 'aws' } : {}),
      ...profile,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      listId: DEFAULT_LIST_ID,
      colorId: COLORS[index % COLORS.length],
      createdAt: now,
      updatedAt: now,
    })),
  };

  await page.evaluate(
    async ([key, value]) => {
      const extensionApi = (
        globalThis as typeof globalThis & {
          chrome: {
            storage: {
              local: { set: (items: Record<string, unknown>) => Promise<void> };
            };
          };
        }
      ).chrome;
      await extensionApi.storage.local.set({ [key]: value });
    },
    [STORAGE_KEY, state] as const,
  );
  await page.reload();
}

export const SAMPLE_PROFILES: SeedProfile[] = [
  {
    type: 'role',
    name: 'Production admin',
    accountId: '111111111111',
    roleName: 'AdminRole',
    environment: 'production',
  },
  {
    type: 'role',
    name: 'Sandbox developer',
    accountId: '222222222222',
    roleName: 'DeveloperRole',
    environment: 'sandbox',
    tags: ['platform'],
  },
  {
    type: 'sso',
    name: 'Platform access',
    accountId: '333333333333',
    roleName: 'PlatformAccess',
    environment: 'shared',
    portalUrl: 'https://example.awsapps.com/start',
  },
];
