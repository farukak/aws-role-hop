import { readFile } from 'node:fs/promises';
import { test, expect, seed, SAMPLE_PROFILES } from './fixtures';

test('adds, edits, and deletes an IAM profile', async ({ options }) => {
  await seed(options);

  await options.getByRole('button', { name: 'Add profile' }).click();
  let dialog = options.getByRole('dialog');
  await dialog.getByLabel('Profile name').fill('Operations read-only');
  await dialog.getByLabel('Account ID or alias').fill('444444444444');
  await dialog.getByLabel('Role name or path').fill('team/ReadOnly');
  await dialog.getByLabel('Landing region').fill('eu-west-1');
  await dialog.getByRole('button', { name: 'Add profile' }).click();
  await expect(options.getByRole('heading', { name: 'Operations read-only' })).toBeVisible();

  const card = options.getByRole('article').filter({ hasText: 'Operations read-only' });
  await card.getByRole('button', { name: 'Edit' }).click();
  dialog = options.getByRole('dialog');
  await dialog.getByLabel('Profile name').fill('Operations audit');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(options.getByRole('heading', { name: 'Operations audit' })).toBeVisible();

  const editedCard = options.getByRole('article').filter({ hasText: 'Operations audit' });
  await editedCard.getByRole('button', { name: 'Delete' }).click();
  dialog = options.getByRole('dialog');
  await expect(dialog).toContainText('does not change anything in AWS');
  await dialog.getByRole('button', { name: 'Delete profile' }).click();
  await expect(options.getByRole('heading', { name: 'Operations audit' })).toHaveCount(0);
});

test('persists a manually selected profile color', async ({ options }) => {
  await seed(options);

  await options.getByRole('button', { name: 'Add profile' }).click();
  let dialog = options.getByRole('dialog');
  await dialog.getByLabel('Profile name').fill('Lilac operations');
  await dialog.getByLabel('Account ID or alias').fill('444444444444');
  await dialog.getByLabel('Role name or path').fill('ReadOnly');
  await dialog.getByRole('button', { name: 'Choose profile color' }).click();

  const picker = dialog.getByRole('group', { name: 'Profile color' });
  await expect(picker.getByRole('radio')).toHaveCount(9);
  await picker.getByText('Soft lilac', { exact: true }).click();
  await expect(dialog.getByText('Soft lilac · selected manually')).toBeVisible();
  await dialog.screenshot({ path: '/tmp/aws-role-hop-profile-color-picker.png' });
  await dialog.getByRole('button', { name: 'Add profile' }).click();

  const storedColor = await options.evaluate(async () => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: {
        storage: { local: { get: (key: string) => Promise<Record<string, unknown>> } };
      };
    };
    const stored = await extensionGlobal.chrome.storage.local.get('rolehop.appState');
    const state = stored['rolehop.appState'] as { profiles: { colorId: string }[] };
    return state.profiles[0]?.colorId;
  });
  expect(storedColor).toBe('lilac');

  const card = options.getByRole('article').filter({ hasText: 'Lilac operations' });
  await card.getByRole('button', { name: 'Edit' }).click();
  dialog = options.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Choose profile color' }).click();
  await expect(dialog.getByRole('radio', { name: 'Soft lilac' })).toBeChecked();
});

test('imports a complex AWS config with source profile defaults', async ({ options }) => {
  await seed(options);
  await options.getByRole('button', { name: 'Import', exact: true }).click();
  await options.getByLabel('AWS configuration').fill(`
[base]
aws_account_id = 000011112222
target_role_name = Developer
target_region = eu-west-1

[workload-production]
aws_account_id = 555555555555
source_profile = base
`);
  await expect(options.getByText('1 valid profile is ready.')).toBeVisible();
  await options.getByRole('button', { name: 'Import 1 profile' }).click();
  await expect(options.getByRole('heading', { level: 1, name: 'Profiles' })).toBeVisible();
  await expect(options.getByRole('heading', { name: 'workload-production' })).toBeVisible();
});

test('creates a named list during direct import without storing raw configuration', async ({
  options,
}) => {
  await seed(options);
  await options.getByRole('button', { name: 'Import', exact: true }).click();

  const rawConfig = `[profile platform-audit]
role_arn = arn:aws:iam::999999999999:role/Audit
aws_access_key_id = EXAMPLE_NOT_STORED`;
  await options.getByLabel('AWS configuration').fill(rawConfig);
  await expect(options.getByRole('heading', { name: 'Import details' })).toBeVisible();
  await expect(options.locator('.syntax-token--credential')).toHaveText('aws_access_key_id');

  await options.getByRole('button', { name: 'New list' }).click();
  await expect(options.getByRole('button', { name: 'Import 1 profile' })).toBeDisabled();
  await options.getByLabel('New profile list name').fill('Platform team');
  await options.getByRole('button', { name: 'Import 1 profile' }).click();

  await expect(options.getByRole('heading', { level: 1, name: 'Profiles' })).toBeVisible();
  await expect(options.getByRole('heading', { name: 'platform-audit' })).toBeVisible();
  await expect(options.getByLabel('Active profile list').locator('option:checked')).toHaveText(
    'Platform team',
  );
  const stored = await options.evaluate(async () => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: {
        storage: { local: { get: () => Promise<Record<string, unknown>> } };
      };
    };
    return extensionGlobal.chrome.storage.local.get();
  });
  expect(JSON.stringify(stored)).not.toContain(rawConfig);
  expect(JSON.stringify(stored)).not.toContain('EXAMPLE_NOT_STORED');
});

