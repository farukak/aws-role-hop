import { browser } from 'wxt/browser';
import { chooseProfileColorId } from '../domain/colors';
import {
  DEFAULT_IAM_LIST_NAME,
  DEFAULT_PROFILE_LIST_ID,
  DEFAULT_SSO_LIST_NAME,
  DEFAULT_SSO_PROFILE_LIST_ID,
  PROFILE_COLOR_IDS,
  PROFILE_LIMIT,
  PROFILE_LIST_LIMIT,
  appStateSchema,
  createDefaultState,
  createProfile,
  profileDraftSchema,
  profileIdentity,
  profileListSchema,
  settingsSchema,
  updateProfileRecord,
  type AppSettings,
  type AppState,
  type ProfileDraft,
} from '../domain/profile';

const STORAGE_KEY = 'rolehop.appState';
const CORRUPT_STORAGE_KEY = 'rolehop.appState.corrupt';
let mutationQueue: Promise<void> = Promise.resolve();

export class AppStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppStateError';
  }
}

async function readStoredValue(): Promise<unknown> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY];
  } catch {
    throw new AppStateError(
      'Could not read local data. Browser storage may be temporarily unavailable.',
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function migrateToProfileLists(migrated: Record<string, unknown>): Record<string, unknown> {
  const legacyProfiles: unknown = migrated.profiles;
  const profiles = Array.isArray(legacyProfiles)
    ? legacyProfiles.map((profile: unknown, index) =>
        isRecord(profile)
          ? {
              ...profile,
              listId: DEFAULT_PROFILE_LIST_ID,
              colorId: PROFILE_COLOR_IDS[index % PROFILE_COLOR_IDS.length],
            }
          : profile,
      )
    : legacyProfiles;

  return {
    ...migrated,
    version: 3,
    profiles,
    profileLists: [{ id: DEFAULT_PROFILE_LIST_ID, name: 'Default' }],
    activeProfileListId: DEFAULT_PROFILE_LIST_ID,
    defaultProfileListId: DEFAULT_PROFILE_LIST_ID,
  };
}

/**
 * IAM and SSO get their own default list. The list everyone started with keeps its
 * id and its IAM profiles under a clearer name, and any Identity Center profiles
 * sitting in it move to the new SSO list rather than staying mixed in.
 */
function migrateToModeLists(migrated: Record<string, unknown>): Record<string, unknown> {
  const lists = Array.isArray(migrated.profileLists)
    ? migrated.profileLists
        .filter(isRecord)
        .map((list) =>
          list.id === DEFAULT_PROFILE_LIST_ID && list.name === 'Default'
            ? { ...list, name: DEFAULT_IAM_LIST_NAME }
            : list,
        )
    : [];

  const hasSsoList = lists.some((list) => list.id === DEFAULT_SSO_PROFILE_LIST_ID);
  const profileLists = hasSsoList
    ? lists
    : [...lists, { id: DEFAULT_SSO_PROFILE_LIST_ID, name: DEFAULT_SSO_LIST_NAME }];

  const storedProfiles: unknown = migrated.profiles;
  const profiles = Array.isArray(storedProfiles)
    ? (storedProfiles as unknown[]).map((profile: unknown) =>
        isRecord(profile) && profile.type === 'sso' && profile.listId === DEFAULT_PROFILE_LIST_ID
          ? { ...profile, listId: DEFAULT_SSO_PROFILE_LIST_ID }
          : profile,
      )
    : storedProfiles;

  const settings = isRecord(migrated.settings) ? migrated.settings : {};
  const activeProfileListId =
    settings.accessMode === 'sso' ? DEFAULT_SSO_PROFILE_LIST_ID : migrated.activeProfileListId;

  return { ...migrated, version: 5, profileLists, profiles, activeProfileListId };
}

/** Each step is applied in order so any stored version reaches the current one. */
function migrateStoredValue(value: unknown): unknown {
  if (!isRecord(value)) return value;

  let migrated: Record<string, unknown> = value;
  if (migrated.version === 1 && isRecord(migrated.settings)) {
    migrated = {
      ...migrated,
      version: 2,
      settings: { ...migrated.settings, language: 'system' },
    };
  }

  if (migrated.version === 2) migrated = migrateToProfileLists(migrated);

  if (migrated.version === 3 && isRecord(migrated.settings)) {
    migrated = {
      ...migrated,
      version: 4,
      settings: {
        ...migrated.settings,
        // Opening a profile is now a single click everywhere. The confirmation is
        // still available in preferences for anyone who wants it back.
        confirmProduction: false,
      },
    };
  }

  if (migrated.version === 4 && isRecord(migrated.settings)) {
    migrated = migrateToModeLists(migrated);
  }

  // Keep this last: every step above has to be able to reach it.
  if (migrated.version === 5 && isRecord(migrated.settings)) {
    const settings: Record<string, unknown> = { ...migrated.settings };
    delete settings.accessMode;
    migrated = { ...migrated, version: 6, settings };
  }

  return migrated;
}

async function persistAppState(state: AppState): Promise<void> {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: state });
  } catch {
    throw new AppStateError(
      'Could not save local data. Browser storage may be full or temporarily unavailable.',
    );
  }
}

function runSerialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function parseAppState(value: unknown, message: string): AppState {
  const result = appStateSchema.safeParse(value);
  if (!result.success) throw new AppStateError(message);
  return result.data;
}

function parseProfileDraft(value: unknown): ProfileDraft {
  const result = profileDraftSchema.safeParse(value);
  if (!result.success) {
    throw new AppStateError(result.error.issues[0]?.message ?? 'Profile data is invalid.');
  }
  return result.data;
}

function parseProfileList(id: string, name: string) {
  const result = profileListSchema.safeParse({ id, name: normalizeListName(name) });
  if (!result.success) {
    throw new AppStateError(result.error.issues[0]?.message ?? 'Profile list data is invalid.');
  }
  return result.data;
}

async function ensureAppStateUnlocked(): Promise<AppState> {
  const stored = await readStoredValue();
  if (stored === undefined) {
    const initialState = createDefaultState();
    await persistAppState(initialState);
    return initialState;
  }

  const migrated = migrateStoredValue(stored);
  const result = appStateSchema.safeParse(migrated);
  if (!result.success) {
    try {
      await browser.storage.local.set({ [CORRUPT_STORAGE_KEY]: stored });
    } catch {
      // Preserve the original validation error even when the browser cannot
      // quarantine the raw value because storage itself is unavailable.
    }
    throw new AppStateError(
      'Stored data is invalid. A recovery copy was kept locally; restore a backup or reset from settings.',
    );
  }

  if (migrated !== stored) await persistAppState(result.data);
  return result.data;
}

export function ensureAppState(): Promise<AppState> {
  return runSerialized(ensureAppStateUnlocked);
}

export async function loadAppState(): Promise<AppState> {
  return ensureAppState();
}

export async function saveAppState(state: AppState): Promise<void> {
  const validated = parseAppState(state, 'Local data is invalid and could not be saved.');
  await runSerialized(() => persistAppState(validated));
}

export async function restoreAppState(value: unknown): Promise<AppState> {
  const result = appStateSchema.safeParse(migrateStoredValue(value));
  if (!result.success) {
    throw new AppStateError(
      'Backup is invalid or was created by an unsupported AWS Role Hop version.',
    );
  }
  await runSerialized(() => persistAppState(result.data));
  return result.data;
}

async function updateAppState(mutator: (state: AppState) => AppState): Promise<AppState> {
  return runSerialized(async () => {
    const current = await ensureAppStateUnlocked();
    const next = parseAppState(
      mutator(current),
      'The requested change produced invalid local data and was not saved.',
    );
    await persistAppState(next);
    return next;
  });
}

function requireProfileList(state: AppState, listId: string): void {
  if (!state.profileLists.some(({ id }) => id === listId)) {
    throw new AppStateError('Profile list no longer exists.');
  }
}

function requireProfile(state: AppState, id: string): void {
  if (!state.profiles.some((profile) => profile.id === id)) {
    throw new AppStateError('Profile no longer exists.');
  }
}

function ensureUniqueProfile(
  profiles: AppState['profiles'],
  draft: ProfileDraft,
  listId: string,
  ignoredId?: string,
): void {
  const identity = profileIdentity(draft);
  if (
    profiles.some(
      (profile) =>
        profile.listId === listId &&
        profile.id !== ignoredId &&
        profileIdentity(profile) === identity,
    )
  ) {
    throw new AppStateError('This account and role combination already exists in this list.');
  }
}

export async function addProfile(draft: ProfileDraft, listId?: string): Promise<AppState> {
  const validatedDraft = parseProfileDraft(draft);
  return updateAppState((state) => {
    const targetListId = listId ?? state.activeProfileListId;
    requireProfileList(state, targetListId);
    if (state.profiles.length >= PROFILE_LIMIT) {
      throw new AppStateError(`Profile limit reached (${PROFILE_LIMIT}).`);
    }
    ensureUniqueProfile(state.profiles, validatedDraft, targetListId);
    const listProfiles = state.profiles.filter((profile) => profile.listId === targetListId);
    const colorId = validatedDraft.colorId ?? chooseProfileColorId(validatedDraft, listProfiles);
    return {
      ...state,
      profiles: [...state.profiles, createProfile(validatedDraft, targetListId, colorId)],
    };
  });
}

