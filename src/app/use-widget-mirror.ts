// Keeps the native Home Screen / Lock Screen widgets in step with the app.
// Two directions cross the bridge here:
//
//  - **Out**: whenever the document or the active list changes, a compact
//    snapshot (`domain/widget-snapshot.ts`) is mirrored to the native shared
//    container and the widget timelines are reloaded. Debounced so a burst of
//    edits collapses into one publish — a widget doesn't need every keystroke.
//
//  - **In**: the interactive check-off widget can't write the WebView's store
//    from its own process, so its taps queue actions in the shared container.
//    This hook drains that queue — on mount, whenever the app returns to the
//    foreground (the WebView regains visibility), and when the native side
//    signals a fresh action — and replays each through the app's normal edit
//    path so it saves and undoes like any other edit.
//
// Everything degrades to nothing on the web build (no bridge): the publish is
// a no-op and the drain returns []. See `storage/native-widgets.ts`.

import { useEffect, useRef } from "react";

import {
  buildWidgetSnapshot,
  type WidgetAction,
} from "../domain/widget-snapshot.ts";
import type { Snapshot } from "../domain/types.ts";
import { isWidgetsAvailable } from "../storage/native-bridge.ts";
import {
  drainWidgetActions,
  publishWidgetSnapshot,
  subscribeWidgetActions,
} from "../storage/native-widgets.ts";
import { now } from "./side-effects.ts";

// How long to wait after the last edit before mirroring — long enough to
// coalesce a burst of taps, short enough that a glance-and-tick feels live.
const PUBLISH_DEBOUNCE_MS = 400;

export function useWidgetMirror(deps: {
  /** The full in-memory document to project. */
  snapshot: Snapshot;
  /** The id of the list the app currently shows (the widget's default focus). */
  activeChecklistId: string;
  /** Gate publishing until the first backend load resolves (avoids a flash of empty). */
  loaded: boolean;
  /** Whether the user sinks checked items — matches the app's open-item order. */
  sinkChecked: boolean;
  /** Apply one queued widget action (e.g. an interactive check-off). */
  onAction: (action: WidgetAction) => void;
}): void {
  const { snapshot, activeChecklistId, loaded, sinkChecked, onAction } = deps;

  // Nothing to do off-device — resolved once so the web build never pays for
  // the effects below.
  const available = useRef(isWidgetsAvailable());

  // Publish (debounced) whenever the projected inputs change.
  useEffect(() => {
    if (!available.current || !loaded) return;
    const timer = setTimeout(() => {
      void publishWidgetSnapshot(
        buildWidgetSnapshot(snapshot, {
          now: now(),
          activeListId: activeChecklistId,
          sinkChecked,
        }),
      );
    }, PUBLISH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [snapshot, activeChecklistId, loaded, sinkChecked]);

  // Drain queued widget actions on mount, on foreground, and on a native
  // signal. `onAction` is read through a ref so the subscription and the
  // visibility listener don't re-bind every render.
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    if (!available.current) return;
    let cancelled = false;
    const drain = async () => {
      const actions = await drainWidgetActions();
      if (cancelled) return;
      for (const action of actions) onActionRef.current(action);
    };
    void drain();
    const onVisible = () => {
      if (document.visibilityState === "visible") void drain();
    };
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = subscribeWidgetActions(() => void drain());
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, []);
}
