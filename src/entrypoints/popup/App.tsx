import { useMemo, useRef, useState, useEffect, type KeyboardEvent } from 'react';
import {
  ArrowRight,
  FileInput,
  Layers3,
  Plus,
  Radar,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { PortalScan } from './PortalScan';
import { Brand } from '../../components/Brand';
import {
  EnvironmentBadge,
  formatAccountId,
  ProfileAvatar,
  ProfileTypeBadge,
  getProfileToneStyle,
} from '../../components/ProfileVisual';
import { StatusCard } from '../../components/StatusCard';
import { navigateToProfile, RoleSwitchError } from '../../domain/navigation';
import {
  builtInListName,
  isAllowedPortalUrl,
  isSsoList,
  normalizePortalUrl,
  sortProfiles,
  type Profile,
} from '../../domain/profile';
import { searchProfiles } from '../../domain/search';
import { useAppState, useTheme } from '../../hooks/useAppState';
import type { AwsSwitchFailureCode } from '../../domain/role-handoff';
import { useI18n, type Message } from '../../i18n';
import { markProfileUsed, setActiveProfileList, toggleFavorite } from '../../storage/app-state';

const SWITCH_FAILURE_MESSAGES: Record<AwsSwitchFailureCode, Message> = {
  unauthorized:
    'AWS did not authorize this switch. Check that this session may assume the role, then sign in again if needed.',
  chained:
    'This AWS Console session already assumed a role. Multi-session switches have to start from the session you signed in with.',
  sessionMissing: 'This AWS Console session is no longer available. Reload the tab and try again.',
  throttled: 'AWS is limiting switch requests right now. Wait a moment and try again.',
  unavailable: 'AWS could not complete the switch. Try again in a moment.',
  rejected: 'AWS rejected the switch request.',
};

export function PopupApp() {
  const { t } = useI18n();
  const { state, loading, error } = useAppState();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [pendingProduction, setPendingProduction] = useState<Profile | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [portalTabUrl, setPortalTabUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useTheme(state?.settings.theme);

  // `activeTab` reveals the tab the popup was opened from, which is how a portal
  // can be offered for scanning without asking for standing tab access.
  useEffect(() => {
    void (async () => {
      try {
        const [active] = await browser.tabs.query({ active: true, currentWindow: true });
        const url = typeof active?.url === 'string' ? active.url : '';
        if (url !== '' && isAllowedPortalUrl(url)) setPortalTabUrl(normalizePortalUrl(url));
      } catch {
        // The scan shortcut is a convenience; the popup works without it.
      }
    })();
  }, []);

  const listProfiles = useMemo(
    () => state?.profiles.filter(({ listId }) => listId === state.activeProfileListId) ?? [],
    [state],
  );
  /**
   * The list on screen decides the context: the SSO list is filled by discovery,
   * every other list by adding or importing IAM roles.
   */
  const ssoContext = useMemo(() => {
    const active = state?.profileLists.find(({ id }) => id === state.activeProfileListId);
    return active !== undefined && isSsoList(active);
  }, [state]);
  const profiles = useMemo(
    () => searchProfiles(sortProfiles(listProfiles), query),
    [listProfiles, query],
  );

  const activeIndex = Math.min(selectedIndex, Math.max(profiles.length - 1, 0));

  async function switchToProfile(profile: Profile): Promise<void> {
    if (!state) return;
    setActionError(null);
    setBusyProfileId(profile.id);
    try {
      await navigateToProfile(profile, state.settings.openBehavior);
      await markProfileUsed(profile.id);
      window.close();
    } catch (switchError: unknown) {
      const failureCode = switchError instanceof RoleSwitchError ? switchError.code : undefined;
      setActionError(
        failureCode
          ? t(SWITCH_FAILURE_MESSAGES[failureCode])
          : switchError instanceof Error
            ? switchError.message
            : t('The browser could not open this profile.'),
      );
      setBusyProfileId(null);
    }
  }

  function requestSwitch(profile: Profile): void {
    if (state?.settings.confirmProduction && profile.environment === 'production') {
      setPendingProduction(profile);
      return;
    }
    void switchToProfile(profile);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((current) => (profiles.length ? (current + 1) % profiles.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((current) =>
        profiles.length ? (current - 1 + profiles.length) % profiles.length : 0,
      );
    } else if (event.key === 'Enter') {
      const profile = profiles[activeIndex];
      if (profile) {
        event.preventDefault();
        requestSwitch(profile);
      }
    } else if (event.key === 'Escape' && query) {
      event.preventDefault();
      setQuery('');
      setSelectedIndex(0);
    }
  }

  async function handleFavorite(profile: Profile): Promise<void> {
    setActionError(null);
    try {
      await toggleFavorite(profile.id);
    } catch (favoriteError: unknown) {
      setActionError(
        favoriteError instanceof Error
          ? favoriteError.message
          : t('Could not update the favorite.'),
      );
    }
  }

  async function selectProfileList(id: string): Promise<void> {
    setActionError(null);
    try {
      await setActiveProfileList(id);
      setQuery('');
      setSelectedIndex(0);
    } catch (listError: unknown) {
      setActionError(
        listError instanceof Error ? listError.message : t('Could not select the profile list.'),
      );
    }
  }

  async function openImport(): Promise<void> {
    setActionError(null);
    try {
      const url = browser.runtime.getURL('/options.html#import');
      await browser.tabs.create({ url });
      window.close();
    } catch (optionsError: unknown) {
      setActionError(
        optionsError instanceof Error ? optionsError.message : t('Could not open settings.'),
      );
    }
  }

  async function openDiscovery(): Promise<void> {
    setActionError(null);
    try {
      const suffix = portalTabUrl === null ? '' : `?portal=${encodeURIComponent(portalTabUrl)}`;
      const url = browser.runtime.getURL(`/options.html#discover${suffix}`);
      await browser.tabs.create({ url });
      window.close();
    } catch (discoveryError: unknown) {
      setActionError(
        discoveryError instanceof Error ? discoveryError.message : t('Could not open settings.'),
      );
    }
  }

  async function openOptions(): Promise<void> {
    setActionError(null);
    try {
      await browser.runtime.openOptionsPage();
    } catch (optionsError: unknown) {
      setActionError(
        optionsError instanceof Error ? optionsError.message : t('Could not open settings.'),
      );
    }
  }

  if (loading) return <PopupLoading />;
  if (error || !state) {
    return (
      <main className="popup-shell popup-shell--centered">
        <StatusCard
          tone="error"
          title={t('Profiles unavailable')}
          description={error ?? t('AWS Role Hop could not load its local data.')}
          action={
            <button className="secondary-button" type="button" onClick={() => void openOptions()}>
              {t('Open settings')}
            </button>
          }
        />
      </main>
    );
  }

  return (
    <main className="popup-shell">
      <h1 className="visually-hidden">{t('AWS Role Hop profiles')}</h1>
      <header className="popup-header">
        <Brand compact size={34} />
        <button
          className="icon-button"
          type="button"
          onClick={() => void openOptions()}
          aria-label={t('Open settings')}
        >
          <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>

      <p className="popup-guidance">
        {ssoContext
          ? t('Pick an account to open it, or scan the portal again to refresh this list.')
          : t('Open this from an AWS Console tab, then pick a profile to switch roles there.')}
      </p>

      <label className="popup-list-picker">
        <Layers3 size={15} strokeWidth={1.8} aria-hidden="true" />
        <span className="visually-hidden">{t('Profile list')}</span>
        <select
          value={state.activeProfileListId}
          onChange={(event) => void selectProfileList(event.target.value)}
          aria-label={t('Profile list')}
        >
          {state.profileLists.map((list) => {
            const builtIn = builtInListName(list);
            const name = builtIn === null ? list.name : t(builtIn);
            return (
              <option key={list.id} value={list.id}>
                {name}
                {list.id === state.defaultProfileListId && builtIn === null
                  ? ` — ${t('Default')}`
                  : ''}
              </option>
            );
          })}
        </select>
      </label>

      {listProfiles.length > 0 && (
        <div className="popup-search">
          <Search size={17} strokeWidth={1.8} aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder={t('Search profiles, accounts, or roles')}
            aria-label={t('Search profiles')}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={profiles.length > 0}
            {...(profiles.length > 0
              ? {
                  'aria-controls': 'profile-list',
                  'aria-activedescendant': `profile-option-${profiles[activeIndex]!.id}`,
                }
              : {})}
            aria-describedby="profile-list-status"
          />
          {query && (
            <button
              type="button"
              className="popup-search__clear"
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
              }}
              aria-label={t('Clear search')}
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <p className="visually-hidden" id="profile-list-status" role="status">
        {query
          ? t('{matches} of {total} profiles match "{query}".', {
              matches: profiles.length,
              total: listProfiles.length,
              query,
            })
          : t('{count} profiles available.', { count: listProfiles.length })}
      </p>

      {ssoContext &&
        portalTabUrl !== null &&
        (scanning ? (
          <PortalScan
            portalUrl={portalTabUrl}
            listId={state.activeProfileListId}
            onAdded={(added, skipped) => {
              setScanning(false);
              setNotice(t('{added} added, {skipped} already existed.', { added, skipped }));
            }}
            onClose={() => setScanning(false)}
          />
        ) : (
          <div className="popup-mode-hint">
            <span>{t('You are on an AWS access portal.')}</span>
            <button type="button" onClick={() => setScanning(true)}>
              {t('Scan this portal')}
            </button>
          </div>
        ))}

      {notice !== null && (
        <div className="popup-notice" role="status">
          {notice}
        </div>
      )}

      {listProfiles.length > 0 && (
        <div className="popup-handoff-note">
          <ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" />
          <span>
            {ssoContext
              ? t(
                  'SSO profiles open through your AWS access portal. AWS still verifies your session and access.',
                )
              : t(
                  "Open AWS Role Hop from an authenticated AWS Console tab. AWS Role Hop submits AWS's native switch request directly; AWS still verifies your session and access.",
                )}
          </span>
        </div>
      )}

      {actionError && (
        <div className="popup-alert" role="alert">
          {actionError}
        </div>
      )}

      {listProfiles.length === 0 ? (
        ssoContext ? (
          <StatusCard
            title={t('Bring in your SSO accounts')}
            description={t(
              'AWS Role Hop can ask your AWS access portal which accounts and roles you may use, then keep them here.',
            )}
            action={
              <div className="popup-empty-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    if (portalTabUrl === null) void openDiscovery();
                    else setScanning(true);
                  }}
                >
                  <Radar size={16} aria-hidden="true" />
                  {portalTabUrl === null ? t('Find accounts and roles') : t('Scan this portal')}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void openOptions()}
                >
                  <Plus size={16} aria-hidden="true" />
                  {t('Add profile')}
                </button>
              </div>
            }
          />
        ) : (
          <StatusCard
            title={t('Add your first profile')}
            description={t(
              'Create an IAM role or Identity Center shortcut. Everything stays in this browser.',
            )}
            action={
              <div className="popup-empty-actions">
                <button className="primary-button" type="button" onClick={() => void openOptions()}>
                  <Plus size={16} aria-hidden="true" />
                  {t('Add profile')}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void openImport()}
                >
                  <FileInput size={16} aria-hidden="true" />
                  {t('Import profiles')}
                </button>
              </div>
            }
          />
        )
      ) : profiles.length === 0 ? (
        <StatusCard
          title={t('No matching profiles')}
          description={t('Try a profile name, account ID, role, environment, or tag.')}
          action={
            <button className="secondary-button" type="button" onClick={() => setQuery('')}>
              {t('Clear search')}
            </button>
          }
        />
      ) : (
        <ul
          className="profile-list"
          id="profile-list"
          role="listbox"
          aria-label={t('AWS profiles')}
        >
          {profiles.map((profile, index) => {
            const busy = busyProfileId === profile.id;
            return (
              <li
                key={profile.id}
                role="none"
                className="profile-row profile-tone"
                style={getProfileToneStyle(profile)}
                data-selected={index === activeIndex || undefined}
              >
                <button
                  id={`profile-option-${profile.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-label={t('Open {name} in AWS', { name: profile.name })}
                  type="button"
                  className="profile-row__main"
                  onClick={() => requestSwitch(profile)}
                  disabled={busyProfileId !== null}
                >
                  <ProfileAvatar profile={profile} />
                  <span className="profile-row__content">
                    <span className="profile-row__title-line">
                      <strong>{profile.name}</strong>
                      <ProfileTypeBadge type={profile.type} />
                    </span>
                    <span className="profile-row__role">{profile.roleName}</span>
                    <span className="profile-row__details">
                      <span>
                        {formatAccountId(profile.accountId, state.settings.hideAccountIds)}
                      </span>
                      <EnvironmentBadge profile={profile} />
                    </span>
                  </span>
                  <span className="profile-row__action" aria-hidden="true">
                    {busy ? (
                      <span className="spinner" />
                    ) : (
                      <ArrowRight size={17} strokeWidth={1.8} />
                    )}
                  </span>
                </button>
                <button
                  className="profile-row__favorite"
                  type="button"
                  onClick={() => void handleFavorite(profile)}
                  aria-label={
                    profile.favorite
                      ? t('Remove {name} from favorites', { name: profile.name })
                      : t('Favorite {name}', { name: profile.name })
                  }
                  aria-pressed={profile.favorite}
                >
                  <Star
                    size={15}
                    fill={profile.favorite ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="popup-footer">
        <span>
          {listProfiles.length === 1
            ? t('1 profile')
            : t('{count} profiles', { count: listProfiles.length })}
        </span>
        <span className="popup-footer__privacy">{t('Stored locally')}</span>
      </footer>

      {pendingProduction && (
        <ProductionDialog
          profile={pendingProduction}
          busy={busyProfileId === pendingProduction.id}
          onCancel={() => setPendingProduction(null)}
          onConfirm={() => void switchToProfile(pendingProduction)}
        />
      )}
    </main>
  );
}

interface ProductionDialogProps {
  profile: Profile;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ProductionDialog({ profile, busy, onCancel, onConfirm }: ProductionDialogProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog profile-tone"
      style={getProfileToneStyle(profile)}
      aria-labelledby="confirm-production-title"
      aria-describedby="confirm-production-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="confirm-dialog__icon">
        <ShieldAlert size={22} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <div>
        <h2 id="confirm-production-title">{t('Open production profile?')}</h2>
        <p id="confirm-production-description">
          {t('You are about to open {name} with the {role} role.', {
            name: profile.name,
            role: profile.roleName,
          })}
        </p>
      </div>
      <div className="confirm-dialog__actions">
        <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>
          {t('Cancel')}
        </button>
        <button
          className="danger-button"
          type="button"
          onClick={onConfirm}
          disabled={busy}
          autoFocus
        >
          {busy && <span className="spinner" aria-hidden="true" />}
          {t('Continue to AWS')}
        </button>
      </div>
    </dialog>
  );
}

function PopupLoading() {
  const { t } = useI18n();
  return (
    <main className="popup-shell" aria-label={t('Loading profiles')}>
      <header className="popup-header">
        <Brand compact size={34} />
        <span className="skeleton popup-loading__icon" />
      </header>
      <div className="skeleton popup-loading__search" />
      <div className="popup-loading__list">
        {[0, 1, 2].map((item) => (
          <div className="skeleton popup-loading__row" key={item} />
        ))}
      </div>
    </main>
  );
}
