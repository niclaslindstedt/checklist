// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The phone app's web bundle (`native/scripts/bundle-web.mjs`): the build it
// runs, the name it carries, and the refusal it ends with. A break here is
// silent until review — a phone build named "checklist" under a tile that
// says the listing's name, or a webroot that is really the website.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { nativeBuildEnv } from "../../native/scripts/bundle-web.mjs";

const root = join(import.meta.dirname, "..", "..");

describe("the phone build's environment", () => {
  it("marks the build and carries the listing's name", () => {
    const env = nativeBuildEnv(
      { APP_DISPLAY_NAME: "  Nird Checklist ", PATH: "/bin" },
      "preview",
    );
    expect(env.VITE_NATIVE).toBe("1");
    expect(env.APP_DISPLAY_NAME).toBe("Nird Checklist");
    expect(env.PATH).toBe("/bin");
  });

  it("leaves the name to the project when it is unset outside production", () => {
    for (const name of [undefined, "", "   "]) {
      const env = nativeBuildEnv({ APP_DISPLAY_NAME: name }, "development");
      expect(env.VITE_NATIVE).toBe("1");
      expect("APP_DISPLAY_NAME" in env).toBe(false);
    }
  });

  it("refuses a production bundle without the listing's name", () => {
    expect(() => nativeBuildEnv({}, "production")).toThrow(/APP_DISPLAY_NAME/);
    expect(() =>
      nativeBuildEnv({ APP_DISPLAY_NAME: "Nird Checklist" }, "production"),
    ).not.toThrow();
  });
});

describe("the bundle script", () => {
  const script = readFileSync(
    join(root, "native", "scripts", "bundle-web.mjs"),
    "utf8",
  );

  it("refuses a webroot that carries what only the website may", () => {
    // website-only.mjs covers the Donate link, the achievements, the source
    // links and a service worker; tests/scripts/website-only.test.ts pins it.
    expect(script).toContain('from "../../scripts/website-only.mjs"');
    expect(script).toContain("assertWebsiteOnlyAbsent(WEBROOT)");
  });

  it("is what the root's build:native runs", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts["build:native"]).toBe(
      "node native/scripts/bundle-web.mjs",
    );
  });

  it("is given the listing's name by the workflow that bundles for EAS", () => {
    const workflow = readFileSync(
      join(root, ".github", "workflows", "native.yml"),
      "utf8",
    );
    const step = workflow
      .split("\n      - ")
      .find((s) => s.includes("native/scripts/bundle-web.mjs"));
    expect(step).toContain("APP_DISPLAY_NAME: ${{ secrets.APP_DISPLAY_NAME }}");
    expect(step).toContain('--profile "$PROFILE"');
  });
});
