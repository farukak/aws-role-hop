import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from '../../components/AppErrorBoundary';
import { AppI18nProvider } from '../../i18n';
import { OptionsApp } from './App';
import './options.css';

const root = document.querySelector('#root');
if (!root) throw new Error('Options root element is missing.');

createRoot(root).render(
  <StrictMode>
    <AppI18nProvider>
      <AppErrorBoundary>
        <OptionsApp />
      </AppErrorBoundary>
    </AppI18nProvider>
  </StrictMode>,
);
