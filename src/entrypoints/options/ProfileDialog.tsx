import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Palette, Star, X } from 'lucide-react';
import {
  ACCOUNT_ALIAS_MAX_LENGTH,
  AWS_ACCOUNT_ID_LENGTH,
  ENVIRONMENT_OPTIONS,
  PARTITION_OPTIONS,
  PORTAL_URL_MAX_LENGTH,
  REGION_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
  profileDraftSchema,
  type Environment,
  type Partition,
  type Profile,
  type ProfileColorId,
  type ProfileDraft,
} from '../../domain/profile';
import { getProfileColor, PROFILE_COLORS } from '../../domain/colors';
import { getProfileToneStyle, ProfileAvatar } from '../../components/ProfileVisual';
import { useI18n, type Message } from '../../i18n';

interface ProfileDialogProps {
  profile: Profile | null;
  onClose: () => void;
  onSave: (draft: ProfileDraft) => Promise<void>;
}

interface FormValues {
  type: 'role' | 'sso';
  name: string;
  accountId: string;
  roleName: string;
  partition: Partition;
  portalUrl: string;
  region: string;
  environment: Environment;
  tags: string;
  favorite: boolean;
  colorId: ProfileColorId | undefined;
}

type FormErrors = Partial<Record<keyof FormValues | 'form', string | undefined>>;

