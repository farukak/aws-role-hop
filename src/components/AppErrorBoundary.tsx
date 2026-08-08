import { Component, type ReactNode } from 'react';
import { StatusCard } from './StatusCard';
import { useI18n } from '../i18n';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

function ErrorFallback() {
  const { t } = useI18n();
  return (
    <StatusCard
      tone="error"
      title={t('Something went wrong')}
      description={t('AWS Role Hop could not render this view. Reload the extension to try again.')}
      action={
        <button className="secondary-button" type="button" onClick={() => window.location.reload()}>
          {t('Reload')}
        </button>
      }
    />
  );
}

interface AppErrorBoundaryState {
  failed: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  override render(): ReactNode {
    if (this.state.failed) return <ErrorFallback />;
    return this.props.children;
  }
}
