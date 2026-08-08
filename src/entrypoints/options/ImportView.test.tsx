/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ImportView } from './ImportView';
import { createDefaultState, type AppState } from '../../domain/profile';
import { loadAppState, saveAppState } from '../../storage/app-state';

const AWS_CONFIG = `[profile base]
region = eu-west-1

[profile production-admin]
role_arn = arn:aws:iam::111111111111:role/AdminRole
aws_access_key_id = EXAMPLE_ACCESS_KEY_NOT_STORED

[sso-session corp]
sso_start_url = https://corp.awsapps.com/start

[profile platform]
sso_session = corp
sso_account_id = 222222222222
sso_role_name = PlatformAccess`;

const ORGANIZATIONS = JSON.stringify({
  Accounts: [
    {
      Id: '111111111111',
      Name: 'workload-production',
      Email: 'prod@example.com',
      Status: 'ACTIVE',
    },
    { Id: '222222222222', Name: 'workload-staging', Email: 'stg@example.com', Status: 'ACTIVE' },
    { Id: '333333333333', Name: 'retired', Email: 'old@example.com', Status: 'SUSPENDED' },
  ],
});

function setup(state: AppState = createDefaultState()) {
  const notify = vi.fn();
  const onImported = vi.fn().mockResolvedValue(undefined);
  const onManageList = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ImportView
      state={state}
      notify={notify}
      onImported={onImported}
      onManageList={onManageList}
    />,
  );
  return { notify, onImported, onManageList, rerender: view.rerender, user: userEvent.setup() };
}

function paste(_user: ReturnType<typeof userEvent.setup>, text: string): void {
  fireEvent.change(screen.getByLabelText('AWS configuration'), { target: { value: text } });
}

beforeEach(async () => {
  fakeBrowser.reset();
  await saveAppState(createDefaultState());
});

