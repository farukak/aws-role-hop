import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { AlertTriangle, CheckCircle2, FileText, ShieldCheck, Upload, X } from 'lucide-react';
import {
  EnvironmentBadge,
  formatAccountId,
  getProfileToneStyle,
  ProfileAvatar,
  ProfileTypeBadge,
} from '../../components/ProfileVisual';
import {
  DEFAULT_PROFILE_LIST_ID,
  PARTITION_OPTIONS,
  PROFILE_LIST_NAME_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
  type AppState,
  type Partition,
  type ProfileDraft,
} from '../../domain/profile';
import { parseAwsConfig, type AwsConfigImportResult } from '../../import/aws-config';
import { findImportCollisions } from '../../import/collisions';
import { detectImportFormat, type IgnoredSection, type ImportIssue } from '../../import/format';
import {
  organizationAccountsToDrafts,
  parseOrganizationsAccounts,
  type OrganizationAccount,
} from '../../import/organizations';
import { importProfiles, importProfilesToNewList } from '../../storage/app-state';
import { useI18n } from '../../i18n';
import type { Notify } from './App';
import { ImportCodeEditor } from './ImportCodeEditor';

interface ImportViewProps {
  state: AppState;
  notify: Notify;
  onImported: (listId: string) => Promise<void>;
  onManageList: (listId: string) => Promise<void>;
}

const EXAMPLE_CONFIG = `[profile development]
role_arn = arn:aws:iam::123456789012:role/Developer
region = eu-west-1

[profile production-readonly]
aws_account_id = 210987654321
role_name = ReadOnlyRole

[sso-session company]
sso_start_url = https://example.awsapps.com/start
sso_region = eu-west-1

[profile platform-sso]
sso_session = company
sso_account_id = 123456789012
sso_role_name = PlatformAccess
region = eu-west-1

Or paste the output of:
aws organizations list-accounts`;

const UNKNOWN_FORMAT_MESSAGE =
  'This does not look like an AWS CLI config or aws organizations list-accounts output. Expected INI sections such as [profile name], or JSON containing an "Accounts" array.';
const IMPORT_MAX_BYTES = 1_000_000;
const NAMES_SHOWN = 5;

type Preview =
  | { format: 'aws-config'; result: AwsConfigImportResult }
  | {
      format: 'organizations';
      accounts: OrganizationAccount[];
      issues: ImportIssue[];
      skippedInactive: number;
    }
  | { format: 'unknown' };

