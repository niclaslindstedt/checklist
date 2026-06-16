// React state for the appearance `Settings`. Apply-immediately model:
// every `update` writes through to storage and re-renders, so the theme
// engine (which reads the live settings) previews the change at once —
// there's no separate draft / save / cancel channel to keep in sync.
//
// Two persistence layers sit behind it:
//   - localStorage (always): the synchronous first-paint cache, so the
//     theme applies before the backend resolves and there's no flash.
//   - the active backend's root settings store (when one is supplied):
//     `settings.json` at the app-folder root, so settings travel with a
//     synced/shared folder. On the cloud / folder backends the hook
//     reconciles against it on mount — adopting the backend's file when it
//     exists (another device wrote it), otherwise seeding it from this
//     device — and writes through on every `update`.

import { useCallback, useEffect, useRef, useState } from "react";

import type { SettingsStore } from "../storage/settings-store.ts";
import { loadSettings, saveSettings, validateSettings } from "./store.ts";
import type { Settings } from "./types.ts";

export type UpdateSetting = <K extends keyof Settings>(
  key: K,
  value: Settings[K],
) => void;

export interface UseSettings {
  settings: Settings;
  update: UpdateSetting;
}

export function useSettings(settingsStore?: SettingsStore | null): UseSettings {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  // Latest settings without retriggering the reconcile effect: the seed
  // path needs the current value, but the effect must run once per store
  // (a backend switch), not on every keystroke.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Reconcile with the active backend's root settings file. The backend
  // wins when it already holds one; otherwise seed it from this device. The
  // localStorage cache keeps first paint flash-free regardless, and a
  // failure (offline / malformed) silently leaves the local copy in place.
  useEffect(() => {
    if (!settingsStore) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await settingsStore.load();
        if (cancelled) return;
        if (raw === null) {
          await settingsStore.save(JSON.stringify(settingsRef.current));
          return;
        }
        const next = validateSettings(JSON.parse(raw));
        saveSettings(next);
        setSettings(next);
      } catch {
        // Backend unreachable / malformed — keep the local cache.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsStore]);

  const update = useCallback<UpdateSetting>(
    (key, value) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        saveSettings(next);
        void Promise.resolve(settingsStore?.save(JSON.stringify(next))).catch(
          () => {
            // Best-effort: a failed backend write leaves the local cache,
            // which the next reconcile or `update` re-pushes.
          },
        );
        return next;
      });
    },
    [settingsStore],
  );

  return { settings, update };
}
