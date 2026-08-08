/** @vitest-environment jsdom */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ProfilesView } from './ProfilesView';
import {
  createDefaultState,
  createProfile,
  profileDraftSchema,
  type AppState,
} from '../../domain/profile';
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

const SAMPLE = [
  draft({ name: 'Production admin', accountId: '111111111111', roleName: 'AdminRole' }),
  draft({
    name: 'Sandbox developer',
    accountId: '222222222222',
    roleName: 'DeveloperRole',
    environment: 'sandbox',
    tags: ['platform'],
  }),
];

function setup(profiles = SAMPLE, settings: Partial<AppState['settings']> = {}) {
  const state: AppState = {
    ...createDefaultState(),
    settings: { ...createDefaultState().settings, ...settings },
    profiles: profiles.map((entry) => createProfile(entry)),
  };
  const notify = vi.fn();
  const onImport = vi.fn();
  render(<ProfilesView state={state} notify={notify} onImport={onImport} />);
  return { notify, onImport, state, user: userEvent.setup() };
}

beforeEach(async () => {
  fakeBrowser.reset();
  await saveAppState(createDefaultState());
});

describe('ProfilesView — listing', () => {
  it('shows a heading and every profile', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Profiles' })).toBeDefined();
    expect(screen.getByText('Production admin')).toBeDefined();
    expect(screen.getByText('Sandbox developer')).toBeDefined();
  });

  it('offers clear create and import paths when the active list is empty', async () => {
    const { onImport, user } = setup([]);
    expect(screen.getByRole('heading', { name: 'This list has no profiles yet' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add one profile' })).toBeDefined();
    expect(screen.queryByLabelText('Search profiles')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Import profiles' }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it('groups a 12-digit account ID for readability', () => {
    setup();
    expect(screen.getByText('1111 1111 1111')).toBeDefined();
  });

  it('masks account IDs when the preference is enabled', () => {
    setup(SAMPLE, { hideAccountIds: true });
    expect(screen.getByText('•••• 1111')).toBeDefined();
    expect(screen.queryByText('1111 1111 1111')).toBeNull();
  });
});

describe('ProfilesView — search', () => {
  it('announces the filtered count in a live region', async () => {
    const { user } = setup();
    expect(screen.getByRole('status').textContent).toBe('2 profiles');

    await user.type(screen.getByLabelText('Search profiles'), 'sandbox');

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('1 of 2 match'));
  });

  it.each([
    ['a name', 'Production', 'Production admin'],
    ['an account ID', '222222222222', 'Sandbox developer'],
    ['a role', 'DeveloperRole', 'Sandbox developer'],
    ['a tag', 'platform', 'Sandbox developer'],
  ])('filters by %s', async (_label, query, expected) => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Search profiles'), query);

    await waitFor(() => {
      expect(screen.getByText(expected)).toBeDefined();
    });
  });
});

describe('ProfilesView — delete', () => {
  async function openDeleteDialog(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
    const row = screen
      .getAllByRole('article')
      .find((item) => item.textContent?.includes('Production admin'));
    const trigger =
      row && within(row).queryByRole('button', { name: /Delete/ })
        ? within(row).getByRole('button', { name: /Delete/ })
        : screen.getAllByRole('button', { name: /Delete/ })[0]!;
    await user.click(trigger);
    return screen.getByRole('dialog', { hidden: true });
  }

  it('names and describes the confirmation dialog', async () => {
    const { user } = setup();
    const dialog = await openDeleteDialog(user);

    expect(dialog.getAttribute('aria-labelledby')).toBe('delete-profile-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('delete-profile-description');
    expect(document.getElementById('delete-profile-title')?.textContent).toContain('Delete');
  });

  it('states that AWS itself is untouched', async () => {
    const { user } = setup();
    await openDeleteDialog(user);
    expect(
      screen.getByText('This removes the local profile only. It does not change anything in AWS.'),
    ).toBeDefined();
  });

  it('keeps the profile when the dialog is cancelled', async () => {
    const { user, state } = setup();
    await saveAppState(state);
    await openDeleteDialog(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    expect(screen.getByText('Production admin')).toBeDefined();
    expect((await loadAppState()).profiles).toHaveLength(2);
  });
});

describe('ProfilesView — editing', () => {
  it('opens the dialog for a new profile', async () => {
    const { user } = setup([]);
    await user.click(screen.getAllByRole('button', { name: /Add profile/ })[0]!);

    await waitFor(() =>
      expect(document.getElementById('profile-dialog-title')?.textContent).toBe(
        'Add an AWS profile',
      ),
    );
  });
});
