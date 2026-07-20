// Device-local flag for whether the side-menu footer (Donate / trophy /
// About / Settings) is folded away. Collapsing it hands the freed vertical
// space to the checklist list — handy on a short phone screen with a long
// list. The choice is remembered across reloads and applies on every
// viewport (the phone drawer and the pinned iPad sidebar alike).
//
// Like `useDevMode`, this lives outside the appearance `Settings` so it never
// travels with an export or a sync — it's a per-device layout preference, not
// part of the shared document. State is owned at module scope behind a
// `useSyncExternalStore` subscription so every mounted `SideMenu` (a drawer
// can be re-created across viewport changes) sees the same value and updates
// in the same render, and a toggle in one tab propagates to the others.

import { useSyncExternalStore } from "react";

import { unlock } from "../../achievements/bus.ts";

export const FOOTER_COLLAPSED_KEY = "checklist:footer-collapsed";

function read(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(FOOTER_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function write(value: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (value) localStorage.setItem(FOOTER_COLLAPSED_KEY, "true");
    else localStorage.removeItem(FOOTER_COLLAPSED_KEY);
  } catch {
    // Best-effort; swallow quota / access errors.
  }
}

let state = read();
const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      // A subscriber error must not break the dispatch loop.
    }
  }
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Flip (or set) the collapsed flag, persist it, and wake every subscriber. */
export function setFooterCollapsed(next: boolean): void {
  if (state === next) return;
  state = next;
  write(next);
  // Folding the footer away unlocks "Room to breathe" (the bus dedupes, so
  // toggling it back and forth only ever fires the once).
  if (next) unlock("roomToBreathe");
  notify();
}

// Pick up writes from other tabs so a toggle in one window propagates.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== FOOTER_COLLAPSED_KEY) return;
    const next = read();
    if (next !== state) {
      state = next;
      notify();
    }
  });
}

/**
 * Read the device-local footer-collapsed flag and a setter that toggles it.
 * `useSyncExternalStore` keeps every mounted reader in step with module state.
 */
export function useFooterCollapsed(): {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
} {
  const collapsed = useSyncExternalStore(
    subscribe,
    () => state,
    () => false,
  );
  return { collapsed, setCollapsed: setFooterCollapsed };
}
