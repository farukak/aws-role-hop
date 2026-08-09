/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { latestRelease } from '../../domain/release-notes';
import { WhatsNewView } from './WhatsNewView';

describe('WhatsNewView', () => {
  it('renders the bundled release and moves focus to the page heading', () => {
    render(<WhatsNewView onBack={vi.fn()} />);

    const heading = screen.getByRole('heading', { level: 1, name: "What's new" });
    expect(document.activeElement).toBe(heading);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: `Version ${latestRelease().version}`,
      }),
    ).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(latestRelease().highlights.length);
  });

  it('returns to preferences through the in-app action', async () => {
    const onBack = vi.fn();
    render(<WhatsNewView onBack={onBack} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to preferences' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('links to the full changelog without giving the new page opener access', () => {
    render(<WhatsNewView onBack={vi.fn()} />);

    const link = screen.getByRole('link', { name: 'View full changelog on GitHub' });
    expect(link.getAttribute('href')).toBe(
      'https://github.com/farukak/aws-role-hop/blob/main/CHANGELOG.md',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });
});
