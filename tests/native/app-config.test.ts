// The phone app's marketing version — what the App Store and Play show — is
// the release's: `native/app.config.js` reads it from the root package.json,
// the file the Release workflow bumps when it tags `v<version>`, so a store
// build never says a version the release history does not.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

type AppConfig = {
  expo: { version: string; ios: { infoPlist: Record<string, unknown> } };
};

describe("native/app.config.js", () => {
  it("takes its version from the root package.json", () => {
    const appConfig = require("../../native/app.config.js") as () => AppConfig;
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      version: string;
    };
    expect(appConfig().expo.version).toBe(pkg.version);
  });

  it("declares no non-exempt encryption, so the store asks no export question", () => {
    const appConfig = require("../../native/app.config.js") as () => AppConfig;
    expect(appConfig().expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(
      false,
    );
  });

  it("leaves the build number to EAS", () => {
    const eas = JSON.parse(readFileSync("native/eas.json", "utf8")) as {
      cli: { appVersionSource?: string };
      build: { production: { autoIncrement?: boolean } };
    };
    expect(eas.cli.appVersionSource).toBe("remote");
    expect(eas.build.production.autoIncrement).toBe(true);
  });
});