export async function editProfile(id: string, draft: ProfileDraft): Promise<AppState> {
  const validatedDraft = parseProfileDraft(draft);
  return updateAppState((state) => {
    const existing = state.profiles.find((profile) => profile.id === id);
    if (!existing) throw new AppStateError('Profile no longer exists.');
    ensureUniqueProfile(state.profiles, validatedDraft, existing.listId, id);
    const listProfiles = state.profiles.filter(
      (profile) => profile.listId === existing.listId && profile.id !== id,
    );
    const colorId = validatedDraft.colorId ?? chooseProfileColorId(validatedDraft, listProfiles);
    return {
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === id ? updateProfileRecord(existing, validatedDraft, colorId) : profile,
      ),
    };
  });
}

export async function removeProfile(id: string): Promise<AppState> {
  return updateAppState((state) => {
    requireProfile(state, id);
    return {
      ...state,
      profiles: state.profiles.filter((profile) => profile.id !== id),
    };
  });
}

export async function toggleFavorite(id: string): Promise<AppState> {
  return updateAppState((state) => {
    requireProfile(state, id);
    return {
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === id
          ? { ...profile, favorite: !profile.favorite, updatedAt: new Date().toISOString() }
          : profile,
      ),
    };
  });
}

export async function markProfileUsed(id: string): Promise<AppState> {
  const now = new Date().toISOString();
  return updateAppState((state) => {
    requireProfile(state, id);
    return {
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === id ? { ...profile, lastUsedAt: now, updatedAt: now } : profile,
      ),
    };
  });
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppState> {
  return updateAppState((state) => {
    const result = settingsSchema.safeParse({ ...state.settings, ...patch });
    if (!result.success) {
      throw new AppStateError(result.error.issues[0]?.message ?? 'Preference value is invalid.');
    }
    return { ...state, settings: result.data };
  });
}

function normalizeListName(name: string): string {
  return name.trim();
}

function ensureUniqueListName(state: AppState, name: string, ignoredId?: string): void {
  const normalized = normalizeListName(name).toLowerCase();
  if (
    state.profileLists.some(
      (list) => list.id !== ignoredId && list.name.toLowerCase() === normalized,
    )
  ) {
    throw new AppStateError('A profile list with this name already exists.');
  }
}

export async function createProfileList(name: string): Promise<AppState> {
  return updateAppState((state) => {
    if (state.profileLists.length >= PROFILE_LIST_LIMIT) {
      throw new AppStateError(`Profile list limit reached (${PROFILE_LIST_LIMIT}).`);
    }
    ensureUniqueListName(state, name);
    const list = parseProfileList(crypto.randomUUID(), name);
    return {
      ...state,
      profileLists: [...state.profileLists, list],
      activeProfileListId: list.id,
    };
  });
}

export async function renameProfileList(id: string, name: string): Promise<AppState> {
  return updateAppState((state) => {
    requireProfileList(state, id);
    ensureUniqueListName(state, name, id);
    const next = parseProfileList(id, name);
    return {
      ...state,
      profileLists: state.profileLists.map((list) => (list.id === id ? next : list)),
    };
  });
}

export async function setActiveProfileList(id: string): Promise<AppState> {
  return updateAppState((state) => {
    requireProfileList(state, id);
    return { ...state, activeProfileListId: id };
  });
}

export async function setDefaultProfileList(id: string): Promise<AppState> {
  return updateAppState((state) => {
    requireProfileList(state, id);
    return { ...state, defaultProfileListId: id };
  });
}

export async function deleteProfileList(id: string): Promise<AppState> {
  return updateAppState((state) => {
    requireProfileList(state, id);
    if (state.profileLists.length === 1) {
      throw new AppStateError('The only profile list cannot be deleted.');
    }
    const profileLists = state.profileLists.filter((list) => list.id !== id);
    const fallbackId =
      state.defaultProfileListId === id ? profileLists[0]!.id : state.defaultProfileListId;
    return {
      ...state,
      profiles: state.profiles.filter((profile) => profile.listId !== id),
      profileLists,
      defaultProfileListId: fallbackId,
      activeProfileListId:
        state.activeProfileListId === id ? fallbackId : state.activeProfileListId,
    };
  });
}