describe('ImportView — AWS CLI config', () => {
  it('lists the profiles it can import', async () => {
    const { user } = setup();
    paste(user, AWS_CONFIG);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Import details' })).toBeDefined(),
    );
    expect(screen.getByText('production-admin')).toBeDefined();
    expect(screen.getByText('platform')).toBeDefined();
  });

  it('warns that credential fields were stripped', async () => {
    const { user } = setup();
    paste(user, AWS_CONFIG);

    await waitFor(() => expect(screen.getByText('Credential fields were removed')).toBeDefined());

    // The pasted text still shows the key in the editor; what matters is that it
    // never reaches the reviewed profiles.
    const review = screen.getByRole('heading', { name: 'Import details' }).closest('section')!;
    expect(review.textContent).not.toContain('EXAMPLE_ACCESS_KEY_NOT_STORED');
  });

  it('highlights INI sections, keys, values, and credential keys without raw HTML', () => {
    const { user } = setup();
    paste(user, AWS_CONFIG);

    expect(document.querySelector('.syntax-token--section')?.textContent).toBe('[profile base]');
    expect(
      [...document.querySelectorAll('.syntax-token--key')].some(
        (token) => token.textContent === 'region',
      ),
    ).toBe(true);
    expect(
      [...document.querySelectorAll('.syntax-token--value')].some(
        (token) => token.textContent === 'eu-west-1',
      ),
    ).toBe(true);
    expect(document.querySelector('.syntax-token--credential')?.textContent).toBe(
      'aws_access_key_id',
    );
    expect(document.querySelector('.import-code-editor__highlight')?.innerHTML).not.toContain(
      '<script',
    );
  });

  it('explains why a section was not included instead of only counting it', async () => {
    const { user } = setup();
    paste(user, AWS_CONFIG);

    const disclosure = await waitFor(() => screen.getByText(/1 section not included/));
    expect(within(disclosure.closest('details')!).getByText('[profile base]')).toBeDefined();
    expect(
      within(disclosure.closest('details')!).getByText(
        'No role ARN, account ID, or Identity Center fields.',
      ),
    ).toBeDefined();
  });

  it('imports parsed profiles directly into storage', async () => {
    const { notify, onImported, user } = setup();
    paste(user, AWS_CONFIG);

    await waitFor(() => screen.getByRole('button', { name: 'Import 2 profiles' }));
    await user.click(screen.getByRole('button', { name: 'Import 2 profiles' }));

    await waitFor(async () => {
      expect((await loadAppState()).profiles).toHaveLength(2);
    });
    expect(notify).toHaveBeenCalledWith('2 profiles imported.', 'success');
    expect(onImported).toHaveBeenCalledWith(createDefaultState().defaultProfileListId);
  });

  it('creates and populates a named list through the direct import action', async () => {
    const { notify, onImported, user } = setup();
    paste(user, AWS_CONFIG);
    await waitFor(() => screen.getByRole('button', { name: 'Import 2 profiles' }));

    await user.click(screen.getByRole('button', { name: 'New list' }));
    const importButton = screen.getByRole('button', { name: 'Import 2 profiles' });
    expect(importButton).toHaveProperty('disabled', true);

    await user.type(screen.getByLabelText('New profile list name'), 'Platform team');
    expect(importButton).toHaveProperty('disabled', false);
    await user.click(importButton);

    await waitFor(async () => {
      const stored = await loadAppState();
      const destination = stored.profileLists.find((list) => list.name === 'Platform team');
      expect(destination).toBeDefined();
      expect(stored.profiles).toHaveLength(2);
      expect(stored.profiles.every((profile) => profile.listId === destination?.id)).toBe(true);
      expect(stored.activeProfileListId).toBe(destination?.id);
      expect(onImported).toHaveBeenCalledWith(destination?.id);
    });
    expect(notify).toHaveBeenCalledWith('2 profiles imported.', 'success');
  });

  it('preselects the configured default list as the import destination', () => {
    const state = createDefaultState();
    const secondListId = crypto.randomUUID();
    setup({
      ...state,
      profileLists: [...state.profileLists, { id: secondListId, name: 'Customer A' }],
      defaultProfileListId: secondListId,
    });

    expect(screen.getByLabelText('Import into profile list')).toHaveProperty('value', secondListId);
  });

  it('opens the selected destination list for safe profile management', async () => {
    const state = createDefaultState();
    const secondListId = crypto.randomUUID();
    const { onManageList, user } = setup({
      ...state,
      profileLists: [...state.profileLists, { id: secondListId, name: 'Customer A' }],
    });

    await user.selectOptions(screen.getByLabelText('Import into profile list'), secondListId);
    await user.click(screen.getByRole('button', { name: 'Manage selected list' }));

    expect(onManageList).toHaveBeenCalledWith(secondListId);
    expect(
      screen.getByText('Existing profiles are managed in Profiles; raw import text is not stored.'),
    ).toBeDefined();
  });

  it('tracks a default-list change received after the import view mounts', async () => {
    const state = createDefaultState();
    const secondListId = crypto.randomUUID();
    const stateWithSecondList = {
      ...state,
      profileLists: [...state.profileLists, { id: secondListId, name: 'Customer A' }],
    };
    const { notify, onImported, rerender } = setup(stateWithSecondList);

    rerender(
      <ImportView
        state={{ ...stateWithSecondList, defaultProfileListId: secondListId }}
        notify={notify}
        onImported={onImported}
        onManageList={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Import into profile list')).toHaveProperty(
        'value',
        secondListId,
      ),
    );
  });

  it('reports a malformed role ARN in the review step', async () => {
    const { user } = setup();
    paste(user, '[profile broken]\nrole_arn = arn:aws:iam::123:role/Admin');

    await waitFor(() => expect(screen.getByText(/1 entries need attention/)).toBeDefined());
    expect(screen.getByText(/Role ARN must contain a supported partition/)).toBeDefined();
  });
});

