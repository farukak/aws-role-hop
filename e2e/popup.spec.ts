import { test, expect, seed, SAMPLE_PROFILES } from './fixtures';

test.beforeEach(async ({ popup }) => {
  await seed(popup, { profiles: SAMPLE_PROFILES });
});

test('fuzzy search ranks a profile and exposes keyboard selection', async ({ popup }) => {
  const search = popup.getByRole('combobox', { name: 'Search profiles' });
  await search.fill('prd adm');

  await expect(
    popup.getByRole('listbox', { name: 'AWS profiles' }).getByRole('option'),
  ).toHaveCount(1);
  await expect(
    popup.getByRole('listbox', { name: 'AWS profiles' }).getByRole('option'),
  ).toContainText('Production admin');
  const optionId = await popup
    .getByRole('listbox', { name: 'AWS profiles' })
    .getByRole('option')
    .getAttribute('id');
  expect(optionId).not.toBeNull();
  await expect(search).toHaveAttribute('aria-activedescendant', optionId!);
});

test('arrow keys move the active option', async ({ popup }) => {
  const search = popup.getByRole('combobox', { name: 'Search profiles' });
  const options = popup.getByRole('listbox', { name: 'AWS profiles' }).getByRole('option');
  const firstId = await options.nth(0).getAttribute('id');
  const secondId = await options.nth(1).getAttribute('id');

  await expect(search).toHaveAttribute('aria-activedescendant', firstId!);
  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', secondId!);
  await search.press('ArrowUp');
  await expect(search).toHaveAttribute('aria-activedescendant', firstId!);
});

test('favorite changes persist in extension storage', async ({ popup }) => {
  await popup.getByRole('button', { name: 'Favorite Sandbox developer' }).click();
  await expect(
    popup.getByRole('button', { name: 'Remove Sandbox developer from favorites' }),
  ).toBeVisible();

  const favorite = await popup.evaluate(async () => {
    const extensionApi = (
      globalThis as typeof globalThis & {
        chrome: {
          storage: {
            local: { get: (key: string) => Promise<Record<string, unknown>> };
          };
        };
      }
    ).chrome;
    const stored = await extensionApi.storage.local.get('rolehop.appState');
    const state = stored['rolehop.appState'] as { profiles: { name: string; favorite: boolean }[] };
    return state.profiles.find(({ name }) => name === 'Sandbox developer')?.favorite;
  });
  expect(favorite).toBe(true);
});

test('production requires confirmation and cancellation opens no tab', async ({
  context,
  popup,
}) => {
  await popup.getByRole('combobox', { name: 'Search profiles' }).fill('production');
  await popup.getByRole('listbox', { name: 'AWS profiles' }).getByRole('option').click();

  const dialog = popup.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Production admin');
  const pagesBefore = context.pages().length;
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(context.pages()).toHaveLength(pagesBefore);
});

