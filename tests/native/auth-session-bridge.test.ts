// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The auth-session bridge (`native/src/authSessionBridge.ts`) against the seam
// it fills (`getAuthSessionHost` in `src/storage/auth-session.ts`).
//
// Every failure on this seam is silent. A property or event name that drifts
// does not error: the page finds no host, falls back to its redirect flow, and
// Dropbox's consent page opens in Safari again — on a build nobody can run
// without Xcode. So the two sides are pinned against each other here, and the
// injected script is RUN, not inspected, against a stand-in for the WebView's
// window.

import { describe, expect, it } from "vitest";

import {
  AUTH_SESSION_HOST_EVENT,
  AUTH_SESSION_HOST_PROPERTY,
  getAuthSessionHost,
} from "../../src/storage/auth-session.ts";
import {
  AUTH_SESSION_REQUEST_TYPE,
  authSessionResolveScript,
  authSessionScript,
  isAuthSessionRequest,
  redirectUriFor,
} from "../../native/src/authSessionBridge.ts";

// The scheme is the bundle id (native/app.config.js); this is the store build's.
const REDIRECT = redirectUriFor("se.agilator.checklist");

type FakeWindow = Record<string, unknown> & {
  posted: string[];
  events: string[];
};

/** A stand-in for the WebView's `window`: records what the page posts out and
 *  which events it dispatches. */
function fakeWindow(): FakeWindow {
  const win: FakeWindow = { posted: [], events: [] };
  win.ReactNativeWebView = {
    postMessage: (data: string) => win.posted.push(data),
  };
  win.dispatchEvent = (event: { type: string }) => {
    win.events.push(event.type);
    return true;
  };
  return win;
}

/** Run an injected script against `win`, the way `injectJavaScript` would. */
function run(script: string, win: FakeWindow): void {
  class FakeEvent {
    constructor(readonly type: string) {}
  }
  new Function("window", "Event", script)(win, FakeEvent);
}

describe("the redirect URI", () => {
  it("is the bundle id with an oauth path — the string Dropbox must list", () => {
    expect(REDIRECT).toBe("se.agilator.checklist://oauth");
  });
});

describe("the injected provider", () => {
  it("installs itself where the page looks, and passes its validation", () => {
    const win = fakeWindow();
    run(authSessionScript(REDIRECT), win);
    expect(AUTH_SESSION_HOST_PROPERTY).toBe("__ossAuthSession");
    const host = getAuthSessionHost(win);
    expect(host).not.toBeNull();
    expect(host?.version).toBe(1);
    expect(host?.redirectUri).toBe(REDIRECT);
  });

  it("announces itself with the event the page names", () => {
    const win = fakeWindow();
    run(authSessionScript(REDIRECT), win);
    expect(win.events).toEqual([AUTH_SESSION_HOST_EVENT]);
  });

  it("does not install twice when the page reloads the script", () => {
    const win = fakeWindow();
    run(authSessionScript(REDIRECT), win);
    const first = win.__ossAuthSession;
    run(authSessionScript("other://oauth"), win);
    expect(win.__ossAuthSession).toBe(first);
    expect(win.events).toHaveLength(1);
  });

  it("carries a redirect URI that could break a literal as a plain string", () => {
    const win = fakeWindow();
    const nasty = 'x://"};alert(1);//';
    run(authSessionScript(nasty), win);
    expect(getAuthSessionHost(win)?.redirectUri).toBe(nasty);
  });

  it("round-trips a sign-in: request out, callback URL back", async () => {
    const win = fakeWindow();
    run(authSessionScript(REDIRECT), win);
    const host = getAuthSessionHost(win)!;

    const pending = host.open("https://www.dropbox.com/oauth2/authorize?x=1");
    expect(win.posted).toHaveLength(1);
    const request: unknown = JSON.parse(win.posted[0]!);
    expect(isAuthSessionRequest(request)).toBe(true);
    const { id, url } = request as { id: string; url: string };
    expect(url).toBe("https://www.dropbox.com/oauth2/authorize?x=1");

    const callback = `${REDIRECT}?code=abc&state=dropbox`;
    run(authSessionResolveScript(id, { ok: true, value: callback }), win);
    await expect(pending).resolves.toBe(callback);
  });

  it("resolves null when the reader closed the sheet", async () => {
    const win = fakeWindow();
    run(authSessionScript(REDIRECT), win);
    const pending = getAuthSessionHost(win)!.open("https://example.test/");
    const { id } = JSON.parse(win.posted[0]!) as { id: string };
    run(authSessionResolveScript(id, { ok: true, value: null }), win);
    await expect(pending).resolves.toBeNull();
  });

  it("rejects with the wrapper's error when the session could not open", async () => {
    const win = fakeWindow();
    run(authSessionScript(REDIRECT), win);
    const pending = getAuthSessionHost(win)!.open("https://example.test/");
    const { id } = JSON.parse(win.posted[0]!) as { id: string };
    run(
      authSessionResolveScript(id, { ok: false, error: "already open" }),
      win,
    );
    await expect(pending).rejects.toThrow("already open");
  });

  it("rejects rather than hangs when there is no bridge to post through", async () => {
    const win = fakeWindow();
    delete win.ReactNativeWebView;
    run(authSessionScript(REDIRECT), win);
    await expect(
      getAuthSessionHost(win)!.open("https://example.test/"),
    ).rejects.toThrow(/unavailable/);
  });
});

describe("isAuthSessionRequest", () => {
  const good = {
    type: AUTH_SESSION_REQUEST_TYPE,
    id: "a1",
    url: "https://www.dropbox.com/oauth2/authorize?client_id=k",
  };

  it("accepts a well-formed request", () => {
    expect(isAuthSessionRequest(good)).toBe(true);
  });

  it("ignores messages that are not ours", () => {
    expect(
      isAuthSessionRequest({ __checklistBridge: true, id: 1, method: "load" }),
    ).toBe(false);
    expect(isAuthSessionRequest({ ...good, type: "theme" })).toBe(false);
    expect(isAuthSessionRequest(null)).toBe(false);
    expect(isAuthSessionRequest("open")).toBe(false);
  });

  it("rejects a request with no correlation id", () => {
    expect(isAuthSessionRequest({ ...good, id: "" })).toBe(false);
    expect(isAuthSessionRequest({ ...good, id: 1 })).toBe(false);
  });

  it("opens nothing but an https page", () => {
    // The sheet is a real browser the reader types a password into.
    for (const url of [
      "http://www.dropbox.com/oauth2/authorize",
      "http://localhost:8261/",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "se.agilator.checklist://oauth",
      "https://",
      " https://www.dropbox.com/",
    ]) {
      expect(isAuthSessionRequest({ ...good, url })).toBe(false);
    }
    expect(isAuthSessionRequest({ ...good, url: 7 })).toBe(false);
  });
});

describe("authSessionResolveScript", () => {
  it("does not let a provider-controlled URL break out of the script", () => {
    const win = fakeWindow();
    let seen: unknown = null;
    win.__ossAuthSessionResolve = (_id: string, result: unknown) => {
      seen = result;
    };
    const nasty = `se.agilator.checklist://oauth?code=");alert(1);//&x=${String.fromCharCode(0x2028)}`;
    const script = authSessionResolveScript("a1", { ok: true, value: nasty });
    expect(script).not.toContain(String.fromCharCode(0x2028));
    run(script, win);
    expect(seen).toEqual({ ok: true, value: nasty });
  });
});
