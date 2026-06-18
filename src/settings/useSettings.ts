// React state for the appearance `Settings`. Every `update` (one key) and
// `replace` (a whole document) writes through to storage and re-renders, so
// the theme engine that reads these settings reflects the change at once.
// The settings dialog edits a local draft and previews it through a separate
// channel (`onPreviewAppearance` in `App`), flushing the draft here via
// `replace` only when the user hits Save — so the store stays the single
// source of truth and a cancel just drops the draft.
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
  /**
   * Commit a whole settings document in one write. Takes a producer over
   * the latest settings so the caller can merge its edits while preserving
   * fields it doesn't own (the achievements map, the menu-button position).
   * Used by the settings dialog's Save button, which edits a local draft
   * and flushes it here on confirm rather than writing through per
   * keystroke.
   */
  replace: (producer: (prev: Settings) => Settings) => void;
  /**
   * Record one or more freshly-earned achievements. Idempotent per id —
   * an id already in `achievements` keeps its original timestamp and is
   * not re-queued as unseen — so the achievement watcher can call this on
   * every transition without drift. New ids land in both `achievements`
   * (stamped now) and `unseenAchievements` (so the trophy button badges).
   * Returns the ids that were genuinely new, for the unlock toast.
   */
  unlockAchievements: (ids: readonly string[]) => string[];
  /** Clear the unseen-achievements queue (the trophy badge empties). */
  clearUnseenAchievements: () => void;
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

  // Write a settings value through to both persistence layers. Shared by
  // `update` and the achievement recorders so they all flush the same way.
  const persist = useCallback(
    (next: Settings) => {
      saveSettings(next);
      void Promise.resolve(settingsStore?.save(JSON.stringify(next))).catch(
        () => {
          // Best-effort: a failed backend write leaves the local cache,
          // which the next reconcile or `update` re-pushes.
        },
      );
    },
    [settingsStore],
  );

  const update = useCallback<UpdateSetting>(
    (key, value) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const replace = useCallback(
    (producer: (prev: Settings) => Settings) => {
      setSettings((prev) => {
        const next = producer(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const unlockAchievements = useCallback(
    (ids: readonly string[]): string[] => {
      // Compute the genuinely-new ids against the latest settings up front
      // so the caller (the unlock toast) gets them synchronously; the
      // functional update below re-checks to stay correct under batching.
      const current = settingsRef.current.achievements;
      const fresh = ids.filter((id) => current[id] === undefined);
      if (fresh.length === 0) return [];
      setSettings((prev) => {
        const ts = Date.now();
        const achievements = { ...prev.achievements };
        const unseen = [...prev.unseenAchievements];
        let changed = false;
        for (const id of ids) {
          if (achievements[id] !== undefined) continue;
          achievements[id] = ts;
          if (!unseen.includes(id)) unseen.push(id);
          changed = true;
        }
        if (!changed) return prev;
        const next = { ...prev, achievements, unseenAchievements: unseen };
        persist(next);
        return next;
      });
      return fresh;
    },
    [persist],
  );

  const clearUnseenAchievements = useCallback(() => {
    setSettings((prev) => {
      if (prev.unseenAchievements.length === 0) return prev;
      const next = { ...prev, unseenAchievements: [] };
      persist(next);
      return next;
    });
  }, [persist]);

  return {
    settings,
    update,
    replace,
    unlockAchievements,
    clearUnseenAchievements,
  };
}
