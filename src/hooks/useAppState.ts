import { useEffect, useState } from 'react';
import type { AppState, AppSettings } from '../domain/profile';
import { loadAppState, watchAppState } from '../storage/app-state';

export interface AppStateSnapshot {
  state: AppState | null;
  loading: boolean;
  error: string | null;
}

export function useAppState(): AppStateSnapshot {
  const [snapshot, setSnapshot] = useState<AppStateSnapshot>({
    state: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    const unwatch = watchAppState((state) => {
      if (active) setSnapshot({ state, loading: false, error: null });
    });

    void loadAppState()
      .then((state) => {
        if (active) setSnapshot({ state, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSnapshot({
          state: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to read extension data.',
        });
      });

    return () => {
      active = false;
      unwatch();
    };
  }, []);

  return snapshot;
}

export function useTheme(theme: AppSettings['theme'] | undefined): void {
  useEffect(() => {
    const root = document.documentElement;
    if (!theme || theme === 'system') {
      delete root.dataset.theme;
      return;
    }
    root.dataset.theme = theme;
  }, [theme]);
}
