import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from '../../components/AppErrorBoundary';
import { AppI18nProvider } from '../../i18n';
import { PopupApp } from './App';
import './popup.css';

const root = document.querySelector('#root');
if (!root) throw new Error('Popup root element is missing.');

createRoot(root).render(
  <StrictMode>
    <AppI18nProvider>
      <AppErrorBoundary>
        <PopupApp />
      </AppErrorBoundary>
    </AppI18nProvider>
  </StrictMode>,
);
