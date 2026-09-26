// The presentation demo: `VITE_SEED=demo` (`make demo`) boots the app onto one
// person's checklists — `buildDemo` in `./demoData.ts` — held entirely in
// memory. It is the live demo and what the App Store screenshots are taken of.
//
// **How it stays off the device.** Every piece of state the app keeps on this
// install goes through `localStorage`: the browser backend's documents (one
// per namespace), the namespace registry, the active-namespace and active-list
// cursors, the backend choice and the settings. So the demo swaps that one
// seam: before any other module of the app is evaluated (`demo-boot.ts` is
// `main.tsx`'s first import), `bootDemo` puts an in-memory `Storage` in
// `window.localStorage`'s place, pre-filled with the demo and pointed at the
// browser backend. Every screen then runs the app's real code over the demo —
// the synchronous first paint, namespaces, folders, templates, the scheduled
// reset that fires on open — and every edit lands in memory and is gone on
// reload. The device's lists are never read: the only thing carried over is
// this install's own look and language (see `carriesOver`), so a demo opens
// in the theme the person chose.
//
// The native bridge is closed while the demo runs (`native-bridge.ts`), so no
// widget, reminder or iCloud write reaches the device from it, and connecting
// a storage backend is refused (`useStorageBackend`), since the first sync
// would copy the demo into the reader's real folder or cloud.
//
// Dev tooling, not a shipped feature: `DEMO` folds to `false` in any build
// without `VITE_SEED=demo`, so neither this module nor the data reaches the
// production bundle.

import { buildDemo, demoAchievements, demoTransforms } from "./demoData.ts";

/** True in a build made with `VITE_SEED=demo`; folds to `false` otherwise. */
export const DEMO = import.meta.env.VITE_SEED === "demo";

/** A `Storage` that lives and dies with the page. */
export class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.map.set(String(key), String(value));
  }
}

/** The settings blob's key (`SETTINGS_KEY` in `settings/store.ts`). */
const SETTINGS_KEY = "checklist:settings:v1";

/**
 * The keys a demo copies from the device: how this install looks and which
 * language it speaks — the settings blob (less its data, below), the language
 * choice and the folded menu footer. Never a document, a namespace, a cursor,
 * a backend, a token or the encryption state.
 */
export function carriesOver(key: string): boolean {
  return (
    key === SETTINGS_KEY ||
    key === "checklist:settings:language" ||
    key === "checklist:footer-collapsed"
  );
}

/**
 * The settings fields that are the person's data rather than their look:
 * their transform rules (written for their own namespaces) and their earned
 * achievements. The demo brings its own of both.
 */
const PERSONAL_SETTINGS = [
  "transforms",
  "achievements",
  "unseenAchievements",
] as const;

/**
 * Build the in-memory store the demo runs on: this device's look (see
 * `carriesOver`), then the demo over it, and the demo's transform rules and
 * achievements in the settings in place of the device's.
 */
export function demoStorage(
  device: Storage | null,
  now: number = Date.now(),
): MemoryStorage {
  const memory = new MemoryStorage();
  if (device) {
    for (let i = 0; i < device.length; i++) {
      const key = device.key(i);
      if (key === null || !carriesOver(key)) continue;
      const value = device.getItem(key);
      if (value !== null) memory.setItem(key, value);
    }
  }
  for (const [key, value] of Object.entries(buildDemo(now).storage)) {
    memory.setItem(key, value);
  }
  let settings: Record<string, unknown> = {};
  try {
    const raw = memory.getItem(SETTINGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      settings = parsed as Record<string, unknown>;
    }
  } catch {
    // A corrupt blob is replaced by the defaults plus the demo's rules.
  }
  for (const field of PERSONAL_SETTINGS) delete settings[field];
  memory.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      ...settings,
      transforms: demoTransforms(),
      achievements: demoAchievements(now),
    }),
  );
  return memory;
}

/**
 * Swap `window.localStorage` for the demo's in-memory store. Called before
 * the app's first module is evaluated, so no read ever reaches the device's
 * lists. Returns false (and changes nothing) where the property can't be
 * replaced.
 */
export function bootDemo(): boolean {
  let device: Storage | null = null;
  try {
    device = window.localStorage;
  } catch {
    // Storage blocked: the demo still runs, in the default look.
  }
  const memory = demoStorage(device);
  try {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => memory,
    });
  } catch {
    return false;
  }
  return window.localStorage === memory;
}
