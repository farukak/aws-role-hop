import { useEffect, useRef } from 'react';
import { ArrowLeft, ExternalLink, Sparkles } from 'lucide-react';
import { RELEASE_NOTES } from '../../domain/release-notes';
import { useI18n } from '../../i18n';

interface WhatsNewViewProps {
  onBack: () => void;
}

export function WhatsNewView({ onBack }: WhatsNewViewProps) {
  const { t } = useI18n();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="options-view">
      <header className="view-header">
        <div>
          <p className="view-header__eyebrow">{t('Release notes')}</p>
          <h1 ref={headingRef} tabIndex={-1}>
            {t("What's new")}
          </h1>
          <p>{t('Recent improvements included in this local build.')}</p>
        </div>
      </header>

      <div className="preferences-stack">
        {RELEASE_NOTES.map((release) => {
          const headingId = `release-${release.version.replaceAll('.', '-')}`;
          return (
            <section
              className="content-panel whats-new-release"
              aria-labelledby={headingId}
              key={release.version}
            >
              <div className="whats-new-release__heading">
                <span className="whats-new-release__icon" aria-hidden="true">
                  <Sparkles size={18} strokeWidth={1.8} />
                </span>
                <div>
                  <h2 id={headingId}>{t('Version {version}', { version: release.version })}</h2>
                  <time dateTime={release.date}>
                    {t('Released {date}', { date: release.date })}
                  </time>
                </div>
              </div>
              <ul className="whats-new-list">
                {release.highlights.map((highlight) => (
                  <li key={highlight}>{t(highlight)}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="whats-new-actions">
        <button className="secondary-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t('Back to preferences')}
        </button>
        <a
          className="secondary-button"
          href="https://github.com/farukak/aws-role-hop/blob/main/CHANGELOG.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('View full changelog on GitHub')}
          <ExternalLink size={15} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
