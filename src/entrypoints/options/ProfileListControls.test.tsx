/** @vitest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createDefaultState, type AppState } from '../../domain/profile';
import { addProfile, createProfileList, loadAppState, saveAppState } from '../../storage/app-state';
import { ProfileListControls } from './ProfileListControls';

async function setup(state: AppState = createDefaultState()) {
  await saveAppState(state);
  const notify = vi.fn();
  const user = userEvent.setup();
  render(<ProfileListControls state={state} notify={notify} />);
  return { notify, user };
}

async function stateWithSecondList(): Promise<AppState> {
  await saveAppState(createDefaultState());
  return createProfileList('Customer A');
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('ProfileListControls', () => {
  it('explains active and default lists without duplicating the default label', async () => {
    await setup();
    const selector = screen.getByRole('combobox', { name: 'Active profile list' });
    expect(within(selector).getByRole('option').textContent).toBe('Default');
    expect(screen.getByText('Default list')).toBeDefined();
    expect(screen.getByText(/default list is preselected for imports/i)).toBeDefined();
  });

  it('persists a selected list', async () => {
    const state = await stateWithSecondList();
    const defaultListId = state.defaultProfileListId;
    const { user } = await setup(state);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Active profile list' }),
      defaultListId,
    );

    await waitFor(async () => {
      expect((await loadAppState()).activeProfileListId).toBe(defaultListId);
    });
  });

  it('creates and activates a named list', async () => {
    const { notify, user } = await setup();
    await user.click(screen.getByRole('button', { name: 'New list' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    await user.type(within(dialog).getByLabelText('List name'), 'Customer A');
    await user.click(within(dialog).getByRole('button', { name: 'Create list' }));

    await waitFor(async () => {
      const state = await loadAppState();
      expect(state.profileLists.at(-1)?.name).toBe('Customer A');
      expect(state.activeProfileListId).toBe(state.profileLists.at(-1)?.id);
    });
    expect(notify).toHaveBeenCalledWith('Customer A list created.');
  });

  it('keeps the dialog open and reports duplicate list names', async () => {
    const state = await stateWithSecondList();
    const { notify, user } = await setup(state);
    await user.click(screen.getByRole('button', { name: 'New list' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    await user.type(within(dialog).getByLabelText('List name'), ' customer a ');
    await user.click(within(dialog).getByRole('button', { name: 'Create list' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('A profile list with this name already exists.', 'error'),
    );
    expect(screen.getByRole('dialog', { hidden: true })).toBeDefined();
  });

  it('renames the active list', async () => {
    const state = await stateWithSecondList();
    const { notify, user } = await setup(state);
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    const name = within(dialog).getByLabelText('List name');
    await user.clear(name);
    await user.type(name, 'Customer Alpha');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(async () => {
      expect((await loadAppState()).profileLists.at(-1)?.name).toBe('Customer Alpha');
    });
    expect(notify).toHaveBeenCalledWith('Profile list renamed.');
  });

  it('makes the active list the default', async () => {
    const state = await stateWithSecondList();
    const activeListId = state.activeProfileListId;
    const { notify, user } = await setup(state);
    await user.click(screen.getByRole('button', { name: 'Make default' }));

    await waitFor(async () => {
      expect((await loadAppState()).defaultProfileListId).toBe(activeListId);
    });
    expect(notify).toHaveBeenCalledWith('Customer A is now the default list.');
  });

  it('states the local impact and deletes only the selected list profiles', async () => {
    let state = await stateWithSecondList();
    state = await addProfile(
      {
        type: 'role',
        name: 'Customer admin',
        accountId: '123456789012',
        roleName: 'Admin',
        partition: 'aws',
        environment: 'production',
        favorite: false,
        tags: [],
      },
      state.activeProfileListId,
    );
    const deletedListId = state.activeProfileListId;
    const { notify, user } = await setup(state);

    await user.click(screen.getByRole('button', { name: /^Delete$/ }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(
      within(dialog).getByText('This also removes 1 local profile. Nothing changes in AWS.'),
    ).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: 'Delete list' }));

    await waitFor(async () => {
      const stored = await loadAppState();
      expect(stored.profileLists.some(({ id }) => id === deletedListId)).toBe(false);
      expect(stored.profiles).toHaveLength(0);
    });
    expect(notify).toHaveBeenCalledWith('Customer A list deleted.', 'info');
  });

  it('disables deletion when only one list remains', async () => {
    await setup();
    expect(screen.getByRole('button', { name: /^Delete$/ })).toHaveProperty('disabled', true);
  });
});
