import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { browser } from 'wxt/browser';
import {
  Download,
  ExternalLink,
  HardDrive,
  LockKeyhole,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
} from 'lucide-react';
import type { AppSettings, AppState } from '../../domain/profile';
import { useI18n } from '../../i18n';
import { resetAppState, restoreAppState, updateSettings } from '../../storage/app-state';
import type { Notify } from './App';

interface PreferencesViewProps {
  state: AppState;
  notify: Notify;
  onShowWhatsNew: () => void;
}

export function PreferencesView({ state, notify, onShowWhatsNew }: PreferencesViewProps) {
  const { t } = useI18n();
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function saveSetting(patch: Partial<AppSettings>): Promise<void> {
    try {
      await updateSettings(patch);
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : t('Could not save the preference.'), 'error');
    }
  }

  function exportBackup(): void {
    let url: string | null = null;
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `aws-role-hop-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      notify(t('Backup exported.'));
    } catch {
      notify(t('The backup could not be exported.'), 'error');
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 2_000_000) {
      notify(t('Backup files must be smaller than 2 MB.'), 'error');
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      notify(t('The selected backup file could not be read.'), 'error');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      notify(t('Backup file is not valid JSON.'), 'error');
      return;
    }

    try {
      await restoreAppState(parsed);
      notify(t('Backup restored.'));
    } catch (error: unknown) {
      notify(
        error instanceof Error ? error.message : t('The backup could not be restored.'),
        'error',
      );
    }
  }

  async function resetAllData(): Promise<void> {
    if (resetting) return;
    setResetting(true);
    try {
      await resetAppState();
      setResetOpen(false);
      notify(t('All local AWS Role Hop data was reset.'), 'info');
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : t('Could not reset local data.'), 'error');
    } finally {
      setResetting(false);
    }
  }

  const version = browser.runtime.getManifest().version;

  return (
    <section className="options-view">
      <header className="view-header">
        <div>
          <p className="view-header__eyebrow">{t('Your experience')}</p>
          <h1>{t('Preferences')}</h1>
          <p>{t('Control appearance, navigation, and local data.')}</p>
        </div>
      </header>

      <div className="preferences-stack">
        <section className="content-panel preference-section">
          <div className="preference-section__heading">
            <h2>{t('Access mode')}</h2>
            <p>{t('Choose which AWS access path AWS Role Hop is set up for.')}</p>
          </div>
          <ChoiceGroup className="choice-grid" label={t('Access mode')}>
            <ChoiceButton
              selected={state.settings.accessMode === 'iam'}
              onClick={() => void saveSetting({ accessMode: 'iam' })}
              title={t('IAM roles')}
              description={t('Switch inside the AWS Console')}
            />
            <ChoiceButton
              selected={state.settings.accessMode === 'sso'}
              onClick={() => void saveSetting({ accessMode: 'sso' })}
              title={t('IAM Identity Center')}
              description={t('Needs access to your AWS access portal')}
            />
          </ChoiceGroup>
        </section>

        <section className="content-panel preference-section">
          <div className="preference-section__heading">
            <h2>{t('Appearance')}</h2>
            <p>{t('Use your browser preference or choose a fixed theme.')}</p>
          </div>
          <ChoiceGroup className="choice-grid choice-grid--three" label={t('Theme')}>
            <ChoiceButton
              selected={state.settings.theme === 'system'}
              onClick={() => void saveSetting({ theme: 'system' })}
              icon={<span className="system-theme-icon" aria-hidden="true" />}
              title={t('System')}
              description={t('Follow the browser')}
            />
            <ChoiceButton
              selected={state.settings.theme === 'light'}
              onClick={() => void saveSetting({ theme: 'light' })}
              icon={<Sun size={18} aria-hidden="true" />}
              title={t('Light')}
              description={t('Always light')}
            />
            <ChoiceButton
              selected={state.settings.theme === 'dark'}
              onClick={() => void saveSetting({ theme: 'dark' })}
              icon={<Moon size={18} aria-hidden="true" />}
              title={t('Dark')}
              description={t('Always dark')}
            />
          </ChoiceGroup>
        </section>

        <section className="content-panel preference-section">
          <div className="preference-section__heading">
            <h2>{t('Interface language')}</h2>
            <p>{t('Use your browser language or choose English or Turkish.')}</p>
          </div>
          <ChoiceGroup className="choice-grid choice-grid--three" label={t('Language')}>
            <ChoiceButton
              selected={state.settings.language === 'system'}
              onClick={() => void saveSetting({ language: 'system' })}
              title={t('System')}
              description={t('Browser language')}
            />
            <ChoiceButton
              selected={state.settings.language === 'en'}
              onClick={() => void saveSetting({ language: 'en' })}
              title={t('English')}
              description="English"
            />
            <ChoiceButton
              selected={state.settings.language === 'tr'}
              onClick={() => void saveSetting({ language: 'tr' })}
              title={t('Turkish')}
              description="Türkçe"
            />
          </ChoiceGroup>
        </section>

        <section className="content-panel preference-section">
          <div className="preference-section__heading">
            <h2>{t('Role navigation')}</h2>
            <p>{t('Choose how AWS Role Hop opens AWS and handles sensitive environments.')}</p>
          </div>
          <div className="navigation-handoff-note">
            <ShieldCheck size={18} strokeWidth={1.8} aria-hidden="true" />
            <div>
              <strong>{t('Secure AWS handoff')}</strong>
              <span>
                {t(
                  "IAM profiles switch directly from the authenticated AWS Console tab. AWS Role Hop sends the account, role, display name, region, and profile color to AWS's native endpoint. It does not read browser cookies or credentials.",
                )}
              </span>
            </div>
          </div>
          <ChoiceGroup className="choice-grid" label={t('Open behavior')}>
            <ChoiceButton
              selected={state.settings.openBehavior === 'current'}
              onClick={() => void saveSetting({ openBehavior: 'current' })}
              title={t('Current tab')}
              description={t('Replace the active page')}
            />
            <ChoiceButton
              selected={state.settings.openBehavior === 'new'}
              onClick={() => void saveSetting({ openBehavior: 'new' })}
              title={t('New tab')}
              description={t('Keep your current page open')}
            />
          </ChoiceGroup>
          <div className="preference-toggles">
            <PreferenceCheckbox
              checked={state.settings.confirmProduction}
              onChange={(checked) => void saveSetting({ confirmProduction: checked })}
              title={t('Confirm production profiles')}
              description={t(
                'Show an AWS Role Hop warning before handing a production profile to AWS.',
              )}
            />
            <PreferenceCheckbox
              checked={state.settings.hideAccountIds}
              onChange={(checked) => void saveSetting({ hideAccountIds: checked })}
              title={t('Hide account IDs')}
              description={t('Show only the final four characters in AWS Role Hop interfaces.')}
            />
          </div>
        </section>

        <section className="content-panel preference-section">
          <div className="preference-section__heading preference-section__heading--row">
            <div>
              <h2>{t('Data and privacy')}</h2>
              <p>
                {t('{count} profiles stored in this browser.', { count: state.profiles.length })}
              </p>
            </div>
            <HardDrive size={21} strokeWidth={1.7} aria-hidden="true" />
          </div>
          <div className="privacy-facts">
            <div>
              <LockKeyhole size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>
                <strong>{t('Local storage + AWS handoff')}</strong>
                <small>
                  {t('Limited AWS Console access; no broad tabs, cookie, or history permission')}
                </small>
              </span>
            </div>
            <div>
              <span className="privacy-facts__dot" aria-hidden="true" />
              <span>
                <strong>{t('No data collection')}</strong>
                <small>{t('No analytics, telemetry, account, or remote service')}</small>
              </span>
            </div>
          </div>
          <div className="data-actions">
            <button className="secondary-button" type="button" onClick={exportBackup}>
              <Download size={16} aria-hidden="true" />
              {t('Export backup')}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => restoreInputRef.current?.click()}
            >
              <Upload size={16} aria-hidden="true" />
              {t('Restore backup')}
            </button>
            <input
              ref={restoreInputRef}
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              aria-label={t('Backup file')}
              onChange={(event) => void restoreBackup(event)}
            />
            <button
              className="ghost-button ghost-button--danger data-actions__reset"
              type="button"
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {t('Reset all data')}
            </button>
          </div>
        </section>

        <footer className="about-footer" aria-label="AWS Role Hop">
          <div className="about-footer__meta">
            <span>AWS Role Hop {version}</span>
            <span>{t('Open source · Apache-2.0')}</span>
            <span>{t('Not affiliated with Amazon Web Services')}</span>
          </div>
          <div className="about-footer__links">
            <button type="button" className="about-footer__link" onClick={onShowWhatsNew}>
              <Sparkles size={13} aria-hidden="true" />
              {t("What's new")}
            </button>
            <a
              className="about-footer__link"
              href="https://github.com/farukak"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={13} aria-hidden="true" />
              {t('Built by Faruk AK on GitHub')}
            </a>
          </div>
        </footer>
      </div>

      {resetOpen && (
        <ResetDialog
          busy={resetting}
          onCancel={() => {
            if (!resetting) setResetOpen(false);
          }}
          onConfirm={() => void resetAllData()}
        />
      )}
    </section>
  );
}

interface ChoiceButtonProps {
  selected: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  title: string;
  description: string;
}

interface ChoiceGroupProps {
  label: string;
  className: string;
  children: React.ReactNode;
}

/**
 * Delivers the keyboard behavior the `radio` role promises: the group is a
 * single tab stop and the arrow keys move between options. Without this, screen
 * readers announce a radio group whose arrow keys do nothing.
 */
function ChoiceGroup({ label, className, children }: ChoiceGroupProps) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) return;

    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    if (options.length === 0) return;

    const focused = options.findIndex((option) => option === document.activeElement);
    const checked = options.findIndex((option) => option.getAttribute('aria-checked') === 'true');
    const current = focused === -1 ? Math.max(checked, 0) : focused;
    const next = options[(current + (forward ? 1 : -1) + options.length) % options.length];
    if (!next) return;

    event.preventDefault();
    next.focus();
    next.click();
  }

  return (
    <div className={className} role="radiogroup" aria-label={label} onKeyDown={handleKeyDown}>
      {children}
    </div>
  );
}

function ChoiceButton({ selected, onClick, icon, title, description }: ChoiceButtonProps) {
  return (
    <button
      className="choice-button"
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      data-selected={selected || undefined}
      onClick={onClick}
    >
      {icon && <span className="choice-button__icon">{icon}</span>}
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="choice-button__radio" aria-hidden="true" />
    </button>
  );
}

interface PreferenceCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}

function PreferenceCheckbox({ checked, onChange, title, description }: PreferenceCheckboxProps) {
  return (
    <label className="preference-toggle">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-control" aria-hidden="true" />
    </label>
  );
}

interface ResetDialogProps {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ResetDialog({ busy, onCancel, onConfirm }: ResetDialogProps) {
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
      className="form-dialog form-dialog--small"
      aria-labelledby="reset-data-title"
      aria-describedby="reset-data-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="form-dialog__body">
        <h2 id="reset-data-title">{t('Reset all local data?')}</h2>
        <p className="dialog-description" id="reset-data-description">
          {t('Profiles and preferences will be permanently removed from this browser.')}
        </p>
      </div>
      <footer className="form-dialog__footer">
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
          {t('Reset data')}
        </button>
      </footer>
    </dialog>
  );
}
