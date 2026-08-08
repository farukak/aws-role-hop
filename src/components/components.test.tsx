/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';
import { Brand } from './Brand';
import {
  EnvironmentBadge,
  ProfileAvatar,
  ProfileTypeBadge,
  getProfileToneStyle,
} from './ProfileVisual';
import { StatusCard } from './StatusCard';

describe('Brand', () => {
  it('shows the product name and tagline', () => {
    render(<Brand />);
    expect(screen.getByText('AWS Role Hop')).toBeDefined();
    expect(screen.getByText('AWS console profiles')).toBeDefined();
  });

  it('drops the tagline when compact', () => {
    render(<Brand compact />);
    expect(screen.getByText('AWS Role Hop')).toBeDefined();
    expect(screen.queryByText('AWS console profiles')).toBeNull();
  });

  it('renders the mark as decorative, because the name is adjacent text', () => {
    const { container } = render(<Brand />);
    const mark = container.querySelector('img.brand__mark');
    expect(mark?.getAttribute('alt')).toBe('');
    expect(mark?.getAttribute('src')).toContain('svg');
  });

  it('applies the requested size to the mark', () => {
    const { container } = render(<Brand size={48} />);
    const mark = container.querySelector('img.brand__mark');
    expect(mark?.getAttribute('width')).toBe('48');
    expect(mark?.getAttribute('height')).toBe('48');
  });
});

describe('StatusCard', () => {
  it('renders the title, description and action', () => {
    render(
      <StatusCard
        title="No profiles yet"
        description="Add one to begin."
        action={<button>Add</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No profiles yet' })).toBeDefined();
    expect(screen.getByText('Add one to begin.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDefined();
  });

  it('announces an error tone as an alert', () => {
    render(<StatusCard tone="error" title="Profiles unavailable" description="Storage failed." />);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('does not announce the empty tone', () => {
    render(<StatusCard title="Nothing here" description="Add a profile." />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('AppErrorBoundary', () => {
  function Exploding(): never {
    throw new Error('render failed');
  }

  it('renders children while they succeed', () => {
    render(
      <AppErrorBoundary>
        <p>All good</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeDefined();
  });

  it('shows a recoverable error card when a child throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <Exploding />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined();
    consoleError.mockRestore();
  });
});

describe('ProfileVisual', () => {
  const production = {
    name: 'Production read-only',
    accountId: '123456789012',
    environment: 'production',
  } as const;

  it.each([
    ['Production read-only', 'PO'],
    ['Platform', 'PL'],
    ['acme_prod_admin', 'AA'],
    ['   ', 'RH'],
  ])('derives avatar initials from %s', (name, expected) => {
    const { container } = render(<ProfileAvatar profile={{ ...production, name }} />);
    expect(container.querySelector('.profile-avatar')?.textContent).toBe(expected);
  });

  it('hides the avatar from assistive technology, since the name is shown as text', () => {
    const { container } = render(<ProfileAvatar profile={production} />);
    expect(container.querySelector('.profile-avatar')?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each([
    ['production', 'Production'],
    ['staging', 'Staging'],
    ['shared', 'Shared services'],
    ['other', 'Other'],
  ] as const)('labels the %s environment in text, not colour alone', (environment, label) => {
    render(<EnvironmentBadge profile={{ ...production, environment }} />);
    expect(screen.getByText(label)).toBeDefined();
  });

  it.each([
    ['role', 'IAM'],
    ['sso', 'SSO'],
  ] as const)('labels a %s profile as %s', (type, label) => {
    render(<ProfileTypeBadge type={type} />);
    expect(screen.getByText(label)).toBeDefined();
  });

  it('exposes both light and dark tone values as custom properties', () => {
    const style = getProfileToneStyle(production);
    expect(Object.keys(style).sort()).toEqual([
      '--profile-accent-dark',
      '--profile-accent-light',
      '--profile-border-dark',
      '--profile-border-light',
      '--profile-surface-dark',
      '--profile-surface-light',
      '--profile-text-dark',
      '--profile-text-light',
    ]);
  });
});
