// The device's namespace registry as a React hook: owns the `namespaces`
// state, the best-effort mirror of every mutation into the active backend's
// `namespaces.json`, and the boot-time reconcile that merges this device's
// list with the backend's. Peeled out of `useStorageBackend` so the
// state+persist step lives in one place and is unit-testable against a mocked
// registry store, instead of being repeated across four CRUD verbs.
//
// The verbs here cover only the registry itself (add / rename / appearance /
// remove the entry, then persist). Side concerns that depend on the active
// backend — deleting a removed namespace's *data*, switching the active
// namespace, raising achievements — stay in `useStorageBackend`, which wraps
// these verbs.

import { useCallback, useEffect, useState } from "react";

import type { NamespaceRegistryStore } from "./namespace-store.ts";
import {
  type Namespace,
  type NamespaceAppearance,
  addNamespace as registryAddNamespace,
  getNamespaces,
  hasLocalOnlyNamespaces,
  mergeNamespaceLists,
  parseNamespaces,
  removeNamespace as registryRemoveNamespace,
  renameNamespace as registryRenameNamespace,
  serializeNamespaces,
  setNamespaceAppearance as registrySetNamespaceAppearance,
  setNamespaces as registrySetNamespaces,
} from "./namespaces.ts";

export interface NamespaceRegistry {
  /** Namespaces known on this device (default always first). */
  namespaces: Namespace[];
  /**
   * Create a namespace from a display name (applying an optional appearance),
   * persist the registry, and return the created entry. The caller decides
   * whether to switch to it.
   */
  add: (name: string, appearance?: NamespaceAppearance) => Namespace;
  /** Change a namespace's display name (its data stays put) and persist. */
  rename: (slug: string, name: string) => void;
  /** Set or clear a namespace's appearance (icon / accent colour) and persist. */
  setAppearance: (slug: string, patch: NamespaceAppearance) => void;
  /**
   * Drop the registry entry and persist. Deleting the namespace's *data* in
   * the active backend is the caller's responsibility — this only edits the
   * list.
   */
  remove: (slug: string) => void;
}

export function useNamespaceRegistry(
  namespaceStore: NamespaceRegistryStore | null,
): NamespaceRegistry {
  const [namespaces, setNamespacesState] = useState<Namespace[]>(getNamespaces);

  // Best-effort push of the current device registry to the active backend.
  // Shared by the create / rename / appearance / remove verbs so a mutation
  // is mirrored into `namespaces.json` the same way `useSettings` mirrors
  // `settings.json`. A no-op on the browser backend (no store).
  const pushNamespaces = useCallback(
    (list: Namespace[]) => {
      void Promise.resolve(
        namespaceStore?.save(serializeNamespaces(list)),
      ).catch(() => {
        // A failed write leaves the local copy, which the next reconcile or
        // mutation re-pushes.
      });
    },
    [namespaceStore],
  );

  // Re-read the registry into React state and mirror it up after a mutation.
  const commit = useCallback(() => {
    const list = getNamespaces();
    setNamespacesState(list);
    pushNamespaces(list);
  }, [pushNamespaces]);

  // Reconcile the device's namespace list with the backend's `namespaces.json`
  // when a file backend is (re)selected. The backend wins on any slug both
  // sides know, and this device's own namespaces are merged in and pushed
  // back up — so connecting on a new device adopts the cloud's lists and
  // uploads any local-only ones rather than dropping them. A missing remote
  // file is seeded from this device (the first device to connect publishes).
  useEffect(() => {
    if (!namespaceStore) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await namespaceStore.load();
        if (cancelled) return;
        const local = getNamespaces();
        if (raw === null) {
          await namespaceStore.save(serializeNamespaces(local));
          return;
        }
        const remote = parseNamespaces(raw);
        const merged = mergeNamespaceLists(local, remote);
        registrySetNamespaces(merged);
        setNamespacesState(getNamespaces());
        if (hasLocalOnlyNamespaces(local, remote)) {
          await namespaceStore.save(serializeNamespaces(getNamespaces()));
        }
      } catch {
        // Backend unreachable / malformed — keep the local registry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [namespaceStore]);

  const add = useCallback(
    (name: string, appearance?: NamespaceAppearance) => {
      const created = registryAddNamespace(name);
      // Apply the icon / colour the user picked at creation time, if any,
      // before reading the registry back into state.
      if (appearance && (appearance.glyph || appearance.color)) {
        registrySetNamespaceAppearance(created.slug, appearance);
      }
      commit();
      return created;
    },
    [commit],
  );

  const rename = useCallback(
    (slug: string, name: string) => {
      registryRenameNamespace(slug, name);
      commit();
    },
    [commit],
  );

  const setAppearance = useCallback(
    (slug: string, patch: NamespaceAppearance) => {
      registrySetNamespaceAppearance(slug, patch);
      commit();
    },
    [commit],
  );

  const remove = useCallback(
    (slug: string) => {
      registryRemoveNamespace(slug);
      commit();
    },
    [commit],
  );

  return { namespaces, add, rename, setAppearance, remove };
}
