/** @vitest-environment jsdom */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import { PopupApp } from './App';
import { createDefaultState, createProfile, profileDraftSchema } from '../../domain/profile';
import { loadAppState, saveAppState } from '../../storage/app-state';

function draft(overrides: Record<string, unknown> = {}) {
  return profileDraftSchema.parse({
    type: 'role',
    name: 'Production admin',
    accountId: '111111111111',
    roleName: 'AdminRole',
    partition: 'aws',
    environment: 'production',
    favorite: false,
    tags: [],
    ...overrides,
  });
}

async function seed(...drafts: ReturnType<typeof draft>[]): Promise<void> {
  await saveAppState({
    ...createDefaultState(),
    profiles: drafts.map((entry) => createProfile(entry)),
  });
}

/**
 * A profile row holds two buttons: the switch action first, then the favorite
 * toggle. Both accessible names contain the profile name, so tests address the
 * switch action through its row rather than by name alone.
 */
async function switchButton(name: string): Promise<HTMLElement> {
  const row = await waitFor(
    () => profileOptions().find((item) => item.textContent?.includes(name)) ?? raise(name),
  );
  return row;
}

function raise(name: string): never {
  throw new Error(`No profile row containing ${name}.`);
}

function profileOptions(): HTMLElement[] {
  return within(screen.getByRole('listbox', { name: 'AWS profiles' })).getAllByRole('option');
}

function profileOption(): HTMLElement {
  return within(screen.getByRole('listbox', { name: 'AWS profiles' })).getByRole('option');
}

const SAMPLE = [
  draft({ name: 'Production admin', accountId: '111111111111', roleName: 'AdminRole' }),
  draft({
    name: 'Sandbox developer',
    accountId: '222222222222',
    roleName: 'DeveloperRole',
    environment: 'sandbox',
    tags: ['platform'],
  }),
  draft({
    name: 'Staging auditor',
    accountId: '333333333333',
    roleName: 'AuditorRole',
    environment: 'staging',
  }),
];

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(window, 'close').mockImplementation(() => undefined);
  vi.spyOn(browser.runtime, 'openOptionsPage').mockResolvedValue(undefined);
});

describe('PopupApp — empty and error states', () => {
  it('invites the user to add a first profile', async () => {
    await seed();
    render(<PopupApp />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Add your first profile' })).toBeDefined(),
    );
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByLabelText('Search profiles')).toBeNull();
  });

  it('opens the options page from the empty state', async () => {
    await seed();
    render(<PopupApp />);
    const user = userEvent.setup();

    await waitFor(() => screen.getByRole('button', { name: /Add profile/ }));
    await user.click(screen.getByRole('button', { name: /Add profile/ }));

    expect(browser.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it('opens the import view directly from the empty state', async () => {
    await seed();
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({} as never);
    render(<PopupApp />);
    const user = userEvent.setup();

    await user.click(await waitFor(() => screen.getByRole('button', { name: 'Import profiles' })));

    const createdTab = create.mock.calls[0]?.[0];
    expect(createdTab?.url).toContain('/options.html#import');
  });

  it('reports unreadable storage instead of rendering an empty list', async () => {
    await browser.storage.local.set({ 'rolehop.appState': { version: 99 } });
    render(<PopupApp />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByRole('heading', { name: 'Profiles unavailable' })).toBeDefined();
  });
});

describe('PopupApp — search', () => {
  beforeEach(async () => {
    await seed(...SAMPLE);
  });

  it('has a labelled search field and a top-level heading', async () => {
    render(<PopupApp />);
    await waitFor(() => expect(screen.getByLabelText('Search profiles')).toBeDefined());
    expect(screen.getByRole('heading', { level: 1, name: 'AWS Role Hop profiles' })).toBeDefined();
  });

  it('announces how many profiles match the query', async () => {
    render(<PopupApp />);
    const user = userEvent.setup();
    await waitFor(() => screen.getByLabelText('Search profiles'));

    expect(screen.getByRole('status').textContent).toBe('3 profiles available.');

    await user.type(screen.getByLabelText('Search profiles'), 'sandbox');
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('1 of 3 profiles match "sandbox".'),
    );
  });

  it.each([
    ['a profile name', 'Staging auditor', 'Staging auditor'],
    ['an account ID', '222222222222', 'Sandbox developer'],
    ['a role name', 'AuditorRole', 'Staging auditor'],
    ['an environment', 'sandbox', 'Sandbox developer'],
    ['a tag', 'platform', 'Sandbox developer'],
  ])('filters by %s', async (_label, query, expected) => {
    render(<PopupApp />);
    const user = userEvent.setup();
    await waitFor(() => screen.getByLabelText('Search profiles'));

    await user.type(screen.getByLabelText('Search profiles'), query);

    await waitFor(() => {
      const items = profileOptions();
      expect(items).toHaveLength(1);
      expect(items[0]?.textContent).toContain(expected);
    });
  });

  it('supports fuzzy subsequence search and exposes the active option', async () => {
    render(<PopupApp />);
    const user = userEvent.setup();
    const search = await waitFor(() => screen.getByLabelText('Search profiles'));

    await user.type(search, 'prd adm');
    await waitFor(() => expect(profileOptions()).toHaveLength(1));
    expect(profileOption().textContent).toContain('Production admin');
    expect(search.getAttribute('role')).toBe('combobox');
    expect(search.getAttribute('aria-activedescendant')).toBe(profileOption().id);
  });

  it('announces arrow-key selection through aria-activedescendant', async () => {
    render(<PopupApp />);
    const user = userEvent.setup();
    const search = await waitFor(() => screen.getByLabelText('Search profiles'));
    const firstId = profileOptions()[0]!.id;

    expect(search.getAttribute('aria-activedescendant')).toBe(firstId);
    await user.type(search, '{ArrowDown}');
    expect(search.getAttribute('aria-activedescendant')).toBe(profileOptions()[1]!.id);
  });

  it('offers a way back when nothing matches', async () => {
    render(<PopupApp />);
    const user = userEvent.setup();
    await waitFor(() => screen.getByLabelText('Search profiles'));

    await user.type(screen.getByLabelText('Search profiles'), 'nothing-matches-this');

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'No matching profiles' })).toBeDefined(),
    );
    const emptyState = screen
      .getByRole('heading', { name: 'No matching profiles' })
      .closest('section')!;
    await user.click(within(emptyState).getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(profileOptions()).toHaveLength(3));
  });

  it('clears the query with Escape', async () => {
    render(<PopupApp />);
    const user = userEvent.setup();
    await waitFor(() => screen.getByLabelText('Search profiles'));

    const search = screen.getByLabelText('Search profiles');
    await user.type(search, 'sandbox');
    await user.type(search, '{Escape}');

    await waitFor(() => expect(search).toHaveProperty('value', ''));
  });
});

