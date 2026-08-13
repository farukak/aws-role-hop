import { AccessModeMark, type AccessModeChoice } from '../../components/AccessModeMark';
import { Brand } from '../../components/Brand';
import { useI18n } from '../../i18n';

interface AccessModeChooserProps {
  onChoose: (mode: AccessModeChoice) => void;
  busy: AccessModeChoice | null;
  error: string | null;
}

/**
 * Shown once, before any profile list, because the two access paths need
 * different setup: IAM works from the Console tab you are already signed in to,
 * while Identity Center needs access to your AWS access portal.
 */
export function AccessModeChooser({ onChoose, busy, error }: AccessModeChooserProps) {
  const { t } = useI18n();

  return (
    <main className="popup-shell popup-shell--choice">
      <header className="popup-header">
        <Brand compact size={34} />
      </header>

      <div className="access-mode-choice__heading">
        <h1>{t('How do you use AWS?')}</h1>
        <p>
          {t(
            'Choose the access path AWS Role Hop should open with. You can change it later in settings.',
          )}
        </p>
      </div>

      {error && (
        <div className="popup-alert" role="alert">
          {error}
        </div>
      )}

      <div className="access-mode-choice">
        <button
          type="button"
          className="access-mode-card"
          onClick={() => onChoose('iam')}
          disabled={busy !== null}
        >
          <AccessModeMark mode="iam" size={46} />
          <span className="access-mode-card__copy">
            <strong>{t('IAM roles')}</strong>
            <small>{t('Switch roles from an authenticated AWS Console tab.')}</small>
          </span>
          {busy === 'iam' && <span className="spinner" aria-hidden="true" />}
        </button>

        <button
          type="button"
          className="access-mode-card"
          onClick={() => onChoose('sso')}
          disabled={busy !== null}
        >
          <AccessModeMark mode="sso" size={46} />
          <span className="access-mode-card__copy">
            <strong>{t('IAM Identity Center')}</strong>
            <small>{t('Open permission sets through your AWS access portal.')}</small>
            <span className="access-mode-card__note">
              {t('Needs access to your AWS access portal')}
            </span>
          </span>
          {busy === 'sso' && <span className="spinner" aria-hidden="true" />}
        </button>
      </div>

      <p className="access-mode-choice__footnote">
        {t('AWS Role Hop asks for portal access only when you choose Identity Center.')}
      </p>
    </main>
  );
}
