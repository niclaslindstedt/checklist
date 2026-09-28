import { describe, expect, it } from "vitest";

import { SITE_NAME, resolveAppName } from "../../src/site/siteConfig.ts";

describe("resolveAppName", () => {
  it("gives the phone build its store listing's name", () => {
    expect(resolveAppName(true, "Store Name")).toBe("Store Name");
    expect(resolveAppName(true, "  Store Name  ")).toBe("Store Name");
  });

  it("keeps the project's name in a phone build with nothing set", () => {
    expect(resolveAppName(true, undefined)).toBe(SITE_NAME);
    expect(resolveAppName(true, "   ")).toBe(SITE_NAME);
  });

  it("never lets the listing name reach the website or the desktop app", () => {
    expect(resolveAppName(false, "Store Name")).toBe(SITE_NAME);
  });
});
