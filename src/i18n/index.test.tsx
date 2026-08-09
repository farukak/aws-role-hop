/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider, resolveLanguage, useI18n } from './index';

function Example() {
  const { t } = useI18n();
  return <p>{t('{count} profiles', { count: 3 })}</p>;
}

describe('resolveLanguage', () => {
  it('honors an explicit language preference', () => {
    expect(resolveLanguage('en', 'tr-TR')).toBe('en');
    expect(resolveLanguage('tr', 'en-US')).toBe('tr');
  });

  it('uses Turkish only for a Turkish browser locale', () => {
    expect(resolveLanguage('system', 'tr-TR')).toBe('tr');
    expect(resolveLanguage('system', 'TR-TR')).toBe('tr');
    expect(resolveLanguage('system', 'en-US')).toBe('en');
    expect(resolveLanguage('system', 'de-DE')).toBe('en');
  });
});

describe('I18nProvider', () => {
  it('renders Turkish messages with variables and updates the document language', async () => {
    render(
      <I18nProvider preference="tr">
        <Example />
      </I18nProvider>,
    );

    expect(screen.getByText('3 profil')).toBeDefined();
    await waitFor(() => expect(document.documentElement.lang).toBe('tr'));
  });

  it('keeps English as the source locale', () => {
    render(
      <I18nProvider preference="en">
        <Example />
      </I18nProvider>,
    );
    expect(screen.getByText('3 profiles')).toBeDefined();
  });
});
