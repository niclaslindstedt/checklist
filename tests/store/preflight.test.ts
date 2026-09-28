// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `make store-preflight` is the one command that says whether this checkout
// can ship, so it has to describe THIS app: read the bundle id where the build
// reads it (`native/identifiers.js`, from APP_BUNDLE_ID — not a literal
// `app.config.js` no longer holds), and not ask for a game's Steam art, a
// `make` target or a file this tree does not have. Run as the Makefile runs it.

import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");

function preflight(env: Record<string, string>): string {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      join(root, "scripts", "store-preflight.mjs"),
    ],
    { cwd: root, encoding: "utf8", env: { ...process.env, ...env } },
  );
  expect(result.stderr).toBe("");
  return result.stdout;
}

describe("store-preflight", () => {
  const out = preflight({ APP_BUNDLE_ID: "se.example.checklist" });

  it("reads the bundle id the way app.config.js builds it", () => {
    expect(out).toContain("bundle id se.example.checklist");
    expect(out).not.toContain("could not read BUNDLE_ID");
    expect(out).not.toContain("identifiers.js could not be loaded");
  });

  it("asks only for what this app ships, where this tree keeps it", () => {
    expect(out).not.toMatch(/\bgame\b/i);
    expect(out).not.toMatch(/steam|Mac App Store/i);
    expect(out).not.toContain("store-shots");
    expect(out).not.toContain("native-bundle");
    expect(out).not.toContain("webroot.zip");
    expect(out).not.toContain("pwa/");
    expect(out).not.toContain("og.png");
    expect(out).not.toContain("icons/pwa-512.png");
    expect(out).not.toContain("pin the id");
  });
});
