import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AA_LARGE_TEXT_AND_UI,
  AA_NORMAL_TEXT,
  contrastRatio as contrast,
} from '../test-support/contrast';

/**
 * The design tokens are the only place light and dark contrast is decided, and a
 * single hex tweak can silently drop small copy below AA. These checks read the
 * stylesheet directly so a regression fails here instead of in a store review.
 */
const CSS = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function tokens(selector: string): Map<string, string> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`Selector ${selector} is not present in tokens.css.`);

  const block = CSS.slice(start + selector.length);
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('}'));
  const found = new Map<string, string>();

  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    if (name && value) found.set(name, value.toLowerCase());
  }
  if (found.size === 0) throw new Error(`Selector ${selector} declared no color tokens.`);
  return found;
}

const THEMES = [
  { name: 'light', selector: ":root[data-theme='light']" },
  { name: 'dark', selector: ":root[data-theme='dark']" },
] as const;

const BACKGROUNDS = ['--color-canvas', '--color-surface', '--color-surface-muted'] as const;

describe('contrast helper', () => {
  it('matches the reference ratios from the WCAG formula', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#767676', '#ffffff')).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('rejects a selector that is absent from the stylesheet', () => {
    expect(() => tokens("[data-theme='sepia']")).toThrow(/not present/);
  });
});

describe('automatic dark mode', () => {
  it('repeats the explicit dark tokens exactly, so the two copies cannot drift', () => {
    const explicit = tokens(":root[data-theme='dark']");
    const automatic = tokens('@media (prefers-color-scheme: dark)');

    for (const [name, value] of explicit) {
      expect(automatic.get(name), `${name} differs under prefers-color-scheme`).toBe(value);
    }
  });
});

describe.each(THEMES)('$name theme tokens', ({ selector }) => {
  const theme = tokens(selector);

  it('defines every token the checks below rely on', () => {
    for (const token of [
      ...BACKGROUNDS,
      '--color-text',
      '--color-text-secondary',
      '--color-text-tertiary',
      '--color-accent',
      '--color-danger',
      '--color-border-strong',
    ]) {
      expect(theme.get(token), `${token} is missing`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(['--color-text', '--color-text-secondary', '--color-text-tertiary'])(
    '%s clears AA for normal-size text on every background',
    (token) => {
      const foreground = theme.get(token)!;

      for (const background of BACKGROUNDS) {
        const ratio = contrast(foreground, theme.get(background)!);
        expect(ratio, `${token} on ${background} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          AA_NORMAL_TEXT,
        );
      }
    },
  );

  it.each(['--color-accent', '--color-danger'])(
    '%s clears AA for interactive elements on every background',
    (token) => {
      const foreground = theme.get(token)!;

      for (const background of BACKGROUNDS) {
        const ratio = contrast(foreground, theme.get(background)!);
        expect(ratio, `${token} on ${background} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          AA_LARGE_TEXT_AND_UI,
        );
      }
    },
  );

  it('keeps a visible hierarchy between primary, secondary and tertiary text', () => {
    const surface = theme.get('--color-surface')!;
    const primary = contrast(theme.get('--color-text')!, surface);
    const secondary = contrast(theme.get('--color-text-secondary')!, surface);
    const tertiary = contrast(theme.get('--color-text-tertiary')!, surface);

    expect(primary).toBeGreaterThan(secondary);
    expect(secondary).toBeGreaterThan(tertiary);
  });
});
