import { describe, expect, it } from 'vitest';
import { getColorById, getProfileColor, PROFILE_COLORS } from './colors';
import { ENVIRONMENT_OPTIONS, type Environment } from './profile';

const ENVIRONMENTS = ENVIRONMENT_OPTIONS.map((option) => option.value);

describe('getProfileColor', () => {
  it.each([
    ['production', 'rose'],
    ['staging', 'amber'],
    ['development', 'sky'],
    ['sandbox', 'mint'],
    ['shared', 'teal'],
  ] satisfies [Environment, string][])(
    'assigns the semantic %s color (%s)',
    (environment, expected) => {
      expect(getProfileColor({ accountId: '123456789012', environment }).id).toBe(expected);
    },
  );

  it('gives production and staging visually distinct treatments', () => {
    const production = getProfileColor({ accountId: '123456789012', environment: 'production' });
    const staging = getProfileColor({ accountId: '123456789012', environment: 'staging' });
    expect(production.id).not.toBe(staging.id);
    expect(production.light.surface).not.toBe(staging.light.surface);
    expect(production.dark.surface).not.toBe(staging.dark.surface);
  });

  it('ignores the account ID for semantic environments', () => {
    const first = getProfileColor({ accountId: '111111111111', environment: 'production' });
    const second = getProfileColor({ accountId: '999999999999', environment: 'production' });
    expect(first.id).toBe(second.id);
  });

  it('is deterministic for the "other" environment', () => {
    const first = getProfileColor({ accountId: 'acme-payments', environment: 'other' });
    const second = getProfileColor({ accountId: 'acme-payments', environment: 'other' });
    expect(first.id).toBe(second.id);
  });

  it('is case-insensitive on the account ID', () => {
    expect(getProfileColor({ accountId: 'ACME-Payments', environment: 'other' }).id).toBe(
      getProfileColor({ accountId: 'acme-payments', environment: 'other' }).id,
    );
  });

  it('spreads unclassified accounts across more than one color', () => {
    const ids = new Set(
      Array.from(
        { length: 40 },
        (_unused, index) =>
          getProfileColor({ accountId: `account-${index}`, environment: 'other' }).id,
      ),
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it.each(ENVIRONMENTS)('returns a complete UI color for %s', (environment) => {
    const color = getProfileColor({ accountId: '123456789012', environment });

    expect(color.label.length).toBeGreaterThan(0);
    expect(color).not.toHaveProperty('awsHex');

    for (const scheme of [color.light, color.dark]) {
      for (const value of Object.values(scheme)) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('getColorById', () => {
  it('exposes every supported manual palette color exactly once', () => {
    expect(PROFILE_COLORS.map(({ id }) => id)).toEqual([
      'rose',
      'peach',
      'amber',
      'mint',
      'teal',
      'sky',
      'indigo',
      'lilac',
    ]);
  });

  it('resolves a known color', () => {
    expect(getColorById('rose')?.id).toBe('rose');
  });

  it('returns undefined for an unknown color', () => {
    expect(getColorById('chartreuse')).toBeUndefined();
  });

  it('round-trips every color assigned by getProfileColor', () => {
    for (const environment of ENVIRONMENTS) {
      const color = getProfileColor({ accountId: 'round-trip', environment });
      expect(getColorById(color.id)).toEqual(color);
    }
  });
});
