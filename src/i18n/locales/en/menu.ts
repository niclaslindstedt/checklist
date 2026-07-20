import type { Widen } from "./_widen";

// Strings for the burger menu, now pinned to the foot of the side
// drawer — settings, changelog, and the project links.

const menu = {
  settings: "Settings",
  changelog: "What's new",
  privacy: "Privacy policy",
  source: "View source",
  donate: "Donate",
  about: "About",
  collapseFooter: "Collapse footer",
  expandFooter: "Expand footer",
} as const;

export type MenuCatalog = Widen<typeof menu>;

export default menu;