test('imports active Organizations accounts without exposing email addresses', async ({
  options,
}) => {
  await seed(options);
  await options.getByRole('button', { name: 'Import', exact: true }).click();
  await options.getByLabel('AWS configuration').fill(
    JSON.stringify({
      Accounts: [
        {
          Id: '666666666666',
          Name: 'payments-production',
          Email: 'owner@example.com',
          State: 'ACTIVE',
        },
        { Id: '777777777777', Name: 'retired', Email: 'old@example.com', State: 'CLOSED' },
      ],
    }),
  );
  await expect(options.getByText('1 inactive account skipped.')).toBeVisible();
  await expect(
    options.locator('.import-review').getByText(/owner@example\.com|old@example\.com/),
  ).toHaveCount(0);
  await options.getByLabel('Role name or path').fill('OrganizationAccountAccessRole');
  await options.getByRole('button', { name: 'Import 1 profile' }).click();
  await expect(options.getByRole('heading', { level: 1, name: 'Profiles' })).toBeVisible();
  await expect(options.getByRole('heading', { name: 'payments-production' })).toBeVisible();
});

test('manages a named list and uses the default list as the import destination', async ({
  options,
}) => {
  await seed(options);

  await options.getByRole('button', { name: 'New list' }).click();
  let dialog = options.getByRole('dialog');
  await dialog.getByLabel('List name').fill('Customer A');
  await dialog.getByRole('button', { name: 'Create list' }).click();

  await options.getByRole('button', { name: 'Rename' }).click();
  dialog = options.getByRole('dialog');
  await dialog.getByLabel('List name').fill('Customer Alpha');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await options.getByRole('button', { name: 'Make default' }).click();

  await options.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(options.getByLabel('Import into profile list').locator('option:checked')).toHaveText(
    'Customer Alpha — Default',
  );

  await options.getByLabel('AWS configuration').fill(`
[profile customer-readonly]
aws_account_id = 888888888888
role_name = ReadOnly
`);
  await options.getByRole('button', { name: 'Import 1 profile' }).click();
  await expect(options.getByRole('heading', { name: 'customer-readonly' })).toBeVisible();

  await options.locator('.profile-list-controls').getByRole('button', { name: 'Delete' }).click();
  dialog = options.getByRole('dialog');
  await expect(dialog).toContainText('This also removes 1 local profile');
  await dialog.getByRole('button', { name: 'Delete list' }).click();
  await expect(options.getByRole('heading', { name: 'customer-readonly' })).toHaveCount(0);
});

test('opens the selected import destination for safe management', async ({ options }) => {
  await seed(options, { profiles: SAMPLE_PROFILES });
  await options.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(options.getByText(/raw import text is not stored/)).toBeVisible();
  await options.getByRole('button', { name: 'Manage selected list' }).click();

  await expect(options.getByRole('heading', { level: 1, name: 'Profiles' })).toBeVisible();
  await expect(options.getByRole('heading', { name: 'Production admin' })).toBeVisible();
});

test('persists Turkish and rerenders the interface immediately', async ({ options }) => {
  await seed(options);
  await options.getByRole('button', { name: 'Preferences' }).click();
  await options.getByRole('radio', { name: /Turkish/ }).click();

  await expect(options.getByRole('heading', { name: 'Tercihler' })).toBeVisible();
  await expect(options.getByRole('navigation', { name: 'Ayarlar' })).toBeVisible();
});

test('exports, resets, and restores a local backup', async ({ options }) => {
  await seed(options, { profiles: SAMPLE_PROFILES });
  await options.getByRole('button', { name: 'Preferences' }).click();

  const [download] = await Promise.all([
    options.waitForEvent('download'),
    options.getByRole('button', { name: 'Export backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^aws-role-hop-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('Playwright did not retain the backup download.');
  const backup = await readFile(downloadPath);
  expect(JSON.parse(backup.toString())).toMatchObject({ version: 4, profiles: { length: 3 } });

  await options.getByRole('button', { name: 'Reset all data' }).click();
  await options.getByRole('dialog').getByRole('button', { name: 'Reset data' }).click();
  await expect(options.getByText('0 profiles stored in this browser.')).toBeVisible();

  await options.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: 'aws-role-hop-backup.json',
    mimeType: 'application/json',
    buffer: backup,
  });
  await expect(options.getByText('3 profiles stored in this browser.')).toBeVisible();
});