describe('PopupApp — switching profiles', () => {
  function mockAwsConsoleTab() {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: 7, url: 'https://eu-west-1.console.aws.amazon.com/console/home', status: 'complete' },
    ] as never);
    return vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue({ ok: true } as never);
  }

  it('opens a non-production profile in the current tab without confirmation', async () => {
    await seed(draft({ name: 'Sandbox developer', environment: 'sandbox' }));
    const send = mockAwsConsoleTab();

    render(<PopupApp />);
    const user = userEvent.setup();
    await user.click(
      await waitFor(() => screen.getByRole('option', { name: 'Open Sandbox developer in AWS' })),
    );

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const switchCall = send.mock.calls.find(
      ([, message]) => typeof message === 'object' && message !== null && 'type' in message,
    );
    expect(switchCall?.[0]).toBe(7);
    expect(switchCall?.[1]).toMatchObject({
      type: 'rolehop:switch-role',
      account: '111111111111',
      roleName: 'AdminRole',
      displayName: 'Sandbox developer',
      color: 'e98b9a',
    });
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });

  it('confirms before opening a production profile', async () => {
    await seed(draft({ name: 'Production admin', environment: 'production' }));
    const send = mockAwsConsoleTab();

    render(<PopupApp />);
    const user = userEvent.setup();
    await user.click(await switchButton('Production admin'));

    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.getAttribute('aria-labelledby')).toBe('confirm-production-title');
    expect(document.getElementById('confirm-production-title')?.textContent).toBe(
      'Open production profile?',
    );
    expect(send).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Continue to AWS' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  });

  it('abandons the switch when the confirmation is cancelled', async () => {
    await seed(draft({ environment: 'production' }));
    const send = mockAwsConsoleTab();

    render(<PopupApp />);
    const user = userEvent.setup();
    await user.click(await switchButton('Production admin'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(send).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });

  it('duplicates the Console tab for the new-tab preference', async () => {
    await saveAppState({
      ...createDefaultState(),
      settings: { ...createDefaultState().settings, openBehavior: 'new', confirmProduction: false },
      profiles: [createProfile(draft({ environment: 'production' }))],
    });
    mockAwsConsoleTab();
    const duplicate = vi
      .spyOn(browser.tabs, 'duplicate')
      .mockResolvedValue({ id: 8, status: 'complete' } as never);

    render(<PopupApp />);
    const user = userEvent.setup();
    await user.click(await switchButton('Production admin'));

    await waitFor(() => expect(duplicate).toHaveBeenCalledWith(7));
  });

  it('records the profile as recently used', async () => {
    await seed(draft({ environment: 'sandbox' }));
    mockAwsConsoleTab();

    render(<PopupApp />);
    const user = userEvent.setup();
    await user.click(await switchButton('Production admin'));

    await waitFor(async () => {
      expect((await loadAppState()).profiles[0]?.lastUsedAt).toBeDefined();
    });
  });

  it('does not record recency or close the popup when navigation fails', async () => {
    await seed(draft({ environment: 'sandbox' }));
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: 7, url: 'https://example.com', status: 'complete' },
    ] as never);

    render(<PopupApp />);
    const user = userEvent.setup();
    await user.click(await switchButton('Production admin'));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Open AWS Role Hop from an authenticated AWS Console tab',
      ),
    );
    expect((await loadAppState()).profiles[0]?.lastUsedAt).toBeUndefined();
    expect((window.close as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(
      0,
    );
  });
});

describe('PopupApp — favorites', () => {
  it('toggles a favorite and describes the action in the button name', async () => {
    await seed(draft({ name: 'Production admin' }));
    render(<PopupApp />);
    const user = userEvent.setup();

    const favorite = await waitFor(() =>
      screen.getByRole('button', { name: 'Favorite Production admin' }),
    );
    expect(favorite.getAttribute('aria-pressed')).toBe('false');

    await user.click(favorite);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remove Production admin from favorites' }),
      ).toBeDefined(),
    );
    expect((await loadAppState()).profiles[0]?.favorite).toBe(true);
  });

  it('lists favorites before other profiles', async () => {
    await seed(
      draft({ name: 'Alpha', accountId: '111111111111', roleName: 'A' }),
      draft({ name: 'Zulu', accountId: '222222222222', roleName: 'Z', favorite: true }),
    );
    render(<PopupApp />);

    await waitFor(() => expect(profileOptions()).toHaveLength(2));
    expect(profileOptions()[0]?.textContent).toContain('Zulu');
  });
});
