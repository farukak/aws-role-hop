import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isVersionUpgrade, latestRelease, RELEASE_NOTES } from './release-notes';

const packageMetadata = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

describe('release notes', () => {
  it('keeps the latest release first', () => {
    expect(latestRelease()).toBe(RELEASE_NOTES[0]);
    expect(latestRelease().version).toBe(packageMetadata.version);
  });

  it.each([
    ['0.2.0', '0.1.9', true],
    ['1.0.0', '0.9.9', true],
    ['0.1.1', '0.1', true],
    ['0.1.0', '0.1.0', false],
    ['0.1.0', '0.2.0', false],
    ['0.1.0', undefined, false],
    ['0.1.0-beta', '0.1.0', false],
    ['not-a-version', '0.1.0', false],
  ] as const)('compares %s with %s safely', (current, previous, expected) => {
    expect(isVersionUpgrade(current, previous)).toBe(expected);
  });
});
