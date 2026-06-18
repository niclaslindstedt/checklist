import type { Widen } from "./_widen";

const common = {
  close: "Close",
  cancel: "Cancel",
  save: "Save",
  resetToDefaults: "Reset to defaults",
  dismiss: "Dismiss",
  back: "Back",
} as const;

export type CommonCatalog = Widen<typeof common>;

export default common;
