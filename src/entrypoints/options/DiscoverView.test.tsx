/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DiscoverView } from './DiscoverView';
import {
  createDefaultState,
  createProfile,
  profileDraftSchema,
  type AppState,
  type ProfileDraft,
} from '../../domain/profile';
import { loadAppState, saveAppState } from '../../storage/app-state';
import {
  discoverPortalProfiles,
  PortalDiscoveryError,
  requestPortalAccess,
} from '../../discovery/portal-session';
import type * as PortalSession from '../../discovery/portal-session';

vi.mock('../../discovery/portal-session', async (importOriginal) => {
  const actual = await importOriginal<typeof PortalSession>();
  return { ...actual, requestPortalAccess: vi.fn(), discoverPortalProfiles: vi.fn() };
});

const PORTAL = 'https://ssoins-1234567890abcdef.portal.eu-west-1.app.aws';
const requestAccess = vi.mocked(requestPortalAccess);
const discover = vi.mocked(discoverPortalProfiles);

function ssoDraft(name: string, accountId: string, roleName: string): ProfileDraft {
  return profileDraftSchema.parse({
    type: 'sso',
    name,
    accountId,
    roleName,
    portalUrl: PORTAL,
    environment: 'other',
    favorite: false,
    tags: [],
  });
}

function stateWithPortal(): AppState {
  const base = createDefaultState();
  return {
    ...base,
    settings: { ...base.settings },
    profiles: [createProfile(ssoDraft('Existing', '111111111111', 'ReadOnly'))],
  };
}

function setup(state: AppState) {
  const notify = vi.fn();
  const onImported = vi.fn();
  render(<DiscoverView state={state} notify={notify} onImported={onImported} />);
  return { notify, onImported, user: userEvent.setup() };
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
  await saveAppState(createDefaultState());
});

describe('DiscoverView', () => {
  it('starts from the portal an existing profile already uses', () => {
    setup(stateWithPortal());
    // Stored portals are normalized, so a root-hosted portal keeps its trailing slash.
    expect(screen.getByLabelText('Access portal URL')).toHaveProperty('value', `${PORTAL}/`);
  });

  it('discloses that portal access is optional and read-only', () => {
    setup(stateWithPortal());
    expect(screen.getByText('Portal access stays optional')).toBeDefined();
    expect(screen.getByText(/no token is ever read or stored/)).toBeDefined();
  });

  it('lists what the portal reported and adds the selection to a list', async () => {
    requestAccess.mockResolvedValue(true);
    discover.mockResolvedValue({
      drafts: [
        ssoDraft('Core Production', '024314596708', 'PlatformAccess'),
        ssoDraft('Core Test', '315351460784', 'ReadOnly'),
      ],
      accountCount: 2,
      skipped: 0,
    });
    const { user, notify, onImported } = setup(stateWithPortal());

    await user.click(screen.getByRole('button', { name: /Find accounts and roles/ }));

    await waitFor(() => expect(screen.getByText('Found 2 roles across 2 accounts.')).toBeDefined());
    expect(screen.getByText('Core Production')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Add selected profiles' }));

    await waitFor(async () => {
      const stored = await loadAppState();
      expect(stored.profiles.map((profile) => profile.roleName).sort()).toEqual([
        'PlatformAccess',
        'ReadOnly',
      ]);
    });
    expect(notify).toHaveBeenCalledWith('2 added, 0 already existed.');
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('adds only the roles that are still selected', async () => {
    requestAccess.mockResolvedValue(true);
    discover.mockResolvedValue({
      drafts: [
        ssoDraft('Core Production', '024314596708', 'PlatformAccess'),
        ssoDraft('Core Test', '315351460784', 'ReadOnly'),
      ],
      accountCount: 2,
      skipped: 0,
    });
    const { user } = setup(stateWithPortal());

    await user.click(screen.getByRole('button', { name: /Find accounts and roles/ }));
    await waitFor(() => screen.getByRole('button', { name: 'Clear selection' }));
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    await user.click(screen.getAllByRole('checkbox')[1]!);
    await user.click(screen.getByRole('button', { name: 'Add selected profiles' }));

    await waitFor(async () => {
      const stored = await loadAppState();
      expect(stored.profiles.map((profile) => profile.roleName)).toEqual(['ReadOnly']);
    });
  });

  it('explains a refused permission instead of failing silently', async () => {
    requestAccess.mockResolvedValue(false);
    const { user } = setup(stateWithPortal());

    await user.click(screen.getByRole('button', { name: /Find accounts and roles/ }));

    await waitFor(() =>
      expect(
        screen.getByText('Portal access is needed before AWS Role Hop can read your accounts.'),
      ).toBeDefined(),
    );
    expect(discover).not.toHaveBeenCalled();
  });

  it('tells the user to sign in when the portal session has expired', async () => {
    requestAccess.mockResolvedValue(true);
    discover.mockRejectedValue(new PortalDiscoveryError('unauthorized', 'nope'));
    const { user } = setup(stateWithPortal());

    await user.click(screen.getByRole('button', { name: /Find accounts and roles/ }));

    await waitFor(() =>
      expect(
        screen.getByText('Sign in to the access portal in a tab, then try again.'),
      ).toBeDefined(),
    );
  });

  it('says so when the portal offers nothing', async () => {
    requestAccess.mockResolvedValue(true);
    discover.mockResolvedValue({ drafts: [], accountCount: 0, skipped: 0 });
    const { user } = setup(stateWithPortal());

    await user.click(screen.getByRole('button', { name: /Find accounts and roles/ }));

    await waitFor(() =>
      expect(screen.getByText('Nothing was found in this portal.')).toBeDefined(),
    );
    expect(screen.queryByRole('button', { name: 'Add selected profiles' })).toBeNull();
  });

  it('cannot search without a portal address', () => {
    const base = createDefaultState();
    setup({ ...base, settings: { ...base.settings } });
    expect(
      screen.getByRole('button', { name: /Find accounts and roles/ }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

describe('DiscoverView — portal handed over from the popup', () => {
  it('prefills the portal the popup saw', () => {
    window.history.replaceState(null, '', `/#discover?portal=${encodeURIComponent(PORTAL)}`);
    const base = createDefaultState();
    setup({ ...base, settings: { ...base.settings } });

    expect(screen.getByLabelText('Access portal URL')).toHaveProperty('value', PORTAL);
  });

  it('ignores a handed-over address that is not an access portal', () => {
    window.history.replaceState(
      null,
      '',
      `/#discover?portal=${encodeURIComponent('https://portal.example.com/start')}`,
    );
    const base = createDefaultState();
    setup({ ...base, settings: { ...base.settings } });

    expect(screen.getByLabelText('Access portal URL')).toHaveProperty('value', '');
  });
});
