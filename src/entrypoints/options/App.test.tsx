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
    ['#discover', 'discover'],
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
    expect(screen.getByRole('button', { name: "What's new" }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('shows the creator credit below the local-only privacy card', async () => {
    render(<OptionsApp />);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Built by Faruk AK on GitHub' })).toBeDefined(),
    );
    const footer = document.querySelector('.options-sidebar__footer');
    const link = screen.getByRole('link', { name: 'Built by Faruk AK on GitHub' });

    expect(footer?.firstElementChild?.classList.contains('options-sidebar__privacy')).toBe(true);
    expect(footer?.lastElementChild).toBe(link);
    expect(link.getAttribute('href')).toBe('https://github.com/farukak');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });
});

describe('options navigation follows the access mode', () => {
  async function seedMode(accessMode: 'iam' | 'sso'): Promise<void> {
    const base = createDefaultState();
    await saveAppState({ ...base, settings: { ...base.settings, accessMode } });
  }

  it('hides discovery while IAM mode is active', async () => {
    await seedMode('iam');
    render(<OptionsApp />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).toBeDefined());
    expect(screen.queryByRole('button', { name: 'Discover' })).toBeNull();
  });

  it('offers discovery in Identity Center mode', async () => {
    await seedMode('sso');
    render(<OptionsApp />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Discover' })).toBeDefined());
  });
});
