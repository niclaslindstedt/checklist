import { useSyncExternalStore } from "react";
import type { Workbox } from "workbox-window";

// Single source of truth for the PWA update lifecycle, driving the
// `UpdateToast` "a new build is ready — reload to apply" prompt. Ported
// from budget (trimmed of its download-progress fill). The registration
// lives in a module singleton here rather than inside the component so
// the SW is registered exactly once; the first subscriber starts it and
// `useSyncExternalStore` fans the state out to all consumers.
//
// We register the service worker ourselves via `workbox-window` rather
// than vite-plugin-pwa's `useRegisterSW` virtual module — the hook's
// auto-injected register call doesn't forward `updateViaCache: "none"`,
// so an HTTP-cached `sw.js` can satisfy update checks indefinitely (the
// SW spec only forces a cache bypass once the cached SW is over 24h
// old). With `updateViaCache: "none"` every `reg.update()` re-fetches
// the SW script from the network.
//
// Update strategy stays "prompt": the new SW installs and parks in the
// `waiting` state, we flip `needRefresh` from the workbox `waiting`
// event, and the user clicks Reload at a moment of their choosing. We
// deliberately do NOT `skipWaiting()` from the SW or `clientsClaim` —
// the page would silently swap to new JS, breaking in-progress edits.

export type PwaUpdateState = {
  // True once a new build has fully installed and is waiting to take
  // over. Drives the reload prompt.
  needRefresh: boolean;
  // Version label of the incoming build (from `version.json`), or null
  // for a deploy predating that file / while offline.
  incomingVersion: string | null;
};

const HOUR_MS = 60 * 60 * 1000;

let state: PwaUpdateState = {
  needRefresh: false,
  incomingVersion: null,
};
const listeners = new Set<() => void>();
let wb: Workbox | null = null;
let started = false;

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<PwaUpdateState>) {
  const next = { ...state, ...patch };
  if (
    next.needRefresh === state.needRefresh &&
    next.incomingVersion === state.incomingVersion
  ) {
    return;
  }
  state = next;
  emit();
}

// The running bundle only knows its OWN version (`BUILD_LABEL`), which
// is the build the prompt is upgrading AWAY from. The incoming build's
// version lives in `version.json`, deployed alongside the new SW; fetch
// it cache-bypassed so the still-active old SW lets the request reach
// the network and return the freshly-deployed file.
async function fetchIncomingVersion(base: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}version.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      data &&
      typeof data === "object" &&
      "version" in data &&
      typeof (data as { version: unknown }).version === "string"
    ) {
      return (data as { version: string }).version;
    }
    return null;
  } catch {
    return null;
  }
}

function start() {
  if (started) return;
  started = true;
  if (import.meta.env.DEV) return;
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const base = import.meta.env.BASE_URL ?? "/";
  const swUrl = `${base}sw.js`;

  void import("workbox-window").then(({ Workbox }) => {
    const instance = new Workbox(swUrl, {
      scope: base,
      type: "classic",
      // Bypass the HTTP cache when checking for a new SW. Without this,
      // GitHub Pages' default caching can serve the same bytes back to
      // the browser's update check and the new SW never gets discovered
      // until the cached SW is >24h old.
      updateViaCache: "none",
    });
    wb = instance;

    instance.addEventListener("waiting", () => {
      setState({ needRefresh: true });
      void fetchIncomingVersion(base).then((version) =>
        setState({ incomingVersion: version }),
      );
    });
    instance.addEventListener(
      "controlling",
      (event: { isUpdate?: boolean }) => {
        if (event.isUpdate) window.location.reload();
      },
    );

    instance
      .register()
      .then((reg) => {
        if (!reg) return;
        void reg.update();
        window.setInterval(() => {
          if (document.visibilityState === "visible") void reg.update();
        }, HOUR_MS);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void reg.update();
        });
      })
      .catch(() => {
        // Registration errors are swallowed — the app still functions
        // without a service worker.
      });
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

function getSnapshot(): PwaUpdateState {
  return state;
}

const SERVER_SNAPSHOT: PwaUpdateState = {
  needRefresh: false,
  incomingVersion: null,
};

function getServerSnapshot(): PwaUpdateState {
  return SERVER_SNAPSHOT;
}

export type PwaUpdate = PwaUpdateState & {
  // Apply the waiting build: posts SKIP_WAITING to it; the `controlling`
  // listener reloads the page once it takes over.
  reload: () => void;
  // Hide the prompt until a fresher build arrives.
  dismiss: () => void;
};

export function usePwaUpdate(): PwaUpdate {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return {
    ...snapshot,
    reload: () => wb?.messageSkipWaiting(),
    dismiss: () => setState({ needRefresh: false }),
  };
}
