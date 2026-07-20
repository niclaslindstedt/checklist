// Keeps the native OS deadline reminders in step with the app. One direction
// crosses the bridge here: whenever the document or the reminder settings
// change, a compact schedule of upcoming reminders (`domain/notification-schedule.ts`)
// is mirrored to the native wrapper, which cancels its previously-armed
// notifications and re-schedules from it. Debounced so a burst of edits
// collapses into one publish.
//
// Because the wrapper re-arms from the whole schedule every time, three of the
// issue's care-abouts fall out for free: checking an item off, deleting it, or
// the document syncing in from another device all rebuild the mirror, so the
// OS's pending reminders converge on the current document with no stale or
// duplicate notifications.
//
// Permission is requested lazily: the first time a document gains a deadline
// (not on launch), the hook asks the OS — and, on a grant, unlocks the
// `deadlineReminders` achievement. Everything degrades to nothing on the web
// build (no bridge): the publish is a no-op and no prompt is shown. See
// `storage/native-notifications.ts`.

import { useEffect, useMemo, useRef } from "react";

import { useT } from "../i18n";
import {
  buildNotificationSchedule,
  documentHasDeadline,
  type NotificationFormatter,
} from "../domain/notification-schedule.ts";
import type { Snapshot } from "../domain/types.ts";
import { isNotificationsAvailable } from "../storage/native-bridge.ts";
import {
  getNotificationPermission,
  publishNotificationSchedule,
  requestNotificationPermission,
} from "../storage/native-notifications.ts";
import { now } from "./side-effects.ts";

// How long to wait after the last edit before mirroring — long enough to
// coalesce a burst of edits, short enough that a fresh deadline arms promptly.
const PUBLISH_DEBOUNCE_MS = 500;

export function useNotificationScheduler(deps: {
  /** The full in-memory document to project. */
  snapshot: Snapshot;
  /** Gate publishing until the first backend load resolves (avoids arming off a flash of empty). */
  loaded: boolean;
  /** Whether native deadline reminders are enabled (the global opt-out). */
  enabled: boolean;
  /** The lead-time offsets (days before due) to remind on. */
  leadDays: number[];
  /** Called once when the user grants notification permission (unlocks the achievement). */
  onPermissionGranted?: () => void;
}): void {
  const { snapshot, loaded, enabled, leadDays, onPermissionGranted } = deps;
  const t = useT();

  // Nothing to do off-device — resolved once so the web build never pays for
  // the effects below.
  const available = useRef(isNotificationsAvailable());

  // Localised reminder text: the item's own title, and a body that reads
  // "due today" / "due tomorrow" / "due in N days" by how far ahead the
  // reminder fires. Rebuilt only when the language changes.
  const format = useMemo<NotificationFormatter>(
    () => (ctx) => ({
      title: ctx.itemTitle,
      body:
        ctx.daysUntilDue <= 0
          ? t("notifications.bodyDue", { list: ctx.listName })
          : ctx.daysUntilDue === 1
            ? t("notifications.bodyDueTomorrow", { list: ctx.listName })
            : t("notifications.bodyDueInDays", {
                days: ctx.daysUntilDue,
                list: ctx.listName,
              }),
    }),
    [t],
  );

  // Publish (debounced) whenever the projected inputs change. When reminders
  // are disabled we still publish — an *empty* schedule — so the wrapper clears
  // anything it had armed rather than leaving stale reminders firing.
  useEffect(() => {
    if (!available.current || !loaded) return;
    const timer = setTimeout(() => {
      void publishNotificationSchedule(
        buildNotificationSchedule(snapshot, {
          now: now(),
          disabled: !enabled,
          leadDays,
          format,
        }),
      );
    }, PUBLISH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [snapshot, loaded, enabled, leadDays, format]);

  // Ask for notification permission the first time the document gains a
  // deadline — never on launch. Tracked across renders so the prompt fires
  // once on the false→true transition, then never again.
  const hadDeadline = useRef(false);
  const grantedRef = useRef(onPermissionGranted);
  grantedRef.current = onPermissionGranted;
  useEffect(() => {
    if (!available.current || !loaded || !enabled) return;
    const hasDeadline = documentHasDeadline(snapshot);
    const gained = hasDeadline && !hadDeadline.current;
    hadDeadline.current = hasDeadline;
    if (!gained) return;
    let cancelled = false;
    void (async () => {
      // Only prompt when the OS hasn't decided yet; a granted user is already
      // set, and a denied one must not be re-nagged.
      const current = await getNotificationPermission();
      if (cancelled) return;
      if (current === "granted") {
        grantedRef.current?.();
        return;
      }
      if (current !== "undetermined") return;
      const result = await requestNotificationPermission();
      if (!cancelled && result === "granted") grantedRef.current?.();
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot, loaded, enabled]);
}
