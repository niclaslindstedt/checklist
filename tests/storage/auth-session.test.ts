// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// @vitest-environment jsdom
//
// The phone half of the OAuth flow (`runAuthSessionAuth`). The wrapper only
// opens a sheet and hands back where it ended, so everything worth getting
// wrong is here: which URI the provider is told to redirect to, that the SAME
// URI is replayed at the token endpoint, that a sheet which ended anywhere but
// that URI (or with someone else's `state`) never gets a code spent, that a
// closed sheet reads as a cancellation rather than a failure, and that no
// attempt leaves a verifier behind.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_SESSION_HOST_PROPERTY,
  getAuthSessionHost,
  isAuthCancelled,
  type AuthSessionHost,
} from "../../src/storage/auth-session.ts";
import type { OAuthConfig } from "../../src/storage/oauth-pkce.ts";
import { runAuthSessionAuth } from "../../src/storage/oauth-pkce.ts";

const REDIRECT = "se.agilator.checklist://oauth";

const CONFIG: OAuthConfig = {
  authBase: "https://provider.test/oauth2/authorize",
  tokenEndpoint: "https://provider.test/oauth2/token",
  clientId: "test-client",
  state: "dropbox",
  verifierKey: "test:pkce:verifier",
  providerName: "Dropbox",
  extraAuthParams: { token_access_type: "offline" },
};

function tokenResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** A host whose sheet ends on `landed` (null: the reader closed it). */
function hostEndingOn(landed: string | null) {
  const open = vi.fn(async (_url: string) => landed);
  const host: AuthSessionHost = { version: 1, redirectUri: REDIRECT, open };
  return { host, open };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("runAuthSessionAuth", () => {
  it("sends the provider to the host's URI and replays it at the token endpoint", async () => {
    const { host, open } = hostEndingOn(
      `${REDIRECT}?code=auth-code&state=dropbox`,
    );
    const fetchImpl = vi.fn(async () =>
      tokenResponse({ access_token: "at", refresh_token: "rt" }),
    );

    const result = await runAuthSessionAuth(
      CONFIG,
      host,
      fetchImpl as unknown as typeof fetch,
    );

    expect(result).toEqual({ accessToken: "at", refreshToken: "rt" });
    expect(open).toHaveBeenCalledTimes(1);
    const url = new URL(open.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe(CONFIG.authBase);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe("dropbox");
    expect(url.searchParams.get("token_access_type")).toBe("offline");

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("redirect_uri")).toBe(REDIRECT);
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("code_verifier")).toBeTruthy();
    expect(sessionStorage.getItem(CONFIG.verifierKey)).toBeNull();
  });

  it("reads a closed sheet as a cancellation, not a failure", async () => {
    const { host } = hostEndingOn(null);
    const fetchImpl = vi.fn();

    const err = await runAuthSessionAuth(
      CONFIG,
      host,
      fetchImpl as unknown as typeof fetch,
    ).catch((e: unknown) => e);

    expect(isAuthCancelled(err)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CONFIG.verifierKey)).toBeNull();
  });

  it("never reads a code out of a sheet that ended somewhere else", async () => {
    const { host } = hostEndingOn(
      "https://evil.test/oauth?code=auth-code&state=dropbox",
    );
    const fetchImpl = vi.fn();

    await expect(
      runAuthSessionAuth(CONFIG, host, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/somewhere other than the redirect URI/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never spends a code that came back with someone else's state", async () => {
    const { host } = hostEndingOn(`${REDIRECT}?code=auth-code&state=nope`);
    const fetchImpl = vi.fn();

    await expect(
      runAuthSessionAuth(CONFIG, host, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/unexpected state/i);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CONFIG.verifierKey)).toBeNull();
  });

  it("surfaces a declined consent with the provider's own description", async () => {
    const { host } = hostEndingOn(
      `${REDIRECT}?error=access_denied&error_description=No%20thanks&state=dropbox`,
    );

    const err = await runAuthSessionAuth(CONFIG, host).catch((e: unknown) => e);
    expect(String(err)).toMatch(/No thanks/);
    expect(isAuthCancelled(err)).toBe(false);
  });

  it("drops the verifier when the sheet could not open", async () => {
    const host: AuthSessionHost = {
      version: 1,
      redirectUri: REDIRECT,
      open: () => Promise.reject(new Error("already open")),
    };

    await expect(runAuthSessionAuth(CONFIG, host)).rejects.toThrow(
      "already open",
    );
    expect(sessionStorage.getItem(CONFIG.verifierKey)).toBeNull();
  });
});

describe("getAuthSessionHost", () => {
  const withHost = (value: unknown) => ({
    [AUTH_SESSION_HOST_PROPERTY]: value,
  });

  it("finds a well-formed host", () => {
    const { host } = hostEndingOn(null);
    expect(getAuthSessionHost(withHost(host))).toBe(host);
  });

  it("finds nothing in a plain browser or the desktop shell", () => {
    expect(getAuthSessionHost({})).toBeNull();
    expect(getAuthSessionHost(undefined)).toBeNull();
  });

  it("ignores a host of another version or with no redirect URI", () => {
    const open = async () => null;
    expect(
      getAuthSessionHost(withHost({ version: 2, redirectUri: REDIRECT, open })),
    ).toBeNull();
    expect(
      getAuthSessionHost(withHost({ version: 1, redirectUri: "", open })),
    ).toBeNull();
    expect(
      getAuthSessionHost(withHost({ version: 1, redirectUri: REDIRECT })),
    ).toBeNull();
  });
});
