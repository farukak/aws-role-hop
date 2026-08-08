import { describe, expect, it } from 'vitest';
import { formatAccountId } from './ProfileVisual';

describe('formatAccountId', () => {
  it('groups a 12-digit account ID into readable blocks', () => {
    expect(formatAccountId('123456789012', false)).toBe('1234 5678 9012');
  });

  it('leaves an account alias untouched', () => {
    expect(formatAccountId('acme-production', false)).toBe('acme-production');
  });

  it('masks all but the last four digits when hiding is enabled', () => {
    expect(formatAccountId('123456789012', true)).toBe('•••• 9012');
  });

  it('does not leak the leading digits of a masked account ID', () => {
    expect(formatAccountId('123456789012', true)).not.toContain('12345678');
  });

  it('masks an alias as well', () => {
    expect(formatAccountId('acme-production', true)).toBe('•••• tion');
  });

  it('handles a short value without throwing', () => {
    expect(formatAccountId('abc', true)).toBe('•••• abc');
  });
});
