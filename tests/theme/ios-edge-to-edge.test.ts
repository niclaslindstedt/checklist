import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The installed iOS PWA only paints under the home indicator when the *root*
// element carries a fixed `100vh` height; with the shell's `100svh` (or any
// percentage height) iOS letterboxes and leaves a dead black band at the
// bottom, so the app never reaches the physical bottom of the screen. The fix
// lives in theme.css as a scoped override. These assertions lock in both the
// override and its scoping so a future edit can't silently reintroduce the
// band, and can't leak the `100vh` into a plain iOS Safari tab (where it would
// bring back the rubber-band bounce that `100svh` exists to avoid).
const css = readFileSync(
  fileURLToPath(new URL("../../src/styles/theme.css", import.meta.url)),
  "utf8",
);

describe("theme.css shell height", () => {
  it("keeps the default shell on 100svh so a Safari tab doesn't rubber-band", () => {
    expect(css).toMatch(/height:\s*100svh/);
  });

  it("forces the root to 100vh only in the installed iOS PWA", () => {
    // Collapse whitespace so the assertion is insensitive to formatting.
    const flat = css.replace(/\s+/g, " ");
    // The override must be nested inside BOTH the iOS probe and the
    // standalone-display media query, and set html/body to 100vh.
    expect(flat).toMatch(
      /@supports \(-webkit-touch-callout: none\) \{ @media \(display-mode: standalone\) \{ html, body \{ height: 100vh; \} \} \}/,
    );
  });

  it("does not force 100vh outside the iOS-standalone guard", () => {
    // No bare `height: 100vh` should exist anywhere else in the shell — that
    // would rubber-band an iOS Safari tab. The only 100vh is the guarded one.
    const occurrences = css.match(/height:\s*100vh/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });
});
