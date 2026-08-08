// Split-out surfaces: a component that lives in its own chunk and loads the
// first time something asks for it, so the bundle the browser parses before
// first paint carries only what the app actually paints.
//
// `defer` returns a stand-in component with the same props as the real one,
// plus `active`. Call it at module scope and render the result exactly where
// the real component used to go:
//
//     const SettingsModal = defer(() =>
//       import("./SettingsModal.tsx").then((m) => m.SettingsModal),
//     );
//     …
//     <SettingsModal active={open} open={open} onClose={close} />
//
// It renders `null` until its chunk lands, so a deferred surface must be one
// that is allowed to be absent for a moment — a closed modal, a picker nobody
// has opened. Never put one on the first-paint path.
//
// `active` is what triggers the load, and it stays separate from the
// component's own props on purpose: the host keeps rendering the stand-in while
// the modal is shut (so mount semantics match what a statically-imported modal
// had), and a surface the user never opens is never fetched or parsed.
//
// Why not `lazy()` + `Suspense`: because an open has to be able to be
// *synchronous*. `Modal` focuses its `initialFocusRef` in a layout effect so
// the focus lands inside the tap that opened it — the only context in which
// iOS raises the soft keyboard for a programmatic `focus()` — and `SideMenu`
// leans on that directly, dispatching the search command inside `flushSync`. A
// loader that can only ever resolve through a promise pushes the real render
// past that gesture, so the field would focus with no keyboard. Here, a
// resident chunk is readable on the very next render, and `warm: true` gets
// the chunks that need it resident during idle time after first paint, long
// before any tap. See `warmDeferred`.

import { useEffect, useSyncExternalStore, type ComponentType } from "react";

export interface DeferOptions {
  /**
   * Prefetch this surface during idle time after first paint, instead of
   * waiting for `active`. Set it for anything whose open must be synchronous
   * (the search modal and its soft keyboard); leave it off otherwise so a
   * surface the user never opens costs nothing to parse.
   */
  warm?: boolean;
}

// Surfaces that asked to be warmed, so `warmDeferred()` doesn't need each call
// site to register itself.
const warmable: { load: () => void }[] = [];

export function defer<P extends object>(
  load: () => Promise<ComponentType<P>>,
  { warm = false }: DeferOptions = {},
): ComponentType<P & { active?: boolean }> {
  let component: ComponentType<P> | null = null;
  let loading = false;
  const listeners = new Set<() => void>();

  const start = () => {
    if (component || loading) return;
    loading = true;
    void load().then(
      (loaded) => {
        component = loaded;
        loading = false;
        for (const listener of listeners) listener();
      },
      () => {
        // Clear the flag so a later attempt retries. A chunk request can fail
        // on a flaky connection, and the surface should still open next time
        // rather than stay dead for the rest of the session.
        loading = false;
      },
    );
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const snapshot = () => component;

  if (warm) warmable.push({ load: start });

  return function Deferred({
    active = true,
    ...rest
  }: P & { active?: boolean }) {
    const Loaded = useSyncExternalStore(subscribe, snapshot);
    useEffect(() => {
      if (active) start();
    }, [active]);
    if (!Loaded) return null;
    // Rendered as soon as the chunk is resident, `active` or not — so a modal
    // behaves exactly as it did when statically imported: always mounted,
    // hidden by its own `open` prop. That is also what lets an open be
    // synchronous, since there is no state to flip first.
    return <Loaded {...(rest as unknown as P)} />;
  };
}

/**
 * Prefetch the surfaces declared with `warm: true`, from idle time after first
 * paint — so their chunk is resident, parsed, and synchronously readable by
 * the time a tap needs one, without competing with first paint.
 *
 * Note this is about being *parsed and resident*, not about bytes: the service
 * worker precaches every emitted chunk regardless, so the split buys a smaller
 * parse before first paint rather than a smaller total download.
 */
export function warmDeferred(): void {
  const run = () => {
    for (const surface of warmable) surface.load();
  };
  // Safari still ships no `requestIdleCallback`; a timeout is a fine stand-in,
  // since all this needs is to be off the first-paint critical path.
  const idle = (
    globalThis as {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => void;
    }
  ).requestIdleCallback;
  if (idle) idle(run, { timeout: 2_000 });
  else globalThis.setTimeout(run, 1_000);
}
