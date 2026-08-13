import { test, expect, seed, SAMPLE_PROFILES } from '../e2e/fixtures';

test('extension loads and the popup renders', async ({ popup, extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  await seed(popup, { profiles: SAMPLE_PROFILES });
  await expect(
    popup.getByRole('heading', { level: 1, name: 'AWS Role Hop profiles' }),
  ).toBeAttached();
  // The seed holds two IAM profiles and one Identity Center profile. IAM mode lists
  // its own and says the rest are one switch away rather than dropping them.
  await expect(
    popup.getByRole('listbox', { name: 'AWS profiles' }).getByRole('option'),
  ).toHaveCount(2);
  await expect(popup.getByText('This list also has Identity Center profiles.')).toBeVisible();

  await popup.getByRole('button', { name: 'Switch to Identity Center' }).click();
  await expect(
    popup.getByRole('listbox', { name: 'AWS profiles' }).getByRole('option'),
  ).toHaveCount(1);
});

test('extension pages avoid Chromium cross-world modulepreload warnings', async ({
  options,
  popup,
}) => {
  await expect(popup.locator('link[rel="modulepreload"]')).toHaveCount(0);
  await expect(options.locator('link[rel="modulepreload"]')).toHaveCount(0);
});

test('first run asks which access path to use before showing profiles', async ({ popup }) => {
  await seed(popup, { profiles: SAMPLE_PROFILES, settings: { accessMode: 'unset' } });

  await expect(popup.getByRole('heading', { name: 'How do you use AWS?' })).toBeVisible();
  await expect(popup.getByRole('listbox', { name: 'AWS profiles' })).toBeHidden();
  await expect(popup.getByText('Needs access to your AWS access portal')).toBeVisible();

  await popup.getByRole('button', { name: /IAM roles/ }).click();

  await expect(popup.getByRole('listbox', { name: 'AWS profiles' })).toBeVisible();
  await expect(popup.getByRole('heading', { name: 'How do you use AWS?' })).toBeHidden();
});
