import type { Widen } from "./_widen";

const toast = {
  region: "Notifications",
  dismiss: "Dismiss",
} as const;

export type ToastCatalog = Widen<typeof toast>;

export default toast;