describe('ImportView — Organizations output', () => {
  it('asks for a role before producing any profile', async () => {
    const { user } = setup();
    paste(user, ORGANIZATIONS);

    await waitFor(() => expect(screen.getByText(/2 active accounts found/)).toBeDefined());
    expect(screen.getByLabelText('Role name or path')).toBeDefined();
    expect(screen.getByText('0 valid profiles are ready.')).toBeDefined();
    expect(screen.getByRole('button', { name: /^Import/ })).toHaveProperty('disabled', true);
  });

  it('reports the accounts it skipped as inactive', async () => {
    const { user } = setup();
    paste(user, ORGANIZATIONS);

    await waitFor(() => expect(screen.getByText(/1 inactive account skipped/)).toBeDefined());
  });

  it('creates one profile per account once a role is given', async () => {
    const { user } = setup();
    paste(user, ORGANIZATIONS);

    await waitFor(() => screen.getByLabelText('Role name or path'));
    await user.type(screen.getByLabelText('Role name or path'), 'OrganizationAccountAccessRole');

    await waitFor(() => expect(screen.getByText('2 valid profiles are ready.')).toBeDefined());
    expect(screen.getByText('workload-production')).toBeDefined();
    expect(screen.getByText('workload-staging')).toBeDefined();
  });

  it('never shows an account email address', async () => {
    const { user } = setup();
    paste(user, ORGANIZATIONS);
    await waitFor(() => screen.getByLabelText('Role name or path'));
    await user.type(screen.getByLabelText('Role name or path'), 'Role');

    await waitFor(() => expect(screen.getByText('2 valid profiles are ready.')).toBeDefined());
    const review = screen.getByRole('heading', { name: 'Import details' }).closest('section')!;
    expect(review.textContent).not.toContain('example.com');
  });

  it('applies the chosen partition to every generated profile', async () => {
    const { user } = setup();
    paste(user, ORGANIZATIONS);

    await waitFor(() => screen.getByLabelText('Role name or path'));
    await user.type(screen.getByLabelText('Role name or path'), 'Role');
    await user.selectOptions(screen.getByLabelText('AWS partition'), 'aws-cn');
    await user.click(screen.getByRole('button', { name: /^Import/ }));

    await waitFor(async () => {
      const { profiles } = await loadAppState();
      expect(profiles).toHaveLength(2);
      expect(profiles.every((p) => p.type === 'role' && p.partition === 'aws-cn')).toBe(true);
    });
  });

  it('surfaces an invalid role name per account rather than failing silently', async () => {
    const { user } = setup();
    paste(user, ORGANIZATIONS);

    await waitFor(() => screen.getByLabelText('Role name or path'));
    await user.type(screen.getByLabelText('Role name or path'), 'bad role');

    await waitFor(() => expect(screen.getByText(/2 entries need attention/)).toBeDefined());
  });
});

describe('ImportView — unrecognized input', () => {
  it('gives one clear explanation instead of a list of parse errors', async () => {
    const { user } = setup();
    paste(user, 'id,name\n111111111111,prod');

    await waitFor(() => expect(screen.getByText('Unrecognized format')).toBeDefined());
    expect(screen.getByText(/Expected INI sections such as \[profile name\]/)).toBeDefined();
    expect(screen.queryByText(/entries need attention/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Import details' })).toBeNull();
  });

  it('keeps direct import disabled for an empty configuration', () => {
    const { notify } = setup();

    expect(notify).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Import profiles' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.queryByRole('button', { name: 'Review import' })).toBeNull();
  });

  it('clears the configuration and the preview together', async () => {
    const { user } = setup();
    paste(user, AWS_CONFIG);
    await waitFor(() => screen.getByRole('heading', { name: 'Import details' }));

    await user.click(screen.getByRole('button', { name: 'Clear configuration' }));

    expect(screen.queryByRole('heading', { name: 'Import details' })).toBeNull();
    expect(screen.getByLabelText('AWS configuration')).toHaveProperty('value', '');
  });
});
