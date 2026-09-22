import { afterEach, describe, expect, it } from "vitest";

import {
  pickOauthProvider,
  redirectUri,
} from "../../src/storage/oauth-pkce.ts";

// `window.location` is absent in Node — stub a minimal shim so the
// pathname branch in `redirectUri` is exercised end-to-end.
function setLocation(origin: string, pathname: string): void {
  const g = globalThis as {
    window?: { location?: { origin: string; pathname: string } };
  };
  if (!g.window) g.window = {};
  g.window.location = { origin, pathname };
}

afterEach(() => {
  const g = globalThis as { window?: unknown };
  delete g.window;
});

describe("redirectUri", () => {
  it("returns bare origin when pathname is /", () => {
    setLocation("https://checklist.niclaslindstedt.se", "/");
    expect(redirectUri()).toBe("https://checklist.niclaslindstedt.se");
  });

  it("appends pathname for /preview/ (trailing slash stripped)", () => {
    setLocation("https://checklist.niclaslindstedt.se", "/preview/");
    expect(redirectUri()).toBe("https://checklist.niclaslindstedt.se/preview");
  });

  it("strips multiple trailing slashes", () => {
    setLocation("https://checklist.niclaslindstedt.se", "/preview///");
    expect(redirectUri()).toBe("https://checklist.niclaslindstedt.se/preview");
  });

  it("handles localhost dev", () => {
    setLocation("http://localhost:5173", "/");
    expect(redirectUri()).toBe("http://localhost:5173");
  });
});

describe("pickOauthProvider", () => {
  it("names dropbox when its verifier is pending", () => {
    expect(pickOauthProvider({ dropboxPending: true })).toBe("dropbox");
  });

  it("refuses rather than guessing when nothing is pending", () => {
    expect(pickOauthProvider({ dropboxPending: false })).toBeNull();
  });
});
