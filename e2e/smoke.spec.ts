import { test, expect, seed, SAMPLE_PROFILES } from '../e2e/fixtures';

test('extension loads and the popup renders', async ({ popup, extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  await seed(popup, { profiles: SAMPLE_PROFILES });
  await expect(
    popup.getByRole('heading', { level: 1, name: 'AWS Role Hop profiles' }),
  ).toBeAttached();
  // The popup shows the active list as it is; the list picker is the only context.
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

test('a focused field shows one ring, not a second one inside it', async ({ popup }) => {
  await seed(popup, { profiles: SAMPLE_PROFILES });

  const search = popup.getByRole('combobox', { name: 'Search profiles' });
  await search.click();

  // The wrapper owns the ring. A ring on the input as well survives only as two
  // vertical lines at its edges, which is what this guards against.
  await expect(search).toHaveCSS('box-shadow', 'none');
  const wrapper = popup.locator('.popup-search');
  expect(await wrapper.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
});
