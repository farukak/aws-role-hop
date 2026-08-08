/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { PreferencesView } from './PreferencesView';
import { createDefaultState, type AppState } from '../../domain/profile';
import { loadAppState, saveAppState } from '../../storage/app-state';

function setup(overrides: Partial<AppState['settings']> = {}) {
  const state: AppState = {
    ...createDefaultState(),
    settings: { ...createDefaultState().settings, ...overrides },
  };
  const notify = vi.fn();
  render(<PreferencesView state={state} notify={notify} />);
  return { notify, user: userEvent.setup(), state };
}

function themeOptions(): HTMLElement[] {
  return screen.getAllByRole('radio').slice(0, 3);
}

function backupFile(content: string, name = 'backup.json'): File {
  const file = new File([content], name, { type: 'application/json' });
  Object.defineProperty(file, 'text', {
    configurable: true,
    value: vi.fn().mockResolvedValue(content),
  });
  return file;
}

beforeEach(async () => {
  fakeBrowser.reset();
  // The fake browser has no manifest; the view reads it to show the version.
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({
    version: '0.1.0',
  } as ReturnType<typeof fakeBrowser.runtime.getManifest>);
  await saveAppState(createDefaultState());
});

describe('PreferencesView — theme radio group', () => {
  it('exposes the groups with accessible names', () => {
    setup();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeDefined();
    expect(screen.getByRole('radiogroup', { name: 'Open behavior' })).toBeDefined();
  });

  it('marks only the active theme as checked', () => {
    setup({ theme: 'light' });
    const states = themeOptions().map((option) => option.getAttribute('aria-checked'));
    expect(states).toEqual(['false', 'true', 'false']);
  });

  it('is a single tab stop: only the checked option is tabbable', () => {
    setup({ theme: 'system' });
    expect(themeOptions().map((option) => option.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
    ]);
  });

  it('moves the selection forward with ArrowRight', async () => {
    const { user } = setup({ theme: 'system' });
    const [system] = themeOptions();

    system!.focus();
    await user.keyboard('{ArrowRight}');

    await waitFor(async () => {
      expect((await loadAppState()).settings.theme).toBe('light');
    });
  });

  it('moves the selection backward with ArrowLeft, wrapping to the end', async () => {
    const { user } = setup({ theme: 'system' });
    const [system] = themeOptions();

    system!.focus();
    await user.keyboard('{ArrowLeft}');

    await waitFor(async () => {
      expect((await loadAppState()).settings.theme).toBe('dark');
    });
  });

  it('treats ArrowDown and ArrowUp the same as ArrowRight and ArrowLeft', async () => {
    const { user } = setup({ theme: 'light' });
    const [, light] = themeOptions();

    light!.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(async () => {
      expect((await loadAppState()).settings.theme).toBe('dark');
    });
  });

  it('ignores keys that are not arrows', async () => {
    const { user } = setup({ theme: 'system' });
    const [system] = themeOptions();

    system!.focus();
    await user.keyboard('a');

    expect((await loadAppState()).settings.theme).toBe('system');
  });

  it('still selects on click', async () => {
    const { user } = setup({ theme: 'system' });
    await user.click(screen.getByRole('radio', { name: /Dark/ }));

    await waitFor(async () => {
      expect((await loadAppState()).settings.theme).toBe('dark');
    });
  });
});

describe('PreferencesView — language', () => {
  it('exposes the language group and persists an explicit selection', async () => {
    const { user } = setup({ language: 'system' });
    expect(screen.getByRole('radiogroup', { name: 'Language' })).toBeDefined();

    await user.click(screen.getByRole('radio', { name: /Turkish/ }));
    await waitFor(async () => {
      expect((await loadAppState()).settings.language).toBe('tr');
    });
  });
});

describe('PreferencesView — toggles', () => {
  it('reflects and updates the production confirmation toggle', async () => {
    const { user } = setup({ confirmProduction: true });
    const toggle = screen.getByRole('checkbox', { name: /Confirm production/ });
    expect(toggle).toHaveProperty('checked', true);

    await user.click(toggle);
    await waitFor(async () => {
      expect((await loadAppState()).settings.confirmProduction).toBe(false);
    });
  });

  it('reflects and updates account masking', async () => {
    const { user } = setup({ hideAccountIds: false });
    await user.click(screen.getByRole('checkbox', { name: /Hide account IDs/ }));

    await waitFor(async () => {
      expect((await loadAppState()).settings.hideAccountIds).toBe(true);
    });
  });
});

describe('PreferencesView — reset dialog', () => {
  it('is named and described for assistive technology', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Reset/ }));

    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.getAttribute('aria-labelledby')).toBe('reset-data-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('reset-data-description');
    expect(document.getElementById('reset-data-title')?.textContent).toBe('Reset all local data?');
  });

  it('does not reset until the destructive action is confirmed', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Reset/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  });
});
describe('PreferencesView — backup errors', () => {
  it('restores a valid JSON backup', async () => {
    const { notify, user } = setup();
    const backup = {
      ...createDefaultState(),
      settings: { ...createDefaultState().settings, theme: 'dark' as const },
    };

    await user.upload(screen.getByLabelText('Backup file'), backupFile(JSON.stringify(backup)));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Backup restored.'));
    expect((await loadAppState()).settings.theme).toBe('dark');
  });

  it('reports malformed JSON without exposing a parser error', async () => {
    const { notify, user } = setup();
    await user.upload(screen.getByLabelText('Backup file'), backupFile('{not-json', 'broken.json'));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Backup file is not valid JSON.', 'error'),
    );
  });

  it('rejects oversized backups before reading them', async () => {
    const { notify, user } = setup();
    const file = new File([new Uint8Array(2_000_001)], 'large.json', {
      type: 'application/json',
    });
    const read = vi.fn().mockResolvedValue('');
    Object.defineProperty(file, 'text', { configurable: true, value: read });

    await user.upload(screen.getByLabelText('Backup file'), file);

    expect(notify).toHaveBeenCalledWith('Backup files must be smaller than 2 MB.', 'error');
    expect(read).not.toHaveBeenCalled();
  });

  it('reports file read failures separately', async () => {
    const { notify, user } = setup();
    const file = backupFile('{}', 'unreadable.json');
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: vi.fn().mockRejectedValueOnce(new Error('read failed')),
    });

    await user.upload(screen.getByLabelText('Backup file'), file);

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('The selected backup file could not be read.', 'error'),
    );
  });

  it('reports export API failures instead of throwing', async () => {
    const { notify, user } = setup();
    const originalDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('downloads unavailable');
      }),
    });

    try {
      await user.click(screen.getByRole('button', { name: 'Export backup' }));
      expect(notify).toHaveBeenCalledWith('The backup could not be exported.', 'error');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(URL, 'createObjectURL', originalDescriptor);
      } else {
        Reflect.deleteProperty(URL, 'createObjectURL');
      }
    }
  });
});
