import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// A press-and-hold on a touch device must never start a text selection. The
// shell (`#app`) already denies it, but the long-press menu and every other
// overlay portal to `document.body` — outside `#app` — so the platform used to
// anchor its selection in the still-selectable document and highlight the whole
// page behind the menu. theme.css therefore denies selection from the *root* on
// coarse pointers. These assertions lock in the root rule, its touch scoping
// (a mouse keeps click-drag selection), and the form-control opt-back-in that
// keeps editing an item's title and body selectable.
const css = readFileSync(
  fileURLToPath(new URL("../../src/styles/theme.css", import.meta.url)),
  "utf8",
);

// Collapse whitespace so the assertions are insensitive to formatting.
const flat = css.replace(/\s+/g, " ");

describe("theme.css hold-to-select", () => {
  it("denies selection from the root on touch, so portals can't be selected either", () => {
    expect(flat).toMatch(
      /@media \(hover: none\) and \(pointer: coarse\) \{ html \{ -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; \} \}/,
    );
  });

  it("keeps the shell's own selection suppression", () => {
    expect(flat).toMatch(
      /#app \{ -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; \}/,
    );
  });

  it("re-enables selection in form controls, after the root rule", () => {
    const formControls = flat.indexOf(
      "input, textarea { -webkit-user-select: text; user-select: text; }",
    );
    expect(formControls).toBeGreaterThan(-1);
    // Source order decides: a media query adds no specificity, so the opt-in
    // only wins while it trails the root rule.
    expect(formControls).toBeGreaterThan(
      flat.indexOf("@media (hover: none) and (pointer: coarse)"),
    );
  });

  it("does not disable selection for a fine pointer at the root", () => {
    // The only root-level `user-select: none` is the coarse-pointer one; a
    // second, unscoped copy would take desktop click-drag selection with it.
    const rootRules = flat.match(/html \{[^}]*user-select: none/g) ?? [];
    expect(rootRules).toHaveLength(1);
  });
});
