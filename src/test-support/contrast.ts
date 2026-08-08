/**
 * WCAG 2.2 relative luminance and contrast ratio. Used by the design-token and
 * icon tests; never imported by shipped code.
 */

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/** Minimum ratio for text below 18.66px (WCAG 1.4.3). */
export const AA_NORMAL_TEXT = 4.5;

/** Minimum ratio for large text, icons and interface components (WCAG 1.4.11). */
export const AA_LARGE_TEXT_AND_UI = 3;

/** Chrome renders the toolbar on one of these, depending on the browser theme. */
export const CHROME_TOOLBAR = {
  light: '#f1f3f4',
  dark: '#292a2d',
} as const;
