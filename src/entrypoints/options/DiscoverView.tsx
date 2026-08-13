import { useMemo, useState } from 'react';
import { Radar, ShieldCheck } from 'lucide-react';
import {
  discoverPortalProfiles,
  PortalDiscoveryError,
  requestPortalAccess,
  type PortalDiscoveryFailure,
} from '../../discovery/portal-session';
import type { AppState, ProfileDraft } from '../../domain/profile';
import { importProfiles } from '../../storage/app-state';
import { useI18n, type Message } from '../../i18n';
import type { Notify } from './App';

const DISCOVERY_FAILURE_MESSAGES: Record<PortalDiscoveryFailure, Message> = {
  permissionDenied: 'Portal access is needed before AWS Role Hop can read your accounts.',
  portalTabUnavailable: 'The access portal tab could not be opened.',
  unauthorized: 'Sign in to the access portal in a tab, then try again.',
  failed: 'The access portal could not be read.',
};

interface DiscoverViewProps {
  state: AppState;
  notify: Notify;
  onImported: (listId: string) => void;
}

/** Identity Center profiles come from the portal itself, so nothing has to be typed by hand. */
export function DiscoverView({ state, notify, onImported }: DiscoverViewProps) {
  const { t } = useI18n();

  const knownPortal = useMemo(() => {
    const sso = state.profiles.find((profile) => profile.type === 'sso');
    return sso?.type === 'sso' ? sso.portalUrl : '';
  }, [state.profiles]);

  const [portalUrl, setPortalUrl] = useState(knownPortal);
  const [destinationListId, setDestinationListId] = useState(state.defaultProfileListId);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ProfileDraft[] | null>(null);
  const [accountCount, setAccountCount] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function reset(): void {
    setDrafts(null);
    setSelected(new Set());
    setAccountCount(0);
  }

  async function discover(): Promise<void> {
    setError(null);
    reset();
    setBusy(true);
    try {
      // The permission prompt has to ride on this click, so it comes first.
      const granted = await requestPortalAccess(portalUrl);
      if (!granted) {
        setError(t(DISCOVERY_FAILURE_MESSAGES.permissionDenied));
        return;
      }

      const result = await discoverPortalProfiles(portalUrl);
      setDrafts(result.drafts);
      setAccountCount(result.accountCount);
      setSelected(new Set(result.drafts.map((_, index) => index)));
    } catch (discoveryError: unknown) {
      setError(
        discoveryError instanceof PortalDiscoveryError
          ? t(DISCOVERY_FAILURE_MESSAGES[discoveryError.code])
          : discoveryError instanceof Error
            ? discoveryError.message
            : t('The access portal could not be read.'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function addSelected(): Promise<void> {
    if (!drafts) return;
    const chosen = drafts.filter((_, index) => selected.has(index));
    if (chosen.length === 0) return;

    setAdding(true);
    try {
      const summary = await importProfiles(chosen, destinationListId);
      notify(
        t('{added} added, {skipped} already existed.', {
          added: summary.added,
          skipped: summary.skipped,
        }),
      );
      reset();
      onImported(summary.listId);
    } catch (importError: unknown) {
      setError(
        importError instanceof Error
          ? importError.message
          : t('The discovered profiles could not be added.'),
      );
    } finally {
      setAdding(false);
    }
  }

  function toggle(index: number): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const canDiscover = portalUrl.trim() !== '' && !busy;

  return (
    <section className="options-view">
      <header className="view-header">
        <div>
          <p className="view-header__eyebrow">{t('Identity Center')}</p>
          <h1>{t('Find accounts from your AWS access portal')}</h1>
          <p>
            {t(
              'AWS Role Hop asks the portal which accounts and permission sets you can use, then turns them into profiles.',
            )}
          </p>
        </div>
      </header>

      <div className="content-panel discover-panel">
        <div className="review-notice">
          <ShieldCheck size={18} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>{t('Portal access stays optional')}</strong>
            <span>
              {t(
                'Your browser asks before AWS Role Hop may reach the portal. The lookup runs in a portal tab with your existing session, and no token is ever read or stored.',
              )}
            </span>
          </div>
        </div>

        <label className="field">
          <span className="field__label">{t('Access portal URL')}</span>
          <input
            type="url"
            value={portalUrl}
            onChange={(event) => {
              setPortalUrl(event.target.value);
              setError(null);
            }}
            placeholder="https://my-portal.awsapps.com/start"
            spellCheck={false}
            autoComplete="off"
          />
        </label>

        {error && (
          <div className="review-notice review-notice--warning" role="alert">
            {error}
          </div>
        )}

        <div className="discover-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => void discover()}
            disabled={!canDiscover}
          >
            {busy ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <Radar size={16} aria-hidden="true" />
            )}
            {busy ? t('Searching the access portal…') : t('Find accounts and roles')}
          </button>
        </div>
      </div>

      {drafts && (
        <div className="content-panel discover-results">
          <div className="discover-results__summary">
            <p>
              {drafts.length === 0
                ? t('Nothing was found in this portal.')
                : t('Found {roles} roles across {accounts} accounts.', {
                    roles: drafts.length,
                    accounts: accountCount,
                  })}
            </p>
            {drafts.length > 0 && (
              <div className="discover-results__bulk">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setSelected(new Set(drafts.map((_, index) => index)))}
                >
                  {t('Select all')}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setSelected(new Set())}
                >
                  {t('Clear selection')}
                </button>
              </div>
            )}
          </div>

          {drafts.length > 0 && (
            <>
              <ul className="discover-list">
                {drafts.map((entry, index) => (
                  <li key={`${entry.accountId}-${entry.roleName}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(index)}
                        onChange={() => toggle(index)}
                      />
                      <span className="discover-list__copy">
                        <strong>{entry.name}</strong>
                        <small>
                          {entry.accountId} · {entry.roleName}
                        </small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <label className="field">
                <span className="field__label">{t('Add discovered profiles to')}</span>
                <select
                  value={destinationListId}
                  onChange={(event) => setDestinationListId(event.target.value)}
                >
                  {state.profileLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="discover-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void addSelected()}
                  disabled={adding || selected.size === 0}
                >
                  {adding && <span className="spinner" aria-hidden="true" />}
                  {t('Add selected profiles')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
