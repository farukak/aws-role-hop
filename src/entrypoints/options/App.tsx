import { useEffect, useState } from 'react';
import { FileInput, Settings2, ShieldCheck, UsersRound, X } from 'lucide-react';
import { Brand } from '../../components/Brand';
import { StatusCard } from '../../components/StatusCard';
import { useAppState, useTheme } from '../../hooks/useAppState';
import { setActiveProfileList } from '../../storage/app-state';
import { useI18n } from '../../i18n';
import { ImportView } from './ImportView';
import { PreferencesView } from './PreferencesView';
import { ProfilesView } from './ProfilesView';

type OptionsView = 'profiles' | 'import' | 'preferences';
export type NoticeTone = 'success' | 'error' | 'info';
export type Notify = (message: string, tone?: NoticeTone) => void;

interface Notice {
  id: number;
  message: string;
  tone: NoticeTone;
}

const NAV_ITEMS = [
  { id: 'profiles', label: 'Profiles', icon: UsersRound },
  { id: 'import', label: 'Import', icon: FileInput },
  { id: 'preferences', label: 'Preferences', icon: Settings2 },
] as const;

export function OptionsApp() {
  const { t } = useI18n();
  const { state, loading, error } = useAppState();
  const [activeView, setActiveView] = useState<OptionsView>('profiles');
  const [notice, setNotice] = useState<Notice | null>(null);

  useTheme(state?.settings.theme);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const notify: Notify = (message, tone = 'success') => {
    setNotice({ id: Date.now(), message, tone });
  };

  async function showProfileList(listId: string): Promise<void> {
    try {
      await setActiveProfileList(listId);
      setActiveView('profiles');
    } catch (error: unknown) {
      notify(
        error instanceof Error ? error.message : t('Could not open the selected profile list.'),
        'error',
      );
    }
  }

  if (loading) return <OptionsLoading />;
  if (error || !state) {
    return (
      <main className="options-fatal">
        <StatusCard
          tone="error"
          title={t('Unable to load AWS Role Hop')}
          description={error ?? t('The local profile store could not be opened.')}
          action={
            <button
              className="secondary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              {t('Reload')}
            </button>
          }
        />
      </main>
    );
  }

  return (
    <div className="options-layout">
      <aside className="options-sidebar">
        <div className="options-sidebar__brand">
          <Brand size={40} />
        </div>
        <nav className="options-nav" aria-label={t('Settings')}>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className="options-nav__item"
              data-active={activeView === id || undefined}
              onClick={() => setActiveView(id)}
              aria-current={activeView === id ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>
        <div className="options-sidebar__privacy">
          <ShieldCheck size={17} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <strong>{t('Local by design')}</strong>
            <span>{t('No telemetry or cloud service')}</span>
          </div>
        </div>
      </aside>

      <main className="options-main">
        {activeView === 'profiles' && (
          <ProfilesView state={state} notify={notify} onImport={() => setActiveView('import')} />
        )}
        {activeView === 'import' && (
          <ImportView
            state={state}
            notify={notify}
            onImported={showProfileList}
            onManageList={showProfileList}
          />
        )}
        {activeView === 'preferences' && <PreferencesView state={state} notify={notify} />}
      </main>

      {notice && (
        <div
          className="toast"
          data-tone={notice.tone}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t('Dismiss notification')}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function OptionsLoading() {
  const { t } = useI18n();
  return (
    <div className="options-layout" aria-label={t('Loading settings')}>
      <aside className="options-sidebar">
        <div className="options-sidebar__brand">
          <Brand size={40} />
        </div>
        <div className="options-loading__nav">
          {[0, 1, 2].map((item) => (
            <span className="skeleton" key={item} />
          ))}
        </div>
      </aside>
      <main className="options-main">
        <div className="skeleton options-loading__title" />
        <div className="skeleton options-loading__panel" />
      </main>
    </div>
  );
}
