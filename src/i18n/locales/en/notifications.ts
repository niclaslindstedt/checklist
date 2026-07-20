import type { Widen } from "./_widen";

// The text of the native deadline-reminder notifications the wrapper fires.
// Only the body is templated here; the notification title is the item's own
// title. `{list}` is the list name, `{days}` the number of days until due.
// English is the source of truth for the `Catalog` type — see
// `src/app/use-notification-scheduler.ts` for where these are composed and
// `src/domain/notification-schedule.ts` for the schedule shape.

const notifications = {
  // Body of a reminder firing on the morning the item is due.
  bodyDue: "Due today in {list}",
  // Body of a reminder firing the day before the item is due.
  bodyDueTomorrow: "Due tomorrow in {list}",
  // Body of a reminder firing several days before the item is due.
  bodyDueInDays: "Due in {days} days in {list}",
} as const;

export type NotificationsCatalog = Widen<typeof notifications>;

export default notifications;
