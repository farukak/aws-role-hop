import markUrl from '../assets/icon.svg';
import { useI18n } from '../i18n';

interface BrandProps {
  compact?: boolean;
  size?: number;
}

export function Brand({ compact = false, size = 36 }: BrandProps) {
  const { t } = useI18n();
  return (
    <div className="brand">
      <img className="brand__mark" src={markUrl} width={size} height={size} alt="" />
      <div className="brand__copy">
        <p className="brand__name">AWS Role Hop</p>
        {!compact && <p className="brand__tagline">{t('AWS console profiles')}</p>}
      </div>
    </div>
  );
}