export interface ImportSummary {
  state: AppState;
  added: number;
  skipped: number;
  listId: string;
}

function addImportedProfiles(
  current: AppState,
  validatedDrafts: ProfileDraft[],
  targetListId: string,
): { profiles: AppState['profiles']; added: number; skipped: number } {
  const profiles = [...current.profiles];
  const listProfiles = profiles.filter((profile) => profile.listId === targetListId);
  const identities = new Set(listProfiles.map(profileIdentity));
  let added = 0;
  let skipped = 0;

  for (const draft of validatedDrafts) {
    const identity = profileIdentity(draft);
    if (identities.has(identity)) {
      skipped += 1;
      continue;
    }
    if (profiles.length >= PROFILE_LIMIT) {
      throw new AppStateError(`Import would exceed the ${PROFILE_LIMIT}-profile limit.`);
    }
    const colorId = draft.colorId ?? chooseProfileColorId(draft, listProfiles);
    const profile = createProfile(draft, targetListId, colorId);
    profiles.push(profile);
    listProfiles.push(profile);
    identities.add(identity);
    added += 1;
  }

  return { profiles, added, skipped };
}

/**
 * Identity Center profiles always land in the SSO list, whatever the chosen
 * destination is, so a pasted config that mixes both kinds does not mix the lists.
 */
export async function importProfiles(
  drafts: ProfileDraft[],
  listId?: string,
): Promise<ImportSummary> {
  const validatedDrafts = drafts.map((draft) => parseProfileDraft(draft));
  const roleDrafts = validatedDrafts.filter((draft) => draft.type !== 'sso');
  const ssoDrafts = validatedDrafts.filter((draft) => draft.type === 'sso');
  let result = { added: 0, skipped: 0 };
  let targetListId = '';

  const state = await updateAppState((current) => {
    targetListId = listId ?? current.activeProfileListId;
    requireProfileList(current, targetListId);

    let next = current;
    if (
      ssoDrafts.length > 0 &&
      !next.profileLists.some(({ id }) => id === DEFAULT_SSO_PROFILE_LIST_ID)
    ) {
      next = {
        ...next,
        profileLists: [
          ...next.profileLists,
          { id: DEFAULT_SSO_PROFILE_LIST_ID, name: DEFAULT_SSO_LIST_NAME },
        ],
      };
    }

    let added = 0;
    let skipped = 0;
    for (const [drafts, destination] of [
      [roleDrafts, targetListId],
      [ssoDrafts, DEFAULT_SSO_PROFILE_LIST_ID],
    ] as const) {
      if (drafts.length === 0) continue;
      const imported = addImportedProfiles(next, drafts, destination);
      next = { ...next, profiles: imported.profiles };
      added += imported.added;
      skipped += imported.skipped;
    }

    result = { added, skipped };
    return next;
  });

  return { state, ...result, listId: targetListId };
}

export async function importProfilesToNewList(
  drafts: ProfileDraft[],
  listName: string,
): Promise<ImportSummary> {
  const validatedDrafts = drafts.map((draft) => parseProfileDraft(draft));
  if (validatedDrafts.length === 0) {
    throw new AppStateError('Add at least one valid profile before creating a list.');
  }

  let result = { added: 0, skipped: 0 };
  let listId = '';
  const state = await updateAppState((current) => {
    if (current.profileLists.length >= PROFILE_LIST_LIMIT) {
      throw new AppStateError(`Profile list limit reached (${PROFILE_LIST_LIMIT}).`);
    }
    ensureUniqueListName(current, listName);
    const list = parseProfileList(crypto.randomUUID(), listName);
    listId = list.id;
    const imported = addImportedProfiles(current, validatedDrafts, list.id);
    result = { added: imported.added, skipped: imported.skipped };
    return {
      ...current,
      profiles: imported.profiles,
      profileLists: [...current.profileLists, list],
      activeProfileListId: list.id,
    };
  });

  return { state, ...result, listId };
}

export async function resetAppState(): Promise<AppState> {
  return runSerialized(async () => {
    const state = createDefaultState();
    await persistAppState(state);
    return state;
  });
}

export function watchAppState(listener: (state: AppState) => void): () => void {
  const handleChange: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
    changes,
    areaName,
  ) => {
    if (areaName !== 'local') return;
    const value = changes[STORAGE_KEY]?.newValue;
    const result = appStateSchema.safeParse(migrateStoredValue(value));
    if (result.success) listener(result.data);
  };

  browser.storage.onChanged.addListener(handleChange);
  return () => browser.storage.onChanged.removeListener(handleChange);
}
