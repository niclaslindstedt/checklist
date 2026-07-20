// The web app's side of the native deadline-reminder mirror. Serialises the
// typed `NotificationSchedule` into the JSON the wrapper arms `expo-notifications`
// from, and forwards the two permission calls. Everything here degrades to a
// harmless no-op when there is no native bridge (the web build on GitHub Pages),
// so callers never guard the platform themselves — they just call these and
// nothing happens off-device.
//
// The transport lives in `native/src/nativeBridge.ts` (the injected
// `window.__native.notifications`); this module only serialises, forwards, and
// logs. See `domain/notification-schedule.ts` for the schedule shape and
// `app/use-notification-scheduler.ts` for when these are called.

import { createLogger } from "../dev/logger.ts";
import type { NotificationSchedule } from "../domain/notification-schedule.ts";
import {
  getNativeNotifications,
  type NotificationPermission,
} from "./native-bridge.ts";

const log = createLogger("notifications");

/**
 * Mirror the reminder schedule out to the native wrapper, which re-arms the
 * OS's pending notifications from it. A no-op with no native bridge. Never
 * throws: a bridge failure is logged, not surfaced — a stale reminder must
 * never break the app's save path, which is where this is called from.
 */
export async function publishNotificationSchedule(
  schedule: NotificationSchedule,
): Promise<void> {
  const notifications = getNativeNotifications();
  if (!notifications) return;
  try {
    await notifications.publish(JSON.stringify(schedule));
  } catch (err) {
    log.warn(
      `publish failed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * The current OS notification permission, or `"denied"` when there is no
 * bridge or the query fails — the safe default, so a caller that gates on
 * `"undetermined"` before prompting never prompts off-device.
 */
export async function getNotificationPermission(): Promise<NotificationPermission> {
  const notifications = getNativeNotifications();
  if (!notifications) return "denied";
  try {
    return await notifications.getPermission();
  } catch (err) {
    log.warn(
      `getPermission failed — ${err instanceof Error ? err.message : String(err)}`,
    );
    return "denied";
  }
}

/**
 * Ask the OS for notification permission and resolve with the outcome, or
 * `"denied"` when there is no bridge or the request fails. Called the moment
 * the user first sets a deadline (see the scheduler hook), never on launch.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const notifications = getNativeNotifications();
  if (!notifications) return "denied";
  try {
    return await notifications.requestPermission();
  } catch (err) {
    log.warn(
      `requestPermission failed — ${err instanceof Error ? err.message : String(err)}`,
    );
    return "denied";
  }
}