export function ImportView({ state, notify, onImported, onManageList }: ImportViewProps) {
  function createPreview(input: string): Preview {
    const format = detectImportFormat(input);
    if (format === 'organizations') return { format, ...parseOrganizationsAccounts(input) };
    if (format === 'aws-config') return { format, result: parseAwsConfig(input) };
    return { format: 'unknown' };
  }
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [config, setConfig] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [roleName, setRoleName] = useState('');
  const [partition, setPartition] = useState<Partition>('aws');
  const [targetSelection, setTargetSelection] = useState({
    defaultProfileListId: state.defaultProfileListId,
    targetListId: state.defaultProfileListId,
  });
  const [importing, setImporting] = useState(false);
  const [destinationMode, setDestinationMode] = useState<'existing' | 'new'>('existing');
  const [newListName, setNewListName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const targetListId =
    targetSelection.defaultProfileListId === state.defaultProfileListId
      ? targetSelection.targetListId
      : state.defaultProfileListId;
  const selectedTargetListId = state.profileLists.some(({ id }) => id === targetListId)
    ? targetListId
    : state.defaultProfileListId;

  const converted = useMemo(() => {
    if (preview?.format !== 'organizations' || !roleName.trim()) return null;
    return organizationAccountsToDrafts(preview.accounts, roleName.trim(), partition);
  }, [partition, preview, roleName]);

  const profiles: ProfileDraft[] = useMemo(
    () =>
      preview?.format === 'aws-config' ? preview.result.profiles : (converted?.profiles ?? []),
    [converted, preview],
  );

  const issues: ImportIssue[] =
    preview?.format === 'aws-config'
      ? preview.result.issues
      : preview?.format === 'organizations'
        ? [...preview.issues, ...(converted?.issues ?? [])]
        : [];

  const ignored: IgnoredSection[] = preview?.format === 'aws-config' ? preview.result.ignored : [];

  // A brand-new list starts empty, so only the pasted batch can collide there.
  const destinationProfiles = useMemo(
    () =>
      destinationMode === 'new'
        ? []
        : state.profiles.filter((profile) => profile.listId === selectedTargetListId),
    [destinationMode, selectedTargetListId, state.profiles],
  );
  const collisions = useMemo(
    () => findImportCollisions(profiles, destinationProfiles),
    [destinationProfiles, profiles],
  );
  const shownDuplicateNames = collisions.duplicateNames.slice(0, NAMES_SHOWN).join(', ');
  const duplicateNameList =
    collisions.duplicateNames.length > NAMES_SHOWN
      ? `${shownDuplicateNames}…`
      : shownDuplicateNames;

  const configSize = useMemo(() => new Blob([config]).size, [config]);
  const configTooLarge = configSize > IMPORT_MAX_BYTES;

  useEffect(() => {
    if (!config.trim() || configTooLarge) return;

    const timeout = window.setTimeout(() => {
      setPreview(createPreview(config));
      setAnalyzing(false);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [config, configTooLarge]);

  function updateConfig(next: string): void {
    const nextTooLarge = new Blob([next]).size > IMPORT_MAX_BYTES;
    setConfig(next);
    setPreview(null);
    setAnalyzing(Boolean(next.trim()) && !nextTooLarge);
  }

  async function readConfigFile(file: File): Promise<void> {
    if (file.size > IMPORT_MAX_BYTES) {
      setPreview(null);
      notify(t('Config files must be smaller than 1 MB.'), 'error');
      return;
    }
    try {
      const text = await file.text();
      updateConfig(text);
    } catch {
      setPreview(null);
      notify(t('The selected file could not be read.'), 'error');
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await readConfigFile(file);
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const next = `${config.slice(0, textarea.selectionStart)}  ${config.slice(textarea.selectionEnd)}`;
    const cursor = textarea.selectionStart + 2;
    updateConfig(next);
    requestAnimationFrame(() => textarea.setSelectionRange(cursor, cursor));
  }

  function handleDrop(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void readConfigFile(file);
  }

  async function confirmImport(): Promise<void> {
    if (!profiles.length) {
      notify(t('Add at least one valid profile before importing.'), 'error');
      return;
    }
    if (destinationMode === 'new' && !newListName.trim()) {
      notify(t('Enter a name for the new profile list.'), 'error');
      return;
    }

    setImporting(true);
    try {
      const summary =
        destinationMode === 'new'
          ? await importProfilesToNewList(profiles, newListName)
          : await importProfiles(profiles, selectedTargetListId);
      const importedMessage = t('{added} profiles imported.', { added: summary.added });
      const skippedMessage = summary.skipped
        ? ` ${t('{count} duplicate profiles skipped.', { count: summary.skipped })}`
        : '';
      notify(`${importedMessage}${skippedMessage}`, summary.added ? 'success' : 'info');
      if (summary.added > 0) await onImported(summary.listId);
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : t('Could not import profiles.'), 'error');
    } finally {
      setImporting(false);
    }
  }

  function clear(): void {
    updateConfig('');
    setRoleName('');
  }

  return (
    <section className="options-view">
      <header className="view-header">
        <div>
          <p className="view-header__eyebrow">{t('Add many profiles')}</p>
          <h1>{t('Import profiles')}</h1>
          <p>{t('Paste profile metadata, choose a destination, and import when it is ready.')}</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={17} aria-hidden="true" />
          {t('Choose file')}
        </button>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".config,.ini,.txt,.json,text/plain,application/json"
          onChange={(event) => void handleFile(event)}
        />
      </header>

      <div className="import-layout">
        <section
          className="content-panel import-editor"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="panel-heading">
            <div>
              <h2>{t('Paste or drop a file')}</h2>
              <p>
                {t('Supports AWS CLI profiles, Identity Center sessions, and Organizations JSON.')}
              </p>
            </div>
            {config && (
              <button
                className="icon-button"
                type="button"
                onClick={clear}
                aria-label={t('Clear configuration')}
              >
                <X size={17} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="import-editor__toolbar">
            <div className="import-target-workspace">
              <div
                className="import-destination-mode"
                role="group"
                aria-label={t('Profile list destination')}
              >
                <button
                  type="button"
                  data-selected={destinationMode === 'existing' || undefined}
                  aria-pressed={destinationMode === 'existing'}
                  onClick={() => setDestinationMode('existing')}
                >
                  {t('Existing list')}
                </button>
                <button
                  type="button"
                  data-selected={destinationMode === 'new' || undefined}
                  aria-pressed={destinationMode === 'new'}
                  onClick={() => setDestinationMode('new')}
                >
                  {t('New list')}
                </button>
              </div>

              {destinationMode === 'existing' ? (
                <div className="import-target-group">
                  <label className="import-target-list">
                    <span>{t('Import into')}</span>
                    <select
                      className="select-input"
                      value={selectedTargetListId}
                      onChange={(event) =>
                        setTargetSelection({
                          defaultProfileListId: state.defaultProfileListId,
                          targetListId: event.target.value,
                        })
                      }
                      aria-label={t('Import into profile list')}
                    >
                      {state.profileLists.map((list) => {
                        const builtInDefault =
                          list.id === DEFAULT_PROFILE_LIST_ID && list.name === 'Default';
                        const name = builtInDefault ? t('Default') : list.name;
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
                  <button
                    className="secondary-button import-target-manage"
                    type="button"
                    onClick={() => void onManageList(selectedTargetListId)}
                  >
                    {t('Manage selected list')}
                  </button>
                </div>
              ) : (
                <label className="import-target-list import-target-list--new">
                  <span>{t('New profile list name')}</span>
                  <input
                    className="text-input"
                    value={newListName}
                    onChange={(event) => setNewListName(event.target.value)}
                    placeholder={t('For example, Platform accounts')}
                    autoComplete="off"
                    maxLength={PROFILE_LIST_NAME_MAX_LENGTH}
                    aria-label={t('New profile list name')}
                  />
                </label>
              )}
            </div>
            <span>
              {t('Existing profiles are managed in Profiles; raw import text is not stored.')}
            </span>
          </div>
          <ImportCodeEditor
            value={config}
            onChange={(event) => updateConfig(event.target.value)}
            placeholder={t('Paste AWS config or Organizations JSON here…')}
            onKeyDown={handleEditorKeyDown}
            ariaLabel={t('AWS configuration')}
          />
          <details className="import-example">
            <summary>{t('Show an import example')}</summary>
            <pre>{EXAMPLE_CONFIG}</pre>
          </details>
          <div className="import-editor__footer">
            <div className="import-editor__status" role="status" aria-live="polite">
              <div className="import-editor__stats">
                <span>
                  {config
                    ? t('{count} lines', { count: config.split(/\r?\n/).length })
                    : t('Nothing leaves this device')}
                </span>
                {config && <span>{t('{count} characters', { count: config.length })}</span>}
              </div>
              {config && (
                <strong
                  data-tone={configTooLarge || preview?.format === 'unknown' ? 'error' : 'ready'}
                >
                  {configTooLarge
                    ? t('Pasted configuration must be smaller than 1 MB.')
                    : analyzing
                      ? t('Checking configuration…')
                      : preview?.format === 'unknown'
                        ? t('Format not recognized')
                        : profiles.length === 1
                          ? t('1 valid profile is ready.')
                          : t('{count} valid profiles are ready.', { count: profiles.length })}
                </strong>
              )}
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => void confirmImport()}
              disabled={
                !profiles.length ||
                importing ||
                analyzing ||
                (destinationMode === 'new' && !newListName.trim())
              }
            >
              {importing ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <CheckCircle2 size={17} aria-hidden="true" />
              )}
              {profiles.length === 1
                ? t('Import 1 profile')
                : profiles.length > 1
                  ? t('Import {count} profiles', { count: profiles.length })
                  : t('Import profiles')}
            </button>
          </div>
        </section>

        <aside className="import-safety">
          <ShieldCheck size={20} strokeWidth={1.8} aria-hidden="true" />
          <div>
            <h2>{t('Credential-safe import')}</h2>
            <p>
              {t(
                'Access keys, secret keys, session tokens, credential processes, and token files are explicitly ignored. Account email addresses in Organizations output are never read.',
              )}
            </p>
          </div>
        </aside>
      </div>

      {preview?.format === 'unknown' && (
        <section className="import-review" aria-live="polite">
          <div className="review-empty">
            <FileText size={24} strokeWidth={1.6} aria-hidden="true" />
            <strong>{t('Unrecognized format')}</strong>
            <span>{t(UNKNOWN_FORMAT_MESSAGE)}</span>
          </div>
        </section>
      )}

      {preview && preview.format !== 'unknown' && (
        <section className="import-review" aria-live="polite">
          <div className="panel-heading">
            <div>
              <h2>{t('Import details')}</h2>
            </div>
          </div>

          {preview.format === 'organizations' && (
            <div className="review-notice">
              <div className="organizations-form">
                <p>
                  {preview.accounts.length === 1
                    ? t('1 active account found.')
                    : t('{count} active accounts found.', { count: preview.accounts.length })}{' '}
                  {t(
                    'Organizations output does not include a role, so choose the role every account should be reached through.',
                  )}
                </p>
                <div className="organizations-form__fields">
                  <label className="field">
                    <span className="field__label">{t('Role name or path')}</span>
                    <input
                      className="text-input mono-input"
                      value={roleName}
                      onChange={(event) => setRoleName(event.target.value)}
                      maxLength={ROLE_NAME_MAX_LENGTH}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="OrganizationAccountAccessRole"
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">{t('AWS partition')}</span>
                    <select
                      className="select-input"
                      value={partition}
                      onChange={(event) => setPartition(event.target.value as Partition)}
                    >
                      {PARTITION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {preview.skippedInactive > 0 && (
                  <p className="organizations-form__note">
                    {preview.skippedInactive === 1
                      ? t('1 inactive account skipped.')
                      : t('{count} inactive accounts skipped.', {
                          count: preview.skippedInactive,
                        })}
                  </p>
                )}
              </div>
            </div>
          )}

          {preview.format === 'aws-config' && preview.result.credentialsIgnored && (
            <div className="review-notice review-notice--warning">
              <AlertTriangle size={18} strokeWidth={1.8} aria-hidden="true" />
              <div>
                <strong>{t('Credential fields were removed')}</strong>
                <span>{t('Only profile metadata shown below can be imported.')}</span>
              </div>
            </div>
          )}

          {(collisions.duplicateTargets > 0 || collisions.duplicateNames.length > 0) && (
            <div className="review-notice review-notice--warning">
              <AlertTriangle size={18} strokeWidth={1.8} aria-hidden="true" />
              <div>
                <strong>{t('Duplicates found')}</strong>
                {collisions.duplicateTargets > 0 && (
                  <span>
                    {collisions.duplicateTargets === 1
                      ? t('1 profile already exists in this list and will be skipped.')
                      : t('{count} profiles already exist in this list and will be skipped.', {
                          count: collisions.duplicateTargets,
                        })}
                  </span>
                )}
                {collisions.duplicateNames.length > 0 && (
                  <span>
                    {collisions.duplicateNames.length === 1
                      ? t('1 profile reuses a name already in this list: {names}', {
                          names: duplicateNameList,
                        })
                      : t('{count} profiles reuse a name already in this list: {names}', {
                          count: collisions.duplicateNames.length,
                          names: duplicateNameList,
                        })}
                  </span>
                )}
              </div>
            </div>
          )}

          {issues.length > 0 && (
            <div className="review-issues">
              <div className="review-issues__header">
                <AlertTriangle size={18} strokeWidth={1.8} aria-hidden="true" />
                <strong>{t('{count} entries need attention', { count: issues.length })}</strong>
              </div>
              <ul>
                {issues.slice(0, 20).map((issue, index) => (
                  <li key={`${issue.line ?? 0}-${issue.section ?? ''}-${index}`}>
                    <span>
                      {issue.section
                        ? `[${issue.section}]`
                        : t('Line {line}', { line: issue.line ?? 'unknown' })}
                    </span>
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profiles.length > 0 ? (
            <div className="import-profile-grid">
              {profiles.map((profile, index) => (
                <article
                  className="import-profile profile-tone"
                  style={getProfileToneStyle(profile)}
                  key={`${profile.type}-${profile.accountId}-${profile.roleName}-${index}`}
                >
                  <ProfileAvatar profile={profile} />
                  <div className="import-profile__copy">
                    <div>
                      <strong>{profile.name}</strong>
                      <ProfileTypeBadge type={profile.type} />
                    </div>
                    <span>{profile.roleName}</span>
                    <small>{formatAccountId(profile.accountId, false)}</small>
                  </div>
                  <EnvironmentBadge profile={profile} />
                </article>
              ))}
            </div>
          ) : (
            <div className="review-empty">
              <FileText size={24} strokeWidth={1.6} aria-hidden="true" />
              <strong>{t('No importable profiles')}</strong>
              <span>
                {preview.format === 'organizations'
                  ? t('Enter the role name every account should use.')
                  : t(
                      'Fix the issues above or provide sections with role or Identity Center fields.',
                    )}
              </span>
            </div>
          )}

          {ignored.length > 0 && (
            <details className="import-review__ignored">
              <summary>
                {ignored.length === 1
                  ? t('1 section not included')
                  : t('{count} sections not included', { count: ignored.length })}
              </summary>
              <ul>
                {ignored.map((entry) => (
                  <li key={entry.section}>
                    <span>[{entry.section}]</span>
                    {entry.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </section>
  );
}
