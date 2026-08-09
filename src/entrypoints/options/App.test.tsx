/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createDefaultState } from '../../domain/profile';
import { saveAppState } from '../../storage/app-state';
import { OptionsApp, resolveOptionsView } from './App';

beforeEach(async () => {
  fakeBrowser.reset();
  window.history.replaceState(null, '', '/');
  await saveAppState(createDefaultState());
});

describe('options deep links', () => {
  it.each([
    ['#import', 'import'],
    ['#preferences', 'preferences'],
    ['#whats-new', 'whats-new'],
    ['#profiles', 'profiles'],
    ['#unknown', 'profiles'],
  ] as const)('resolves %s to %s', (hash, expected) => {
    expect(resolveOptionsView(hash)).toBe(expected);
  });

  it('opens the import screen directly from #import', async () => {
    window.history.replaceState(null, '', '/#import');
    render(<OptionsApp />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Import profiles' })).toBeDefined(),
    );
    expect(screen.getByRole('button', { name: 'Import' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it("opens the What's New screen directly from #whats-new", async () => {
    window.history.replaceState(null, '', '/#whats-new');
    render(<OptionsApp />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: "What's new" })).toBeDefined(),
    );
    expect(screen.getByRole('button', { name: 'Preferences' }).getAttribute('aria-current')).toBe(
      null,
    );
  });
});
