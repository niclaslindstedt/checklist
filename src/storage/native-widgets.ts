// The web app's side of the native widget mirror. Turns the typed
// `WidgetSnapshot` into the JSON the shared container stores, and the queued
// widget actions back into typed `WidgetAction`s the app can apply. Everything
// here degrades to a harmless no-op when there is no native bridge (the web
// build on GitHub Pages), so callers never have to guard the platform
// themselves — they just call these and nothing happens off-device.
//
// The transport lives in `native/src/nativeBridge.ts` (the injected
// `window.__native.widgets`); this module only serialises, parses, and logs.

import { createLogger } from "../dev/logger.ts";
import {
  parseWidgetAction,
  type WidgetAction,
  type WidgetSnapshot,
} from "../domain/widget-snapshot.ts";
import { getNativeWidgets } from "./native-bridge.ts";

const log = createLogger("widgets");

/**
 * Mirror the snapshot out to the native shared container and reload the widget
 * timelines. A no-op with no native bridge. Never throws: a bridge failure is
 * logged, not surfaced — a stale widget must never break the app's save path,
 * which is where this is called from.
 */
export async function publishWidgetSnapshot(
  snapshot: WidgetSnapshot,
): Promise<void> {
  const widgets = getNativeWidgets();
  if (!widgets) return;
  try {
    await widgets.publish(JSON.stringify(snapshot));
  } catch (err) {
    log.warn(
      `publish failed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Take and clear the actions a widget queued since the last drain (interactive
 * check-off taps). Returns [] with no bridge, on any failure, or when the
 * queue is empty. Malformed entries (the queue crossed a process boundary and
 * could be corrupt) are dropped rather than applied.
 */
export async function drainWidgetActions(): Promise<WidgetAction[]> {
  const widgets = getNativeWidgets();
  if (!widgets) return [];
  let raw: string | null;
  try {
    raw = await widgets.pending();
  } catch (err) {
    log.warn(
      `pending failed — ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log.warn("pending returned invalid JSON — dropping");
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const actions: WidgetAction[] = [];
  for (const entry of parsed) {
    const action = parseWidgetAction(entry);
    if (action) actions.push(action);
  }
  return actions;
}

/**
 * Subscribe to be told when a widget queues a new action while the app runs.
 * Returns an unsubscribe. A no-op (returns a no-op unsubscribe) when there is
 * no bridge or the platform can't push — the app drains on foreground anyway.
 */
export function subscribeWidgetActions(listener: () => void): () => void {
  const widgets = getNativeWidgets();
  if (!widgets?.subscribe) return () => {};
  return widgets.subscribe(listener);
}
