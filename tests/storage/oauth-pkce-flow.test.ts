// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  challengeFor,
  completeAuth,
  randomVerifier,
  refreshAccessToken,
  type OAuthConfig,
} from "../../src/storage/oauth-pkce.ts";

const config: OAuthConfig = {
  authBase: "https://provider.example/authorize",
  tokenEndpoint: "https://provider.example/token",
  clientId: "client-123",
  state: "dropbox",
  verifierKey: "checklist:pkce:dropbox",
  providerName: "Dropbox",
};

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("randomVerifier", () => {
  it("produces a base64url string above the spec minimum length", () => {
    const v = randomVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(v.length).toBeGreaterThanOrEqual(43);
  });

  it("produces a different value each call", () => {
    expect(randomVerifier()).not.toBe(randomVerifier());
  });
});

describe("challengeFor", () => {
  it("is a base64url SHA-256 digest, stable for the same verifier", async () => {
    const a = await challengeFor("verifier-abc");
    const b = await challengeFor("verifier-abc");
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("differs for different verifiers", async () => {
    expect(await challengeFor("one")).not.toBe(await challengeFor("two"));
  });
});

describe("completeAuth", () => {
  it("aborts when no PKCE verifier was stashed", async () => {
    const fetchImpl = vi.fn();
    await expect(completeAuth(config, "code", fetchImpl)).rejects.toThrow(
      /Missing PKCE verifier/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("exchanges the code, returning both tokens and consuming the verifier", async () => {
    sessionStorage.setItem(config.verifierKey, "the-verifier");
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ access_token: "at-1", refresh_token: "rt-1" }),
      );

    const result = await completeAuth(config, "auth-code", fetchImpl);

    expect(result).toEqual({ accessToken: "at-1", refreshToken: "rt-1" });
    // The single-use verifier is cleared so a replayed redirect can't reuse it.
    expect(sessionStorage.getItem(config.verifierKey)).toBeNull();

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(config.tokenEndpoint);
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("client_id")).toBe("client-123");
  });

  it("reports a null refresh token when the provider issues none", async () => {
    sessionStorage.setItem(config.verifierKey, "v");
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: "at-only" }));
    const result = await completeAuth(config, "c", fetchImpl);
    expect(result).toEqual({ accessToken: "at-only", refreshToken: null });
  });

  it("throws with the status on a non-OK token response", async () => {
    sessionStorage.setItem(config.verifierKey, "v");
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 400 }));
    await expect(completeAuth(config, "c", fetchImpl)).rejects.toThrow(
      /Dropbox token exchange failed: 400/,
    );
  });

  it("throws when the response is missing an access_token", async () => {
    sessionStorage.setItem(config.verifierKey, "v");
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ refresh_token: "rt" }));
    await expect(completeAuth(config, "c", fetchImpl)).rejects.toThrow(
      /missing access_token/,
    );
  });

  it("propagates a network error from the token exchange", async () => {
    sessionStorage.setItem(config.verifierKey, "v");
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(completeAuth(config, "c", fetchImpl)).rejects.toThrow(
      /offline/,
    );
  });
});

describe("refreshAccessToken", () => {
  it("trades a refresh token for a fresh access token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: "fresh" }));
    const token = await refreshAccessToken(config, "rt-1", fetchImpl);
    expect(token).toBe("fresh");

    const [, init] = fetchImpl.mock.calls[0]!;
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-1");
  });

  it("throws with the status on a non-OK refresh", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("bad", { status: 401 }));
    await expect(refreshAccessToken(config, "rt", fetchImpl)).rejects.toThrow(
      /Dropbox token refresh failed: 401/,
    );
  });

  it("throws when the refresh response has no access_token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await expect(refreshAccessToken(config, "rt", fetchImpl)).rejects.toThrow(
      /refresh response missing access_token/,
    );
  });

  it("propagates a network error from the refresh", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("dns"));
    await expect(refreshAccessToken(config, "rt", fetchImpl)).rejects.toThrow(
      /dns/,
    );
  });
});
