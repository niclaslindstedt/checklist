// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `scripts/website-only.mjs` is the last word on what an app build may carry:
// both bundle scripts (the phone's and the desktop's) run it over the webroot
// they are about to ship. These tests drive it the way a person does — the CLI
// over a directory — so a needle that stops matching fails here, not in review.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(
  import.meta.dirname,
  "..",
  "..",
  "scripts",
  "website-only.mjs",
);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "website-only-"));
  writeFileSync(
    join(dir, "index.html"),
    "<!doctype html><title>checklist</title>",
  );
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "index.js"), "console.log('app')");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function check() {
  const env = { ...process.env };
  delete env.VITE_DONATE_URL;
  return spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8", env });
}

describe("website-only.mjs", () => {
  it("passes an app build", () => {
    const result = check();
    expect(result.status, result.stderr).toBe(0);
  });

  it("refuses a service worker, at the root or deeper", () => {
    for (const name of ["sw.js", "workbox-5a1b2c3d.js", "preview/sw.js"]) {
      mkdirSync(join(dir, "preview"), { recursive: true });
      writeFileSync(
        join(dir, name),
        "self.addEventListener('fetch', () => {})",
      );
      const result = check();
      expect(result.status, name).toBe(1);
      expect(result.stderr).toMatch(/service worker/);
      rmSync(join(dir, name));
    }
  });

  it("refuses a link back to the source", () => {
    writeFileSync(
      join(dir, "assets", "index.js"),
      "fetch('https://github.com/niclaslindstedt/checklist/issues')",
    );
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/link back to the source/);
  });

  it("refuses the achievements", () => {
    writeFileSync(
      join(dir, "assets", "index.js"),
      "toast('Achievement unlocked')",
    );
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/achievements/);
  });
});
