import { useEffect, useState } from 'react';
import { Radar, X } from 'lucide-react';
import { DISCOVERY_FAILURE_MESSAGES } from '../../discovery/failure-messages';
import {
  discoverPortalProfiles,
  hasPortalAccess,
  PortalDiscoveryError,
  requestPortalAccess,
} from '../../discovery/portal-session';
import type { ProfileDraft } from '../../domain/profile';
import { importProfiles } from '../../storage/app-state';
import { useI18n } from '../../i18n';

interface PortalScanProps {
  portalUrl: string;
  listId: string;
  onAdded: (added: number, skipped: number) => void;
  onClose: () => void;
}

/**
 * Scanning happens where the user already is. The portal tab is right there, so
 * the popup does the lookup itself instead of sending anyone to a settings page.
 */
export function PortalScan({ portalUrl, listId, onAdded, onClose }: PortalScanProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ProfileDraft[] | null>(null);
  const [accountCount, setAccountCount] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  async function scan(): Promise<void> {
    setError(null);
    setErrorDetail(null);
    setBusy(true);
    try {
      // Asking again after a grant is a no-op, so this stays on the click.
      const granted = (await hasPortalAccess(portalUrl)) || (await requestPortalAccess(portalUrl));
      if (!granted) {
        setError(t(DISCOVERY_FAILURE_MESSAGES.permissionDenied));
        return;
      }

      const result = await discoverPortalProfiles(portalUrl);
      setDrafts(result.drafts);
      setAccountCount(result.accountCount);
      setSelected(new Set(result.drafts.map((_, index) => index)));
    } catch (scanError: unknown) {
      setError(
        scanError instanceof PortalDiscoveryError
          ? t(DISCOVERY_FAILURE_MESSAGES[scanError.code])
          : scanError instanceof Error
            ? scanError.message
            : t('The access portal could not be read.'),
      );
      setErrorDetail(scanError instanceof PortalDiscoveryError ? (scanError.detail ?? null) : null);
    } finally {
      setBusy(false);
    }
  }

  async function add(): Promise<void> {
    if (!drafts) return;
    const chosen = drafts.filter((_, index) => selected.has(index));
    if (chosen.length === 0) return;

    setAdding(true);
    try {
      const summary = await importProfiles(chosen, listId);
      onAdded(summary.added, summary.skipped);
    } catch (addError: unknown) {
      setError(
        addError instanceof Error
          ? addError.message
          : t('The discovered profiles could not be added.'),
      );
    } finally {
      setAdding(false);
    }
  }

  // The click that opened this panel asked for a scan, so it starts on its own.
  // If the browser refuses the permission outside a gesture, the retry button below
  // is a fresh click and works.
  useEffect(() => {
    const start = window.setTimeout(() => void scan(), 0);
    return () => window.clearTimeout(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalUrl]);

  function toggle(index: number): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <section className="portal-scan" aria-label={t('Scan this portal')}>
      <header className="portal-scan__header">
        <strong>{t('Scan this portal')}</strong>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t('Cancel')}>
          <X size={15} aria-hidden="true" />
        </button>
      </header>

      {error && (
        <div className="popup-alert" role="alert">
          <span>{error}</span>
          {errorDetail && <code className="portal-scan__detail">{errorDetail}</code>}
        </div>
      )}

      {drafts === null ? (
        busy ? (
          <p className="portal-scan__summary">
            <span className="spinner" aria-hidden="true" /> {t('Searching the access portal…')}
          </p>
        ) : (
          <button className="primary-button" type="button" onClick={() => void scan()}>
            <Radar size={15} aria-hidden="true" />
            {t('Find accounts and roles')}
          </button>
        )
      ) : (
        <>
          <p className="portal-scan__summary">
            {drafts.length === 0
              ? t('Nothing was found in this portal.')
              : t('Found {roles} roles across {accounts} accounts.', {
                  roles: drafts.length,
                  accounts: accountCount,
                })}
          </p>

          {drafts.length > 0 && (
            <>
              <ul className="portal-scan__list">
                {drafts.map((entry, index) => (
                  <li key={`${entry.accountId}-${entry.roleName}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(index)}
                        onChange={() => toggle(index)}
                      />
                      <span>
                        <strong>{entry.name}</strong>
                        <small>{entry.roleName}</small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <button
                className="primary-button"
                type="button"
                onClick={() => void add()}
                disabled={adding || selected.size === 0}
              >
                {adding && <span className="spinner" aria-hidden="true" />}
                {t('Add selected profiles')}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