export function ProfileDialog({ profile, onClose, onSave }: ProfileDialogProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const colorPickerId = useId();
  const [values, setValues] = useState<FormValues>(() => valuesFromProfile(profile));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const preview = useMemo(
    () => ({
      name: values.name || t('New profile'),
      accountId: values.accountId || 'rolehop-preview',
      environment: values.environment,
      ...(values.colorId ? { colorId: values.colorId } : {}),
    }),
    [t, values.accountId, values.colorId, values.environment, values.name],
  );
  const previewColor = getProfileColor(preview);

  function setField<Key extends keyof FormValues>(key: Key, value: FormValues[Key]): void {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, form: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const candidate = toDraft(values);
    const result = profileDraftSchema.safeParse(candidate);
    if (!result.success) {
      const nextErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !nextErrors[field as keyof FormValues]) {
          nextErrors[field as keyof FormValues] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      await onSave(result.data);
    } catch (error: unknown) {
      setErrors({
        form: error instanceof Error ? error.message : t('Could not save the profile.'),
      });
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="form-dialog"
      aria-labelledby="profile-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <header className="form-dialog__header">
          <div>
            <p className="view-header__eyebrow">{profile ? t('Edit profile') : t('New profile')}</p>
            <h2 id="profile-dialog-title">{profile ? profile.name : t('Add an AWS profile')}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label={t('Close dialog')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="form-dialog__body profile-form">
          <fieldset className="segmented-field">
            <legend>{t('Connection type')}</legend>
            <div className="segmented-control">
              <button
                type="button"
                data-active={values.type === 'role' || undefined}
                aria-pressed={values.type === 'role'}
                onClick={() => setField('type', 'role')}
              >
                {t('IAM role')}
              </button>
              <button
                type="button"
                data-active={values.type === 'sso' || undefined}
                aria-pressed={values.type === 'sso'}
                onClick={() => setField('type', 'sso')}
              >
                {t('Identity Center')}
              </button>
            </div>
          </fieldset>

          <div className="profile-form__preview profile-tone">
            <ProfileAvatar profile={preview} />
            <div>
              <strong>{values.name || t('New profile')}</strong>
              <span>
                {t(previewColor.label as Message)} ·{' '}
                {values.colorId ? t('selected manually') : t('assigned automatically')}
              </span>
            </div>
            <button
              className="profile-color-trigger"
              type="button"
              aria-label={t('Choose profile color')}
              aria-expanded={colorPickerOpen}
              aria-controls={colorPickerId}
              onClick={() => setColorPickerOpen((open) => !open)}
              disabled={saving}
            >
              <Palette size={18} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>

          {colorPickerOpen && (
            <fieldset className="profile-color-picker" id={colorPickerId}>
              <legend>{t('Profile color')}</legend>
              <div className="profile-color-options">
                <label
                  className="profile-color-option"
                  data-selected={!values.colorId || undefined}
                >
                  <input
                    className="visually-hidden"
                    type="radio"
                    name={`profile-color-${colorPickerId}`}
                    checked={!values.colorId}
                    onChange={() => setField('colorId', undefined)}
                  />
                  <span className="profile-color-swatch profile-color-swatch--automatic">
                    <Palette size={14} aria-hidden="true" />
                  </span>
                  <span>{t('Automatic')}</span>
                </label>
                {PROFILE_COLORS.map((color) => (
                  <label
                    className="profile-color-option profile-tone"
                    data-selected={values.colorId === color.id || undefined}
                    key={color.id}
                    style={getProfileToneStyle({ ...preview, colorId: color.id })}
                  >
                    <input
                      className="visually-hidden"
                      type="radio"
                      name={`profile-color-${colorPickerId}`}
                      checked={values.colorId === color.id}
                      onChange={() => setField('colorId', color.id)}
                    />
                    <span className="profile-color-swatch" aria-hidden="true" />
                    <span>{t(color.label as Message)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div className="profile-form__grid">
            <Field label={t('Profile name')} error={errors.name}>
              {({ id, describedBy }) => (
                <input
                  className="text-input"
                  value={values.name}
                  onChange={(event) => setField('name', event.target.value)}
                  aria-invalid={Boolean(errors.name)}
                  id={id}
                  aria-describedby={describedBy}
                  autoFocus
                  maxLength={48}
                  placeholder="Production read-only"
                />
              )}
            </Field>

            <Field
              label={values.type === 'sso' ? t('AWS account ID') : t('Account ID or alias')}
              error={errors.accountId}
              hint={
                values.type === 'sso'
                  ? t('Enter exactly 12 digits.')
                  : t('Enter exactly 12 digits, or a 3–63 character lowercase account alias.')
              }
            >
              {({ id, describedBy }) => (
                <input
                  className="text-input mono-input"
                  value={values.accountId}
                  onChange={(event) => setField('accountId', event.target.value)}
                  aria-invalid={Boolean(errors.accountId)}
                  id={id}
                  aria-describedby={describedBy}
                  inputMode={values.type === 'sso' ? 'numeric' : 'text'}
                  maxLength={
                    values.type === 'sso' ? AWS_ACCOUNT_ID_LENGTH : ACCOUNT_ALIAS_MAX_LENGTH
                  }
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="123456789012"
                />
              )}
            </Field>

            <Field
              label={values.type === 'sso' ? t('Permission set') : t('Role name or path')}
              error={errors.roleName}
            >
              {({ id, describedBy }) => (
                <input
                  className="text-input mono-input"
                  value={values.roleName}
                  onChange={(event) => setField('roleName', event.target.value)}
                  aria-invalid={Boolean(errors.roleName)}
                  id={id}
                  aria-describedby={describedBy}
                  maxLength={ROLE_NAME_MAX_LENGTH}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={values.type === 'sso' ? 'ReadOnlyAccess' : 'team/ReadOnlyRole'}
                />
              )}
            </Field>

            <Field label={t('Environment')} error={errors.environment}>
              {({ id, describedBy }) => (
                <select
                  className="select-input"
                  value={values.environment}
                  onChange={(event) => setField('environment', event.target.value as Environment)}
                  id={id}
                  aria-describedby={describedBy}
                >
                  {ENVIRONMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            {values.type === 'role' ? (
              <Field
                label={t('AWS partition')}
                error={errors.partition}
                className="profile-form__wide"
              >
                {({ id, describedBy }) => (
                  <select
                    className="select-input"
                    value={values.partition}
                    onChange={(event) => setField('partition', event.target.value as Partition)}
                    id={id}
                    aria-describedby={describedBy}
                  >
                    {PARTITION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : (
              <Field
                label={t('AWS access portal URL')}
                error={errors.portalUrl}
                className="profile-form__wide"
              >
                {({ id, describedBy }) => (
                  <input
                    className="text-input mono-input"
                    value={values.portalUrl}
                    onChange={(event) => setField('portalUrl', event.target.value)}
                    aria-invalid={Boolean(errors.portalUrl)}
                    id={id}
                    aria-describedby={describedBy}
                    inputMode="url"
                    maxLength={PORTAL_URL_MAX_LENGTH}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="https://your-company.awsapps.com/start"
                  />
                )}
              </Field>
            )}

            <Field
              label={t('Landing region')}
              error={errors.region}
              hint={t('Optional. Opens the console in this region, for example eu-west-1.')}
              className="profile-form__wide"
            >
              {({ id, describedBy }) => (
                <input
                  className="text-input mono-input"
                  value={values.region}
                  onChange={(event) => setField('region', event.target.value)}
                  aria-invalid={Boolean(errors.region)}
                  id={id}
                  aria-describedby={describedBy}
                  maxLength={REGION_MAX_LENGTH}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="eu-west-1"
                />
              )}
            </Field>

            <Field
              label={t('Tags')}
              error={errors.tags}
              hint={t('Separate up to eight tags with commas.')}
              className="profile-form__wide"
            >
              {({ id, describedBy }) => (
                <input
                  className="text-input"
                  value={values.tags}
                  onChange={(event) => setField('tags', event.target.value)}
                  aria-invalid={Boolean(errors.tags)}
                  id={id}
                  aria-describedby={describedBy}
                  maxLength={255}
                  placeholder="platform, payments"
                />
              )}
            </Field>
          </div>

          <label className="checkbox-row profile-form__favorite">
            <input
              type="checkbox"
              checked={values.favorite}
              onChange={(event) => setField('favorite', event.target.checked)}
            />
            <span className="checkbox-row__copy">
              <span className="checkbox-row__title">
                <Star size={14} aria-hidden="true" /> {t('Favorite profile')}
              </span>
              <span className="checkbox-row__description">
                {t('Keep this profile near the top of search results.')}
              </span>
            </span>
          </label>

          {errors.form && (
            <div className="form-error" role="alert">
              {errors.form}
            </div>
          )}
        </div>

        <footer className="form-dialog__footer">
          <button className="secondary-button" type="button" onClick={onClose} disabled={saving}>
            {t('Cancel')}
          </button>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {profile ? t('Save changes') : t('Add profile')}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

interface FieldControl {
  id: string;
  describedBy: string | undefined;
}

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string | undefined;
  children: (control: FieldControl) => React.ReactNode;
}

/**
 * Labels a control and links its hint or validation error through
 * `aria-describedby`, so assistive technology announces why an entry was
 * rejected instead of only that it is invalid.
 *
 * The hint and error sit outside the `<label>` on purpose. Nested inside it they
 * become part of the control's accessible *name* — a screen reader would read
 * "Tags Separate up to eight tags with commas." as the field name and then
 * repeat the same sentence as its description.
 */
function Field({ label, error, hint, className, children }: FieldProps) {
  const baseId = useId();
  const controlId = `${baseId}-control`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const showHint = Boolean(hint) && !error;
  const describedBy = error ? errorId : showHint ? hintId : undefined;

  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label className="field__label" htmlFor={controlId}>
        {label}
      </label>
      {children({ id: controlId, describedBy })}
      {showHint && (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function valuesFromProfile(profile: Profile | null): FormValues {
  if (!profile) {
    return {
      type: 'role',
      name: '',
      accountId: '',
      roleName: '',
      partition: 'aws',
      portalUrl: '',
      region: '',
      environment: 'other',
      tags: '',
      favorite: false,
      colorId: undefined,
    };
  }

  return {
    type: profile.type,
    name: profile.name,
    accountId: profile.accountId,
    roleName: profile.roleName,
    partition: profile.type === 'role' ? profile.partition : 'aws',
    portalUrl: profile.type === 'sso' ? profile.portalUrl : '',
    region: profile.region ?? '',
    environment: profile.environment,
    tags: profile.tags.join(', '),
    favorite: profile.favorite,
    colorId: profile.colorId,
  };
}

function toDraft(values: FormValues): unknown {
  const common = {
    type: values.type,
    name: values.name,
    accountId: values.accountId,
    roleName: values.roleName,
    environment: values.environment,
    favorite: values.favorite,
    tags: values.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    ...(values.colorId ? { colorId: values.colorId } : {}),
  };

  const region = values.region.trim() ? { region: values.region } : {};
  if (values.type === 'role') return { ...common, partition: values.partition, ...region };
  return { ...common, portalUrl: values.portalUrl, ...region };
}
