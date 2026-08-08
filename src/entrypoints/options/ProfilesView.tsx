import { useMemo, useRef, useState, useEffect } from 'react';
import { FileInput, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import {
  EnvironmentBadge,
  formatAccountId,
  getProfileToneStyle,
  ProfileAvatar,
  ProfileTypeBadge,
} from '../../components/ProfileVisual';
import { StatusCard } from '../../components/StatusCard';
import { sortProfiles, type AppState, type Profile, type ProfileDraft } from '../../domain/profile';
import { searchProfiles } from '../../domain/search';
import { useI18n } from '../../i18n';
import { addProfile, editProfile, removeProfile, toggleFavorite } from '../../storage/app-state';
import type { Notify } from './App';
import { ProfileDialog } from './ProfileDialog';
import { ProfileListControls } from './ProfileListControls';

interface ProfilesViewProps {
  state: AppState;
  notify: Notify;
  onImport: () => void;
}

export function ProfilesView({ state, notify, onImport }: ProfilesViewProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [editingProfile, setEditingProfile] = useState<Profile | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const listProfiles = useMemo(
    () => state.profiles.filter(({ listId }) => listId === state.activeProfileListId),
    [state.activeProfileListId, state.profiles],
  );
  const profiles = useMemo(
    () => searchProfiles(sortProfiles(listProfiles), query),
    [listProfiles, query],
  );

  async function saveProfile(draft: ProfileDraft): Promise<void> {
    if (editingProfile === 'new') {
      await addProfile(draft, state.activeProfileListId);
      notify(t('Profile added.'));
    } else if (editingProfile) {
      await editProfile(editingProfile.id, draft);
      notify(t('Profile updated.'));
    }
    setEditingProfile(null);
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeProfile(deleteTarget.id);
      notify(t('{name} deleted.', { name: deleteTarget.name }), 'info');
      setDeleteTarget(null);
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : t('Could not delete the profile.'), 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleFavorite(profile: Profile): Promise<void> {
    try {
      await toggleFavorite(profile.id);
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : t('Could not update the favorite.'), 'error');
    }
  }

  return (
    <section className="options-view">
      <header className="view-header">
        <div>
          <p className="view-header__eyebrow">{t('Workspace')}</p>
          <h1>{t('Profiles')}</h1>
          <p>{t('Manage the profiles and lists that appear in the AWS Role Hop popup.')}</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setEditingProfile('new')}>
          <Plus size={17} aria-hidden="true" />
          {t('Add profile')}
        </button>
      </header>

      <ProfileListControls state={state} notify={notify} onListChange={() => setQuery('')} />

      {listProfiles.length > 0 && (
        <div className="profiles-toolbar">
          <label className="options-search">
            <Search size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="visually-hidden">{t('Search profiles')}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('Search by name, account, role, or tag')}
              aria-describedby="profiles-count"
            />
          </label>
          <span className="profiles-toolbar__count" id="profiles-count" role="status">
            {query
              ? t('{matches} of {total} match', {
                  matches: profiles.length,
                  total: listProfiles.length,
                })
              : listProfiles.length === 1
                ? t('1 profile')
                : t('{count} profiles', { count: listProfiles.length })}
          </span>
        </div>
      )}

      {listProfiles.length === 0 ? (
        <div className="content-panel content-panel--empty">
          <StatusCard
            title={t('This list has no profiles yet')}
            description={t('Add one profile manually or import several profiles into this list.')}
            action={
              <div className="empty-state-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setEditingProfile('new')}
                >
                  <Plus size={16} aria-hidden="true" />
                  {t('Add one profile')}
                </button>
                <button className="secondary-button" type="button" onClick={onImport}>
                  <FileInput size={16} aria-hidden="true" />
                  {t('Import profiles')}
                </button>
              </div>
            }
          />
        </div>
      ) : profiles.length === 0 ? (
        <div className="content-panel content-panel--empty">
          <StatusCard
            title={t('No matching profiles')}
            description={t('Try a different name, account ID, role, environment, or tag.')}
            action={
              <button className="secondary-button" type="button" onClick={() => setQuery('')}>
                {t('Clear search')}
              </button>
            }
          />
        </div>
      ) : (
        <div className="profile-grid">
          {profiles.map((profile) => (
            <article
              key={profile.id}
              className="profile-card profile-tone"
              style={getProfileToneStyle(profile)}
            >
              <div className="profile-card__topline" aria-hidden="true" />
              <header className="profile-card__header">
                <ProfileAvatar profile={profile} />
                <div className="profile-card__heading">
                  <div>
                    <h2>{profile.name}</h2>
                    <ProfileTypeBadge type={profile.type} />
                  </div>
                  <span>{profile.type === 'sso' ? t('Identity Center') : t('IAM role')}</span>
                </div>
                <button
                  className="icon-button profile-card__favorite"
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
                    size={16}
                    fill={profile.favorite ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                </button>
              </header>

              <dl className="profile-card__details">
                <div>
                  <dt>{t('Account')}</dt>
                  <dd>{formatAccountId(profile.accountId, state.settings.hideAccountIds)}</dd>
                </div>
                <div>
                  <dt>{profile.type === 'sso' ? t('Permission set') : t('Role')}</dt>
                  <dd>{profile.roleName}</dd>
                </div>
                {profile.type === 'sso' && (
                  <div>
                    <dt>{t('Portal')}</dt>
                    <dd>{new URL(profile.portalUrl).hostname}</dd>
                  </div>
                )}
              </dl>

              <div className="profile-card__metadata">
                <EnvironmentBadge profile={profile} />
                {profile.tags.map((tag) => (
                  <span className="profile-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>

              <footer className="profile-card__actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setEditingProfile(profile)}
                >
                  <Pencil size={15} aria-hidden="true" />
                  {t('Edit')}
                </button>
                <button
                  className="ghost-button ghost-button--danger"
                  type="button"
                  onClick={() => setDeleteTarget(profile)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  {t('Delete')}
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}

      {editingProfile && (
        <ProfileDialog
          key={editingProfile === 'new' ? 'new' : editingProfile.id}
          profile={editingProfile === 'new' ? null : editingProfile}
          onClose={() => setEditingProfile(null)}
          onSave={saveProfile}
        />
      )}
      {deleteTarget && (
        <DeleteDialog
          profile={deleteTarget}
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </section>
  );
}

interface DeleteDialogProps {
  profile: Profile;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteDialog({ profile, busy, onCancel, onConfirm }: DeleteDialogProps) {
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
      aria-labelledby="delete-profile-title"
      aria-describedby="delete-profile-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="form-dialog__body">
        <h2 id="delete-profile-title">{t('Delete {name}?', { name: profile.name })}</h2>
        <p className="dialog-description" id="delete-profile-description">
          {t('This removes the local profile only. It does not change anything in AWS.')}
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
          {t('Delete profile')}
        </button>
      </footer>
    </dialog>
  );
}
