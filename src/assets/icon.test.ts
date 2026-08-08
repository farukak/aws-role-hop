import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AA_LARGE_TEXT_AND_UI, CHROME_TOOLBAR, contrastRatio } from '../test-support/contrast';

/**
 * The AWS Role Hop mark is a single directional arc — one "hop" landing on the next
 * role. It stays deliberately minimal because the constraints are tight:
 *
 * - Browser toolbars render it at 16px. A second element, or any stroke below
 *   ~16 units in this 128-unit viewBox, collapses into an indistinct blob. The
 *   previous mark had two bars and an arrow; at 16px it read as the letter "H".
 * - The badge fill has to clear 3:1 against both the light (#f1f3f4) and dark
 *   (#292a2d) Chrome toolbar, or the icon loses its edge in one of the themes.
 * - Vite inlines the file as a data URI, so anything in it ships in the bundle.
 *   Rationale belongs here, not in the asset.
 *
 * It is also the single source of the mark: @wxt-dev/auto-icons rasterizes it to
 * 16/32/48/128 and Brand.tsx renders the same file, so the two cannot drift.
 *
 * These checks guard the two failures that are easy to introduce and expensive
 * to discover late: a remote reference (an automatic store rejection) and a
 * badge colour that disappears into the browser toolbar.
 */
const SVG = readFileSync(new URL('./icon.svg', import.meta.url), 'utf8');

function attribute(name: string): string | undefined {
  return new RegExp(`${name}="([^"]+)"`).exec(SVG)?.[1];
}

describe('icon.svg structure', () => {
  it('is a single-root SVG with a square viewBox', () => {
    expect(SVG).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(SVG.match(/<svg[\s>]/g)).toHaveLength(1);

    const viewBox = attribute('viewBox');
    expect(viewBox).toBeDefined();

    const [minX, minY, width, height] = viewBox!.split(/\s+/).map(Number);
    expect([minX, minY]).toEqual([0, 0]);
    expect(width).toBe(height);
  });

  it('carries an accessible name for standalone use', () => {
    expect(attribute('role')).toBe('img');
    expect(attribute('aria-label')).toBe('AWS Role Hop');
  });
});

describe('icon.svg store compliance', () => {
  it.each([
    ['a script element', /<script/i],
    ['a foreignObject', /<foreignObject/i],
    ['a raster or external image', /<image[\s>]/i],
    ['an xlink reference', /xlink:href/i],
    ['a remote URL', /https?:\/\/(?!www\.w3\.org)/i],
    ['a CSS url() reference', /url\(/i],
    ['an embedded data URI', /data:/i],
    ['an event handler', /\son[a-z]+=/i],
  ])('contains no %s', (_label, pattern) => {
    expect(pattern.test(SVG)).toBe(false);
  });
});

describe('icon.svg legibility at toolbar size', () => {
  const badge = /<rect[^>]*fill="(#[0-9a-f]{6})"/i.exec(SVG)?.[1];
  const glyph = /<path[\s\S]*?stroke="(#[0-9a-f]{6})"/i.exec(SVG)?.[1];

  it('declares an explicit badge and glyph colour', () => {
    expect(badge).toMatch(/^#[0-9a-f]{6}$/i);
    expect(glyph).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(Object.entries(CHROME_TOOLBAR))(
    'keeps a visible edge against the %s browser toolbar',
    (_theme, toolbar) => {
      const ratio = contrastRatio(badge!, toolbar);
      expect(ratio, `badge on ${toolbar} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_LARGE_TEXT_AND_UI,
      );
    },
  );

  it('keeps the glyph readable on the badge', () => {
    expect(contrastRatio(glyph!, badge!)).toBeGreaterThanOrEqual(AA_LARGE_TEXT_AND_UI);
  });

  it('draws one shape with a stroke heavy enough to survive 16px', () => {
    // A 128-unit viewBox scaled to 16px divides every length by 8, so a stroke
    // below 16 units renders under 2px and turns into an indistinct smudge.
    expect(SVG.match(/<path[\s>]/g)).toHaveLength(1);

    const strokeWidth = Number(attribute('stroke-width'));
    const [, , viewBoxWidth] = attribute('viewBox')!.split(/\s+/).map(Number);
    expect((strokeWidth / viewBoxWidth!) * 16).toBeGreaterThanOrEqual(2);
  });
});
