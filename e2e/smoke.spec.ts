import { test, expect, seed, SAMPLE_PROFILES } from '../e2e/fixtures';

test('extension loads and the popup renders', async ({ popup, extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  await seed(popup, { profiles: SAMPLE_PROFILES });
  await expect(
    popup.getByRole('heading', { level: 1, name: 'AWS Role Hop profiles' }),
  ).toBeAttached();
  await expect(
    popup.getByRole('listbox', { name: 'AWS profiles' }).getByRole('option'),
  ).toHaveCount(3);
});

test('extension pages avoid Chromium cross-world modulepreload warnings', async ({
  options,
  popup,
}) => {
  await expect(popup.locator('link[rel="modulepreload"]')).toHaveCount(0);
  await expect(options.locator('link[rel="modulepreload"]')).toHaveCount(0);
});
