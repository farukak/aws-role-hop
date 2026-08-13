import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import {
  AppStateError,
  addProfile,
  createProfileList,
  deleteProfileList,
  editProfile,
  ensureAppState,
  importProfiles,
  importProfilesToNewList,
  loadAppState,
  markProfileUsed,
  removeProfile,
  renameProfileList,
  resetAppState,
  restoreAppState,
  saveAppState,
  setDefaultProfileList,
  toggleFavorite,
  updateSettings,
  watchAppState,
} from './app-state';
import {
  PROFILE_LIMIT,
  createDefaultState,
  createProfile,
  profileDraftSchema,
  type ProfileDraft,
} from '../domain/profile';

const STORAGE_KEY = 'rolehop.appState';
const CORRUPT_STORAGE_KEY = 'rolehop.appState.corrupt';

function draft(overrides: Record<string, unknown> = {}): ProfileDraft {
  return profileDraftSchema.parse({
    type: 'role',
    name: 'Production read-only',
    accountId: '123456789012',
    roleName: 'team/ReadOnlyRole',
    partition: 'aws',
    environment: 'production',
    favorite: false,
    tags: [],
    ...overrides,
  });
}

async function readRaw(): Promise<unknown> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY];
}

async function readCorrupt(): Promise<unknown> {
  const stored = await browser.storage.local.get(CORRUPT_STORAGE_KEY);
  return stored[CORRUPT_STORAGE_KEY];
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('ensureAppState', () => {
  it('seeds and persists the default state on first run', async () => {
    const state = await ensureAppState();
    expect(state).toEqual(createDefaultState());
    expect(await readRaw()).toEqual(createDefaultState());
  });

  it('returns the stored state without rewriting it', async () => {
    const seeded = {
      ...createDefaultState(),
      settings: { ...createDefaultState().settings, hideAccountIds: true },
    };
    await browser.storage.local.set({ [STORAGE_KEY]: seeded });
    expect((await ensureAppState()).settings.hideAccountIds).toBe(true);
  });

  it('migrates version 1 data and persists the selected system language', async () => {
    const current = createDefaultState();
    const legacySettings = {
      theme: current.settings.theme,
      openBehavior: current.settings.openBehavior,
      confirmProduction: current.settings.confirmProduction,
      hideAccountIds: current.settings.hideAccountIds,
    };
    const legacy = { ...current, version: 1, settings: legacySettings };
    await browser.storage.local.set({ [STORAGE_KEY]: legacy });

    const migrated = await ensureAppState();
    expect(migrated.version).toBe(4);
    expect(migrated.settings.language).toBe('system');
    // Nothing was stored yet, so the first-run question is still owed.
    expect(migrated.settings.accessMode).toBe('unset');
    expect(await readRaw()).toEqual(migrated);
  });

  it('serializes migration persistence with concurrent mutations', async () => {
    const current = createDefaultState();
    const legacy = {
      ...current,
      version: 2,
      profiles: [],
      settings: current.settings,
    };
    await browser.storage.local.set({ [STORAGE_KEY]: legacy });

    const originalSet = browser.storage.local.set.bind(browser.storage.local);
    let setCalls = 0;
    let releaseFirstSet!: () => void;
    let markThirdSetStarted!: () => void;
    const thirdSetStarted = new Promise<void>((resolve) => {
      markThirdSetStarted = resolve;
    });
    const firstSetStarted = new Promise<void>((resolve) => {
      const delayedSet = async (values: Parameters<typeof browser.storage.local.set>[0]) => {
        setCalls += 1;
        if (setCalls === 3) markThirdSetStarted();
        if (setCalls === 1) {
          resolve();
          await new Promise<void>((release) => {
            releaseFirstSet = release;
          });
        }
        await originalSet(values);
      };
      vi.spyOn(browser.storage.local, 'set').mockImplementation(
        (values) => delayedSet(values) as never,
      );
    });

    const migration = ensureAppState();
    await firstSetStarted;
    const mutation = addProfile(draft({ name: 'Concurrent', roleName: 'ConcurrentRole' }));
    await Promise.race([thirdSetStarted, new Promise<void>((resolve) => setTimeout(resolve, 25))]);
    releaseFirstSet();

    await Promise.all([migration, mutation]);
    expect((await loadAppState()).profiles.map(({ name }) => name)).toEqual(['Concurrent']);
  });

  it('quarantines corrupted storage instead of silently resetting it', async () => {
    const corrupt = { version: 99, profiles: 'nope' };
    await browser.storage.local.set({ [STORAGE_KEY]: corrupt });
    await expect(ensureAppState()).rejects.toBeInstanceOf(AppStateError);
    expect(await readCorrupt()).toEqual(corrupt);
    expect(await readRaw()).toEqual(corrupt);
  });

  it('turns browser read failures into an actionable AppStateError', async () => {
    vi.spyOn(browser.storage.local, 'get').mockRejectedValueOnce(new Error('storage offline'));
    await expect(ensureAppState()).rejects.toThrow(/could not read local data/i);
  });
});

describe('addProfile', () => {
  it('adds a profile', async () => {
    const state = await addProfile(draft());
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]?.name).toBe('Production read-only');
    expect(state.profiles[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('persists a manually selected palette color', async () => {
    const state = await addProfile(draft({ colorId: 'lilac' }));
    expect(state.profiles[0]?.colorId).toBe('lilac');
  });

  it('serializes concurrent writes so neither profile is lost', async () => {
    await Promise.all([
      addProfile(draft({ name: 'First', roleName: 'FirstRole' })),
      addProfile(draft({ name: 'Second', roleName: 'SecondRole' })),
    ]);
    expect((await loadAppState()).profiles.map(({ name }) => name).sort()).toEqual([
      'First',
      'Second',
    ]);
  });

  it('rejects a duplicate account and role combination', async () => {
    await addProfile(draft());
    await expect(addProfile(draft({ name: 'Different label' }))).rejects.toThrow(/already exists/i);
  });

  it('treats a differing case as the same identity', async () => {
    await addProfile(draft({ roleName: 'team/ReadOnlyRole' }));
    await expect(addProfile(draft({ roleName: 'TEAM/readonlyrole' }))).rejects.toBeInstanceOf(
      AppStateError,
    );
  });

  it('allows the same role in a different partition', async () => {
    await addProfile(draft());
    const state = await addProfile(draft({ partition: 'aws-cn', name: 'China' }));
    expect(state.profiles).toHaveLength(2);
  });

  it('enforces the profile limit', async () => {
    const profiles = Array.from({ length: PROFILE_LIMIT }, (_unused, index) =>
      createProfile(draft({ name: `Profile ${index}`, roleName: `Role${index}` })),
    );
    await saveAppState({ ...createDefaultState(), profiles });
    await expect(addProfile(draft({ roleName: 'OneTooMany' }))).rejects.toThrow(/limit/i);
  });

  it('does not persist anything when validation fails', async () => {
    await addProfile(draft());
    const before = await readRaw();
    await expect(addProfile(draft())).rejects.toBeInstanceOf(AppStateError);
    expect(await readRaw()).toEqual(before);
  });

  it('rejects malformed runtime drafts with a field-level AppStateError', async () => {
    const invalid = { ...draft(), accountId: '1234567890123' };
    await expect(addProfile(invalid)).rejects.toThrow(/exactly 12 digits/i);
    expect(await readRaw()).toBeUndefined();
  });
});

describe('editProfile', () => {
  it('updates the profile while keeping its identity fields', async () => {
    const created = (await addProfile(draft())).profiles[0]!;
    const state = await editProfile(created.id, draft({ name: 'Renamed' }));
    const updated = state.profiles[0]!;

    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.name).toBe('Renamed');
  });

  it('updates a profile to a manually selected palette color', async () => {
    const created = (await addProfile(draft())).profiles[0]!;
    const state = await editProfile(created.id, draft({ colorId: 'teal' }));
    expect(state.profiles[0]?.colorId).toBe('teal');
  });

  it('fails for an unknown id', async () => {
    await ensureAppState();
    await expect(editProfile(crypto.randomUUID(), draft())).rejects.toThrow(/no longer exists/i);
  });

  it('allows saving a profile without changing its account and role', async () => {
    const created = (await addProfile(draft())).profiles[0]!;
    await expect(editProfile(created.id, draft({ name: 'Same identity' }))).resolves.toBeDefined();
  });

  it('rejects an edit that collides with another profile', async () => {
    const first = (await addProfile(draft())).profiles[0]!;
    await addProfile(draft({ roleName: 'Other', name: 'Other' }));
    await expect(editProfile(first.id, draft({ roleName: 'Other' }))).rejects.toBeInstanceOf(
      AppStateError,
    );
  });
});

describe('removeProfile, toggleFavorite and markProfileUsed', () => {
  it('removes a profile', async () => {
    const created = (await addProfile(draft())).profiles[0]!;
    expect((await removeProfile(created.id)).profiles).toHaveLength(0);
  });

  it('rejects stale actions for an unknown profile', async () => {
    await addProfile(draft());
    const missingId = crypto.randomUUID();
    await expect(removeProfile(missingId)).rejects.toThrow(/no longer exists/i);
    await expect(toggleFavorite(missingId)).rejects.toThrow(/no longer exists/i);
    await expect(markProfileUsed(missingId)).rejects.toThrow(/no longer exists/i);
  });

  it('toggles the favorite flag both ways', async () => {
    const created = (await addProfile(draft())).profiles[0]!;
    expect((await toggleFavorite(created.id)).profiles[0]?.favorite).toBe(true);
    expect((await toggleFavorite(created.id)).profiles[0]?.favorite).toBe(false);
  });

  it('records the last-used timestamp', async () => {
    const created = (await addProfile(draft())).profiles[0]!;
    expect(created.lastUsedAt).toBeUndefined();
    const used = (await markProfileUsed(created.id)).profiles[0]!;
    expect(used.lastUsedAt).toBeDefined();
    expect(used.updatedAt).toBe(used.lastUsedAt);
  });
});

describe('profile lists', () => {
  it('creates, renames, selects as default, and deletes a list with its profiles', async () => {
    const created = await createProfileList('Customer A');
    const listId = created.activeProfileListId;
    expect(created.profileLists.at(-1)?.name).toBe('Customer A');

    await addProfile(draft(), listId);
    expect((await renameProfileList(listId, 'Customer Alpha')).profileLists.at(-1)?.name).toBe(
      'Customer Alpha',
    );
    expect((await setDefaultProfileList(listId)).defaultProfileListId).toBe(listId);

    const deleted = await deleteProfileList(listId);
    expect(deleted.profileLists).toHaveLength(1);
    expect(deleted.profiles).toHaveLength(0);
    expect(deleted.defaultProfileListId).toBe(deleted.profileLists[0]?.id);
  });

  it('allows the same account and role in different lists', async () => {
    await addProfile(draft());
    const second = await createProfileList('Customer B');
    await expect(addProfile(draft(), second.activeProfileListId)).resolves.toBeDefined();
    expect((await loadAppState()).profiles).toHaveLength(2);
  });

  it('assigns different pastel colors while the palette has capacity', async () => {
    await addProfile(draft());
    await addProfile(draft({ name: 'Auditor', roleName: 'Auditor' }));
    const colors = (await loadAppState()).profiles.map(({ colorId }) => colorId);
    expect(new Set(colors).size).toBe(2);
  });

  it('does not delete the only profile list', async () => {
    await ensureAppState();
    const { defaultProfileListId } = await loadAppState();
    await expect(deleteProfileList(defaultProfileListId)).rejects.toThrow(/only profile list/i);
  });

  it('rejects list names that differ only by deterministic casing', async () => {
    await createProfileList('I');
    await expect(createProfileList('i')).rejects.toThrow(/already exists/i);
  });

  it('returns an AppStateError for an invalid list name', async () => {
    await expect(createProfileList('Bad\nName')).rejects.toBeInstanceOf(AppStateError);
  });
});

describe('updateSettings', () => {
  it('merges a partial patch without resetting existing preferences', async () => {
    await updateSettings({ theme: 'dark', hideAccountIds: true });
    const state = await updateSettings({ language: 'tr' });
    expect(state.settings).toMatchObject({
      theme: 'dark',
      language: 'tr',
      hideAccountIds: true,
      confirmProduction: true,
    });
  });

  it('turns browser write failures into an actionable AppStateError', async () => {
    await ensureAppState();
    vi.spyOn(browser.storage.local, 'set').mockRejectedValueOnce(new Error('QUOTA_BYTES exceeded'));
    await expect(updateSettings({ theme: 'dark' })).rejects.toThrow(/storage may be full/i);
  });

  it('rejects an invalid value', async () => {
    await ensureAppState();
    await expect(updateSettings({ theme: 'sepia' as never })).rejects.toThrow();
  });
});

describe('importProfiles', () => {
  it('adds new profiles and counts skipped duplicates', async () => {
    await addProfile(draft());
    const summary = await importProfiles([
      draft(),
      draft({ roleName: 'Auditor', name: 'Auditor' }),
      draft({ roleName: 'Auditor', name: 'Auditor duplicate in the same batch' }),
    ]);

    expect(summary.added).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(summary.state.profiles).toHaveLength(2);
  });

  it('is a no-op for an empty list', async () => {
    await ensureAppState();
    const summary = await importProfiles([]);
    expect(summary).toMatchObject({ added: 0, skipped: 0 });
  });

  it('rejects a batch containing a malformed runtime draft before writing', async () => {
    const invalid = { ...draft(), accountId: '12345678901' };
    await expect(importProfiles([draft(), invalid])).rejects.toThrow(/exactly 12 digits/i);
    expect(await readRaw()).toBeUndefined();
  });

  it('refuses an import that would exceed the profile limit', async () => {
    const profiles = Array.from({ length: PROFILE_LIMIT }, (_unused, index) =>
      createProfile(draft({ name: `Profile ${index}`, roleName: `Role${index}` })),
    );
    await saveAppState({ ...createDefaultState(), profiles });
    await expect(importProfiles([draft({ roleName: 'Extra' })])).rejects.toThrow(/limit/i);
  });
});

describe('importProfilesToNewList', () => {
  it('creates, activates, and populates the destination in one state update', async () => {
    const summary = await importProfilesToNewList(
      [draft(), draft({ name: 'Auditor', roleName: 'Auditor' })],
      'Imported team',
    );

    expect(summary).toMatchObject({ added: 2, skipped: 0 });
    expect(summary.state.profileLists).toContainEqual({
      id: summary.listId,
      name: 'Imported team',
    });
    expect(summary.state.activeProfileListId).toBe(summary.listId);
    expect(summary.state.profiles).toHaveLength(2);
    expect(summary.state.profiles.every((profile) => profile.listId === summary.listId)).toBe(true);
    expect(await readRaw()).toEqual(summary.state);
  });

  it('does not leave an empty list when the list name is a duplicate', async () => {
    await createProfileList('Imported team');
    const before = await readRaw();

    await expect(importProfilesToNewList([draft()], ' imported TEAM ')).rejects.toThrow(
      /already exists/i,
    );
    expect(await readRaw()).toEqual(before);
  });

  it('does not change lists or profiles when a draft fails validation', async () => {
    await ensureAppState();
    const before = await readRaw();

    await expect(
      importProfilesToNewList([{ ...draft(), accountId: '123' }], 'Invalid import'),
    ).rejects.toThrow(/exactly 12 digits/i);
    expect(await readRaw()).toEqual(before);
  });

  it('refuses to create a list for an empty import', async () => {
    await ensureAppState();
    const before = await readRaw();

    await expect(importProfilesToNewList([], 'Empty import')).rejects.toThrow(
      /at least one valid profile/i,
    );
    expect(await readRaw()).toEqual(before);
  });
});

describe('restoreAppState and resetAppState', () => {
  it('restores a valid backup', async () => {
    const backup = { ...createDefaultState(), profiles: [createProfile(draft())] };
    const restored = await restoreAppState(backup);
    expect(restored.profiles).toHaveLength(1);
    expect(await readRaw()).toEqual(restored);
  });

  it('restores a version 1 backup through the migration path', async () => {
    const current = createDefaultState();
    const legacySettings = {
      theme: current.settings.theme,
      openBehavior: current.settings.openBehavior,
      confirmProduction: current.settings.confirmProduction,
      hideAccountIds: current.settings.hideAccountIds,
    };
    const restored = await restoreAppState({ ...current, version: 1, settings: legacySettings });
    expect(restored).toMatchObject({
      version: 4,
      settings: { language: 'system', accessMode: 'unset' },
    });
  });

  it('rejects an invalid backup without touching storage', async () => {
    await addProfile(draft());
    const before = await readRaw();
    await expect(restoreAppState({ version: 3, profiles: [] })).rejects.toBeInstanceOf(
      AppStateError,
    );
    expect(await readRaw()).toEqual(before);
  });

  it('rejects a backup that smuggles in extra keys', async () => {
    await expect(
      restoreAppState({ ...createDefaultState(), remoteSyncUrl: 'https://example.test' }),
    ).rejects.toBeInstanceOf(AppStateError);
  });

  it('rejects a backup containing duplicate profile identities', async () => {
    const profile = createProfile(draft());
    await expect(
      restoreAppState({
        ...createDefaultState(),
        profiles: [profile, { ...profile, id: crypto.randomUUID(), name: 'Duplicate' }],
      }),
    ).rejects.toBeInstanceOf(AppStateError);
  });

  it('resets to the default state', async () => {
    await addProfile(draft());
    expect((await resetAppState()).profiles).toHaveLength(0);
    expect(await loadAppState()).toEqual(createDefaultState());
  });
});

describe('watchAppState', () => {
  it('notifies listeners on a valid local change and stops after unsubscribing', async () => {
    const listener = vi.fn();
    const unwatch = watchAppState(listener);

    await saveAppState({
      ...createDefaultState(),
      settings: { ...createDefaultState().settings, theme: 'dark' },
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ settings: { theme: 'dark' } });

    unwatch();
    await saveAppState(createDefaultState());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores changes that fail validation', async () => {
    const listener = vi.fn();
    watchAppState(listener);
    await browser.storage.local.set({ [STORAGE_KEY]: { version: 99 } });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('access mode migration', () => {
  const LIST_ID = '00000000-0000-4000-8000-000000000001';
  const ISO = '2026-01-01T00:00:00.000Z';

  function storedProfile(overrides: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = {
      type: 'role',
      name: 'Core Production',
      accountId: '024314596708',
      roleName: 'OrganizationAccountAccessRole',
      partition: 'aws',
      environment: 'production',
      favorite: false,
      tags: [],
      id: crypto.randomUUID(),
      listId: LIST_ID,
      colorId: 'rose',
      createdAt: ISO,
      updatedAt: ISO,
      ...overrides,
    };
    // An Identity Center profile carries no partition, and the schema is strict
    // about unknown keys, so drop anything an override cleared.
    return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
  }

  /** A stored version 3 state, which is what an installed 0.1.3 holds. */
  async function seedVersion3(profiles: Record<string, unknown>[]): Promise<void> {
    const current = createDefaultState();
    const legacySettings: Record<string, unknown> = { ...current.settings };
    delete legacySettings.accessMode;
    await browser.storage.local.set({
      [STORAGE_KEY]: { ...current, version: 3, profiles, settings: legacySettings },
    });
  }

  it('keeps an IAM user in IAM mode', async () => {
    await seedVersion3([storedProfile({})]);
    const migrated = await ensureAppState();
    expect(migrated.version).toBe(4);
    expect(migrated.settings.accessMode).toBe('iam');
    expect(migrated.profiles).toHaveLength(1);
  });

  it('puts an Identity Center-only installation into Identity Center mode', async () => {
    await seedVersion3([
      storedProfile({
        type: 'sso',
        name: 'Platform',
        roleName: 'PlatformAccess',
        portalUrl: 'https://example.awsapps.com/start',
        partition: undefined,
      }),
    ]);
    const migrated = await ensureAppState();
    expect(migrated.settings.accessMode).toBe('sso');
  });

  it('prefers IAM when both kinds of profile are stored', async () => {
    await seedVersion3([
      storedProfile({}),
      storedProfile({
        type: 'sso',
        name: 'Platform',
        accountId: '891377166946',
        roleName: 'PlatformAccess',
        portalUrl: 'https://example.awsapps.com/start',
        partition: undefined,
      }),
    ]);
    expect((await ensureAppState()).settings.accessMode).toBe('iam');
  });

  it('still asks a user who has no profiles yet', async () => {
    await seedVersion3([]);
    expect((await ensureAppState()).settings.accessMode).toBe('unset');
  });
});
