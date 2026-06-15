// Ephemeral in-memory storage backend preloaded with the sample document
// (`src/dev/seed.ts`), used by the developer "Fake data" toggle. Never
// persisted: the bytes live in a closure for the lifetime of the adapter
// instance, edits during the dev session round-trip through `save`, and
// the whole thing is discarded when the toggle flips off (or the page
// reloads), at which point `App` feeds the real adapter back and the
// load effect reloads the user's untouched data. Cloned from the budget
// project's `dev-seed-adapter.ts`.
//
// DELIBERATELY NO `loadSync` capability. This adapter is only ever
// swapped in MID-SESSION (the toggle is off at mount), never the initial
// adapter, so it has no first-paint fast path to serve — the async
// `load()` path handles the swap and repopulates state. Advertising
// `loadSync` would risk the seed never replacing real data on screen.

import { buildSeedSnapshot } from "../../dev/seed.ts";
import type { StorageAdapter, StoredSnapshot } from "../adapter.ts";
import { serialize } from "../serialize.ts";

export function createDevSeedAdapter(): StorageAdapter {
  // Seed once on creation. A fresh adapter (fresh seed) is built each
  // time the toggle is turned on.
  let text = serialize(buildSeedSnapshot());

  return {
    id: "dev",
    label: "Developer (fake data)",
    saveDebounceMs: 0,
    // No capabilities — async-only, no sync fast path (see header).
    capabilities: new Set(),

    async load(): Promise<StoredSnapshot | null> {
      return { text };
    },

    async save(next: string): Promise<StoredSnapshot> {
      text = next;
      return { text };
    },
  };
}