test('IAM launches post directly across consecutive Console reloads', async ({
  context,
  popup,
}) => {
  await seed(popup, {
    settings: { openBehavior: 'current', confirmProduction: false },
    profiles: [
      {
        type: 'role',
        name: 'Sandbox developer',
        accountId: '222222222222',
        roleName: 'DeveloperRole',
        environment: 'sandbox',
        region: 'eu-west-1',
      },
      {
        type: 'role',
        name: 'Audit viewer',
        accountId: '333333333333',
        roleName: 'AuditRole',
        environment: 'shared',
        region: 'ap-southeast-2',
      },
    ],
  });

  const consolePage = await context.newPage();
  await consolePage.goto('https://eu-west-1.console.aws.amazon.com/console/home?region=us-east-1');
  await consolePage.waitForSelector('#aws-console-stub');

  await popup.evaluate(async () => {
    const scope = globalThis as typeof globalThis & {
      chrome: {
        tabs: {
          query: (
            query: Record<string, unknown>,
          ) => Promise<{ id?: number; url?: string; status?: string }[]>;
        };
      };
      close: () => void;
    };
    const originalQuery = scope.chrome.tabs.query.bind(scope.chrome.tabs);
    const [activeTab] = await originalQuery({ active: true, currentWindow: true });
    if (!activeTab) throw new Error('Active AWS Console fixture tab was not found.');
    const consoleTab = {
      ...activeTab,
      url: 'https://eu-west-1.console.aws.amazon.com/console/home?region=us-east-1',
      status: 'complete',
    };
    scope.chrome.tabs.query = async (query) =>
      query.active === true && query.currentWindow === true ? [consoleTab] : originalQuery(query);
    scope.close = () => {};
  });

  const switchRequestPromise = context.waitForEvent('request', (request) => {
    const url = new URL(request.url());
    return (
      request.method() === 'POST' &&
      url.hostname === 'signin.aws.amazon.com' &&
      url.pathname === '/switchrole'
    );
  });

  await popup.getByRole('option', { name: 'Open Sandbox developer in AWS' }).click();
  const switchRequest = await switchRequestPromise;
  const fields = new URLSearchParams(switchRequest.postData() ?? '');

  expect(fields.get('action')).toBe('switchFromBasis');
  expect(fields.get('src')).toBe('nav');
  expect(fields.get('mfaNeeded')).toBe('0');
  expect(fields.get('csrf')).toBe('test-csrf');
  expect(fields.get('account')).toBe('222222222222');
  expect(fields.get('roleName')).toBe('DeveloperRole');
  expect(fields.get('displayName')).toBe('Sandbox developer');
  expect(fields.get('color')).toBe('e98b9a');
  expect(fields.get('color')).toMatch(/^[0-9a-f]{6}$/);
  expect(decodeURIComponent(fields.get('redirect_uri') ?? '')).toBe(
    'https://eu-west-1.console.aws.amazon.com/console/home?region=eu-west-1',
  );
  expect(switchRequest.url()).not.toContain('?account=');
  await consolePage.waitForURL(
    'https://eu-west-1.console.aws.amazon.com/console/home?region=eu-west-1',
    { waitUntil: 'load' },
  );
  await consolePage.waitForSelector('#aws-console-stub');

  await consolePage.goto('https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1');
  await consolePage.waitForSelector('#aws-console-stub');
  await popup.reload();
  await popup.evaluate(async () => {
    const scope = globalThis as typeof globalThis & {
      chrome: {
        tabs: {
          query: (
            query: Record<string, unknown>,
          ) => Promise<{ id?: number; url?: string; status?: string }[]>;
        };
      };
      close: () => void;
    };
    const originalQuery = scope.chrome.tabs.query.bind(scope.chrome.tabs);
    const [activeTab] = await originalQuery({ active: true, currentWindow: true });
    if (!activeTab) throw new Error('Reloaded AWS Console fixture tab was not found.');
    const consoleTab = {
      ...activeTab,
      url: 'https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1',
      status: 'complete',
    };
    scope.chrome.tabs.query = async (query) =>
      query.active === true && query.currentWindow === true ? [consoleTab] : originalQuery(query);
    scope.close = () => {};
  });

  const secondSwitchPromise = context.waitForEvent('request', (request) => {
    if (request.method() !== 'POST') return false;
    const url = new URL(request.url());
    const body = new URLSearchParams(request.postData() ?? '');
    return (
      url.hostname === 'signin.aws.amazon.com' &&
      url.pathname === '/switchrole' &&
      body.get('account') === '333333333333'
    );
  });
  await popup.getByRole('option', { name: 'Open Audit viewer in AWS' }).click();
  const secondSwitch = await secondSwitchPromise;
  const secondFields = new URLSearchParams(secondSwitch.postData() ?? '');
  expect(secondFields.get('account')).toBe('333333333333');
  expect(secondFields.get('roleName')).toBe('AuditRole');
  expect(secondFields.get('displayName')).toBe('Audit viewer');
  expect(decodeURIComponent(secondFields.get('redirect_uri') ?? '')).toBe(
    'https://us-east-1.console.aws.amazon.com/console/home?region=ap-southeast-2',
  );
  await consolePage.waitForURL(
    'https://us-east-1.console.aws.amazon.com/console/home?region=ap-southeast-2',
    { waitUntil: 'load' },
  );
  await consolePage.waitForSelector('#aws-console-stub');
});
