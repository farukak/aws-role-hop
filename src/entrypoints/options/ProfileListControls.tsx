import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FolderPlus, Pencil, Star, Trash2 } from 'lucide-react';
import { builtInListName, type AppState, type ProfileList } from '../../domain/profile';
import { useI18n } from '../../i18n';
import {
  createProfileList,
  deleteProfileList,
  renameProfileList,
  setActiveProfileList,
  setDefaultProfileList,
} from '../../storage/app-state';
import type { Notify } from './App';

interface ProfileListControlsProps {
  state: AppState;
  notify: Notify;
  onListChange?: () => void;
}

type ListAction =
  | { mode: 'create' }
  | { mode: 'rename'; list: ProfileList }
  | { mode: 'delete'; list: ProfileList };

export function ProfileListControls({ state, notify, onListChange }: ProfileListControlsProps) {
  const { t } = useI18n();
  const [action, setAction] = useState<ListAction | null>(null);
  const activeList =
    state.profileLists.find(({ id }) => id === state.activeProfileListId) ?? state.profileLists[0]!;

  async function selectList(id: string): Promise<void> {
    try {
      await setActiveProfileList(id);
      onListChange?.();
    } catch (error: unknown) {
      notify(
        error instanceof Error ? error.message : t('Could not select the profile list.'),
        'error',
      );
    }
  }

  async function makeDefault(): Promise<void> {
    try {
      await setDefaultProfileList(activeList.id);
      notify(t('{name} is now the default list.', { name: activeList.name }));
    } catch (error: unknown) {
      notify(
        error instanceof Error ? error.message : t('Could not update the default list.'),
        'error',
      );
    }
  }

  return (
    <>
      <section className="profile-list-controls" aria-labelledby="profile-lists-title">
        <div className="profile-list-controls__copy">
          <div>
            <h2 id="profile-lists-title">{t('Profile lists')}</h2>
            {activeList.id === state.defaultProfileListId && (
              <span className="default-list-badge">
                <Star size={12} fill="currentColor" aria-hidden="true" />
                {t('Default list')}
              </span>
            )}
          </div>
          <p>
            {t(
              'The active list appears in the popup. The default list is preselected for imports.',
            )}
          </p>
        </div>
        <div className="profile-list-controls__workspace">
          <label className="profile-list-select">
            <span>{t('Active list')}</span>
            <select
              className="select-input"
              value={activeList.id}
              onChange={(event) => void selectList(event.target.value)}
              aria-label={t('Active profile list')}
            >
              {state.profileLists.map((list) => {
                const builtInDefault = builtInListName(list);
                const name = builtInDefault === null ? list.name : t(builtInDefault);
                return (
                  <option key={list.id} value={list.id}>
                    {name}
                    {list.id === state.defaultProfileListId && !builtInDefault
                      ? ` — ${t('Default')}`
                      : ''}
                  </option>
                );
              })}
            </select>
          </label>
          <div className="profile-list-actions">
            <button
              className="secondary-button profile-list-action"
              type="button"
              onClick={() => setAction({ mode: 'create' })}
            >
              <FolderPlus size={16} aria-hidden="true" />
              {t('New list')}
            </button>
            <button
              className="secondary-button profile-list-action"
              type="button"
              onClick={() => setAction({ mode: 'rename', list: activeList })}
            >
              <Pencil size={15} aria-hidden="true" />
              {t('Rename')}
            </button>
            <button
              className="secondary-button profile-list-action"
              type="button"
              onClick={() => void makeDefault()}
              disabled={activeList.id === state.defaultProfileListId}
            >
              <Star
                size={15}
                fill={activeList.id === state.defaultProfileListId ? 'currentColor' : 'none'}
                aria-hidden="true"
              />
              {activeList.id === state.defaultProfileListId ? t('Default') : t('Make default')}
            </button>
            <button
              className="secondary-button profile-list-action profile-list-actions__danger"
              type="button"
              onClick={() => setAction({ mode: 'delete', list: activeList })}
              disabled={state.profileLists.length === 1}
            >
              <Trash2 size={15} aria-hidden="true" />
              {t('Delete')}
            </button>
          </div>
        </div>
      </section>

      {action && (
        <ProfileListDialog
          action={action}
          profileCount={
            action.mode === 'create'
              ? 0
              : state.profiles.filter(({ listId }) => listId === action.list.id).length
          }
          notify={notify}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}

interface ProfileListDialogProps {
  action: ListAction;
  profileCount: number;
  notify: Notify;
  onClose: () => void;
}

function ProfileListDialog({ action, profileCount, notify, onClose }: ProfileListDialogProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(action.mode === 'rename' ? action.list.name : '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    try {
      if (action.mode === 'create') {
        await createProfileList(name);
        notify(t('{name} list created.', { name: name.trim() }));
      } else if (action.mode === 'rename') {
        await renameProfileList(action.list.id, name);
        notify(t('Profile list renamed.'));
      } else {
        await deleteProfileList(action.list.id);
        notify(t('{name} list deleted.', { name: action.list.name }), 'info');
      }
      onClose();
    } catch (error: unknown) {
      notify(
        error instanceof Error ? error.message : t('Could not update profile lists.'),
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  const title =
    action.mode === 'create'
      ? t('Create profile list')
      : action.mode === 'rename'
        ? t('Rename profile list')
        : t('Delete {name} list?', { name: action.list.name });

  return (
    <dialog
      ref={dialogRef}
      className="form-dialog form-dialog--small"
      aria-labelledby="profile-list-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-dialog__body profile-list-dialog">
          <h2 id="profile-list-dialog-title">{title}</h2>
          {action.mode === 'delete' ? (
            <p className="dialog-description">
              {profileCount === 1
                ? t('This also removes 1 local profile. Nothing changes in AWS.')
                : t('This also removes {count} local profiles. Nothing changes in AWS.', {
                    count: profileCount,
                  })}
            </p>
          ) : (
            <label className="field">
              <span className="field__label">{t('List name')}</span>
              <input
                className="text-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={48}
                autoFocus
                required
              />
            </label>
          )}
        </div>
        <footer className="form-dialog__footer">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>
            {t('Cancel')}
          </button>
          <button
            className={action.mode === 'delete' ? 'danger-button' : 'primary-button'}
            type="submit"
            disabled={busy || (action.mode !== 'delete' && !name.trim())}
          >
            {busy && <span className="spinner" aria-hidden="true" />}
            {action.mode === 'create'
              ? t('Create list')
              : action.mode === 'rename'
                ? t('Save changes')
                : t('Delete list')}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
