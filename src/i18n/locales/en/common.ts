import type { Widen } from "./_widen";

const common = {
  close: "Close",
  cancel: "Cancel",
  dismiss: "Dismiss",
  back: "Back",
} as const;

export type CommonCatalog = Widen<typeof common>;

export default common;
