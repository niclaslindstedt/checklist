// The native half of the deadline-reminder bridge: a thin wrapper over
// `expo-notifications` that arms the OS's local notifications from the schedule
// the web app mirrors across (`src/domain/notification-schedule.ts`). The web
// app never imports this — it talks to it over the `postMessage` bridge
// (`./nativeBridge.ts`), which calls in here.
//
// Like `./icloud.ts` and `./widgets.ts`, the module is resolved lazily and
// degrades to "unavailable" (null) when `expo-notifications` isn't linked, so a
// build without it — or a bare Expo Go run where notifications aren't
// configured — simply offers no reminders instead of throwing.
//
// The model is deliberately stateless: every `setSchedule` cancels *all* of the
// app's previously-scheduled reminders and re-arms from the incoming list. The
// web side republishes the whole schedule on every document change, so checking
// an item off, deleting it, or a sync from another device all converge the OS's
// pending notifications onto the current document — no duplicates, no
// orphans. The stable per-reminder id from the schedule is used as the
// notification identifier so a no-op republish re-creates the same set.

import type { EventSubscription } from "expo-modules-core";

/** The permission states the web bridge speaks, mapped from the OS's. */
export type NotificationPermission = "undetermined" | "granted" | "denied";

/** One reminder as it arrives in the mirrored schedule. */
interface ScheduledNotification {
  id: string;
  listId: string;
  itemId: string;
  /** ISO-8601 UTC instant the OS should fire it. */
  fireAt: string;
  title: string;
  body: string;
}

/** The minimal notification surface the bridge drives. */
export interface NotificationHost {
  /** The current OS permission, normalised to the bridge's three states. */
  getPermission(): Promise<NotificationPermission>;
  /** Ask the OS for permission (no-op re-prompt when already decided). */
  requestPermission(): Promise<NotificationPermission>;
  /** Cancel the app's armed reminders and re-schedule from `scheduleJson`. */
  setSchedule(scheduleJson: string): Promise<void>;
  /**
   * Subscribe to notification taps. The listener gets the tapped reminder's
   * `listId` so the wrapper can deep-link the WebView to that list. Returns an
   * unsubscribe.
   */
  onResponse(listener: (listId: string) => void): () => void;
}

// Minimal shape of the parts of `expo-notifications` we call, so this file
// type-checks without the package's types resident.
interface ExpoNotifications {
  getPermissionsAsync(): Promise<{ status: string; canAskAgain: boolean }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  cancelAllScheduledNotificationsAsync(): Promise<void>;
  scheduleNotificationAsync(request: {
    identifier?: string;
    content: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
    };
    trigger: { type: "date"; date: number } | Date;
  }): Promise<string>;
  addNotificationResponseReceivedListener(
    listener: (response: {
      notification: {
        request: { content: { data?: Record<string, unknown> } };
      };
    }) => void,
  ): EventSubscription;
  setNotificationHandler(handler: unknown): void;
}

// `undefined` means "not resolved yet"; `null` means "resolved to unavailable".
let cached: NotificationHost | null | undefined;

/** Normalise the OS permission status string into the bridge's three states. */
function toPermission(status: string): NotificationPermission {
  if (status === "granted") return "granted";
  if (status === "undetermined") return "undetermined";
  return "denied";
}

/** Narrow one entry of the parsed schedule to a `ScheduledNotification`. */
function parseEntry(value: unknown): ScheduledNotification | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id === "string" &&
    typeof v.listId === "string" &&
    typeof v.itemId === "string" &&
    typeof v.fireAt === "string" &&
    typeof v.title === "string" &&
    typeof v.body === "string"
  ) {
    return {
      id: v.id,
      listId: v.listId,
      itemId: v.itemId,
      fireAt: v.fireAt,
      title: v.title,
      body: v.body,
    };
  }
  return null;
}

/**
 * The notification host, or null when `expo-notifications` isn't available.
 * Memoised. On first resolve it also installs a foreground handler so a
 * reminder that fires while the app is open still surfaces as a banner.
 */
export function getNotificationHost(): NotificationHost | null {
  if (cached !== undefined) return cached;
  try {
    // Lazy require so a build without the package doesn't fail at import time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require("expo-notifications") as ExpoNotifications;

    // Show reminders as a banner even when the app is foregrounded — otherwise
    // a reminder that fires while the user is in the app is silently swallowed.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    cached = {
      getPermission: async () => {
        const { status } = await Notifications.getPermissionsAsync();
        return toPermission(status);
      },
      requestPermission: async () => {
        const { status } = await Notifications.requestPermissionsAsync();
        return toPermission(status);
      },
      setSchedule: async (scheduleJson) => {
        // Wipe the previously-armed set first, so a disabled / emptied schedule
        // clears everything and a fresh one never stacks on top of the old.
        await Notifications.cancelAllScheduledNotificationsAsync();

        const { status } = await Notifications.getPermissionsAsync();
        if (toPermission(status) !== "granted") return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(scheduleJson);
        } catch {
          return; // malformed mirror — leave everything cancelled
        }
        const entries =
          parsed && typeof parsed === "object"
            ? (parsed as { notifications?: unknown }).notifications
            : undefined;
        if (!Array.isArray(entries)) return;

        const nowMs = Date.now();
        for (const raw of entries) {
          const entry = parseEntry(raw);
          if (!entry) continue;
          const when = Date.parse(entry.fireAt);
          // Guard against a stale mirror asking for a past fire time (the OS
          // would fire it immediately); the web side filters these, but the
          // round-trip could lag across midnight.
          if (!Number.isFinite(when) || when <= nowMs) continue;
          await Notifications.scheduleNotificationAsync({
            identifier: entry.id,
            content: {
              title: entry.title,
              body: entry.body,
              // Carried so a tap can deep-link to the item's list.
              data: { listId: entry.listId, itemId: entry.itemId },
            },
            trigger: { type: "date", date: when },
          });
        }
      },
      onResponse: (listener) => {
        const sub = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            const data = response.notification.request.content.data;
            const listId = data?.listId;
            if (typeof listId === "string") listener(listId);
          },
        );
        return () => sub.remove();
      },
    };
  } catch (err) {
    console.warn("[notifications] native notification bridge unavailable", err);
    cached = null;
  }
  return cached;
}
