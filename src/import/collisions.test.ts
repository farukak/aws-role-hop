import { describe, expect, it } from 'vitest';
import { findImportCollisions } from './collisions';
import { profileSchema, type Profile, type ProfileDraft } from '../domain/profile';

const ISO = '2026-01-01T00:00:00.000Z';
const LIST_ID = '00000000-0000-4000-8000-000000000001';

function draft(overrides: Record<string, unknown> = {}): ProfileDraft {
  return {
    type: 'role',
    name: 'Core Production',
    accountId: '024314596708',
    roleName: 'OrganizationAccountAccessRole',
    partition: 'aws',
    environment: 'production',
    favorite: false,
    tags: [],
    ...overrides,
  };
}

function existing(overrides: Record<string, unknown> = {}): Profile {
  return profileSchema.parse({
    ...draft(overrides),
    id: crypto.randomUUID(),
    listId: LIST_ID,
    colorId: 'rose',
    createdAt: ISO,
    updatedAt: ISO,
  });
}

describe('findImportCollisions', () => {
  it('reports nothing for a clean import', () => {
    expect(findImportCollisions([draft()], [])).toEqual({
      duplicateTargets: 0,
      duplicateNames: [],
    });
  });

  it('counts profiles whose sign-in target already exists', () => {
    const collisions = findImportCollisions([draft()], [existing()]);
    expect(collisions.duplicateTargets).toBe(1);
    // The skipped profile never lands, so its name is not a clash.
    expect(collisions.duplicateNames).toEqual([]);
  });

  it('names a profile that reuses an existing name on a different account', () => {
    const collisions = findImportCollisions([draft({ accountId: '891377166946' })], [existing()]);
    expect(collisions).toEqual({ duplicateTargets: 0, duplicateNames: ['Core Production'] });
  });

  it('names a profile repeated within the same paste, case-insensitively', () => {
    const collisions = findImportCollisions(
      [
        draft(),
        draft({ accountId: '315351460784', name: 'core production' }),
        draft({ accountId: '111111111111', name: 'Core Production' }),
      ],
      [],
    );
    expect(collisions.duplicateTargets).toBe(0);
    expect(collisions.duplicateNames).toEqual(['core production', 'Core Production']);
  });

  it('treats a partition change as a separate target but the same name', () => {
    const collisions = findImportCollisions([draft({ partition: 'aws-cn' })], [existing()]);
    expect(collisions).toEqual({ duplicateTargets: 0, duplicateNames: ['Core Production'] });
  });
});
