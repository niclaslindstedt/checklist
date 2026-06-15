import type { Widen } from "./_widen";

// Strings for the header burger menu — the trigger label and each entry
// inside it (settings, changelog, and the project links).

const menu = {
  open: "Open menu",
  settings: "Settings",
  changelog: "What's new",
  privacy: "Privacy policy",
  source: "View source",
  donate: "Donate",
} as const;

export type MenuCatalog = Widen<typeof menu>;

export default menu;
