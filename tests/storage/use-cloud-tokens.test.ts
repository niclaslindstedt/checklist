// @vitest-environment jsdom
// Direct coverage for `useCloudTokens`, peeled out of `useStorageBackend` so the
// Dropbox OAuth boot-redirect completion, the access/refresh token state, and
// both cloud backends' connect / disconnect verbs are testable against the
// persisted token store instead of a live OAuth grant — which Vitest can't
// reach. The Dropbox auth modules are mocked at their module
// boundary; the tokens persist through the real `backend-preference` store, so
// each test clears localStorage and asserts against its getters.
import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDropboxRefreshToken,
  getDropboxToken,
  setDropboxRefreshToken,
  setDropboxToken,
} from "../../src/storage/backend-preference.ts";

// Shared mock state, hoisted so the `vi.mock` factories below can close over it.
const h = vi.hoisted(() => ({
  completeDropboxAuth:
    vi.fn<
      (code: string) => Promise<{ accessToken: string; refreshToken?: string }>
    >(),
  connectDropboxAuthSession:
    vi.fn<
      (host: unknown) => Promise<{ accessToken: string; refreshToken?: string }>
    >(),
  hasPendingDropboxAuth: vi.fn<() => boolean>(),
  startDropboxAuth: vi.fn<() => void>(),
}));

vi.mock("../../src/storage/dropbox/index.ts", () => ({
  completeDropboxAuth: h.completeDropboxAuth,
  connectDropboxAuthSession: h.connectDropboxAuthSession,
  hasPendingDropboxAuth: h.hasPendingDropboxAuth,
  startDropboxAuth: h.startDropboxAuth,
}));

import { useCloudTokens } from "../../src/storage/useCloudTokens.ts";
import {
  AUTH_SESSION_HOST_PROPERTY,
  AuthCancelledError,
} from "../../src/storage/auth-session.ts";

// Point the address bar at `search` so the boot effect reads a `?code=` (or
// not). Reset to a clean path between tests so a stale code doesn't leak.
function setSearch(search: string): void {
  window.history.replaceState(null, "", `/${search}`);
}

beforeEach(() => {
  localStorage.clear();
  setSearch("");
  h.completeDropboxAuth.mockReset();
  h.hasPendingDropboxAuth.mockReset().mockReturnValue(false);
  h.startDropboxAuth.mockReset();
  h.connectDropboxAuthSession.mockReset();
});

afterEach(() => {
  localStorage.clear();
  setSearch("");
  delete (window as unknown as Record<string, unknown>)[
    AUTH_SESSION_HOST_PROPERTY
  ];
});

/** What the phone wrapper installs: a host that can open a sign-in sheet. */
function installAuthSessionHost() {
  const host = {
    version: 1,
    redirectUri: "se.agilator.checklist://oauth",
    open: vi.fn(),
  };
  (window as unknown as Record<string, unknown>)[AUTH_SESSION_HOST_PROPERTY] =
    host;
  return host;
}

describe("useCloudTokens", () => {
  it("boots disconnected when nothing is persisted", () => {
    const { result } = renderHook(() => useCloudTokens(vi.fn()));
    expect(result.current.dropboxToken).toBeNull();
    expect(result.current.dropboxRefresh).toBeNull();
  });

  it("rehydrates persisted tokens on boot", () => {
    setDropboxToken("dbx-access");
    setDropboxRefreshToken("dbx-refresh");
    const { result } = renderHook(() => useCloudTokens(vi.fn()));
    expect(result.current.dropboxToken).toBe("dbx-access");
    expect(result.current.dropboxRefresh).toBe("dbx-refresh");
  });

  it("completes a Dropbox OAuth redirect on boot and switches to it", async () => {
    setSearch("?code=auth-code&state=xyz");
    h.hasPendingDropboxAuth.mockReturnValue(true);
    h.completeDropboxAuth.mockResolvedValue({
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
    });
    const switchToBackend = vi.fn();

    const { result } = renderHook(() => useCloudTokens(switchToBackend));

    await waitFor(() =>
      expect(result.current.dropboxToken).toBe("fresh-access"),
    );
    expect(result.current.dropboxRefresh).toBe("fresh-refresh");
    expect(h.completeDropboxAuth).toHaveBeenCalledWith("auth-code");
    expect(switchToBackend).toHaveBeenCalledWith("dropbox");
    // Tokens persisted so a reload stays connected.
    expect(getDropboxToken()).toBe("fresh-access");
    expect(getDropboxRefreshToken()).toBe("fresh-refresh");
    // The spent `code` / `state` are scrubbed from the address bar.
    expect(window.location.search).toBe("");
  });

  it("completes the redirect without a refresh token (none issued)", async () => {
    setSearch("?code=auth-code");
    h.hasPendingDropboxAuth.mockReturnValue(true);
    h.completeDropboxAuth.mockResolvedValue({ accessToken: "only-access" });
    const switchToBackend = vi.fn();

    const { result } = renderHook(() => useCloudTokens(switchToBackend));

    await waitFor(() =>
      expect(result.current.dropboxToken).toBe("only-access"),
    );
    expect(result.current.dropboxRefresh).toBeNull();
    expect(getDropboxRefreshToken()).toBeNull();
  });

  it("ignores the boot redirect when no auth is pending", async () => {
    setSearch("?code=auth-code");
    h.hasPendingDropboxAuth.mockReturnValue(false);
    const switchToBackend = vi.fn();

    const { result } = renderHook(() => useCloudTokens(switchToBackend));

    // Give any (wrongly-scheduled) async completion a chance to run.
    await Promise.resolve();
    expect(h.completeDropboxAuth).not.toHaveBeenCalled();
    expect(result.current.dropboxToken).toBeNull();
    expect(switchToBackend).not.toHaveBeenCalled();
  });

  it("does nothing on boot without a `?code=`", async () => {
    h.hasPendingDropboxAuth.mockReturnValue(true);
    const switchToBackend = vi.fn();
    renderHook(() => useCloudTokens(switchToBackend));
    await Promise.resolve();
    expect(h.completeDropboxAuth).not.toHaveBeenCalled();
    expect(switchToBackend).not.toHaveBeenCalled();
  });

  it("leaves the store disconnected when completion fails", async () => {
    setSearch("?code=bad-code");
    h.hasPendingDropboxAuth.mockReturnValue(true);
    h.completeDropboxAuth.mockRejectedValue(new Error("exchange failed"));
    const switchToBackend = vi.fn();

    const { result } = renderHook(() => useCloudTokens(switchToBackend));

    await waitFor(() => expect(h.completeDropboxAuth).toHaveBeenCalled());
    expect(result.current.dropboxToken).toBeNull();
    expect(switchToBackend).not.toHaveBeenCalledWith("dropbox");
    // The spent code is still scrubbed so a refresh doesn't replay it.
    expect(window.location.search).toBe("");
  });

  it("onDropboxAccessTokenRefreshed persists a refreshed token", () => {
    setDropboxToken("stale-access");
    const { result } = renderHook(() => useCloudTokens(vi.fn()));

    act(() => {
      result.current.onDropboxAccessTokenRefreshed("rotated-access");
    });

    expect(getDropboxToken()).toBe("rotated-access");
    expect(result.current.readDropboxToken()).toBe("rotated-access");
  });

  // Regression: a silent 401 refresh used to move `dropboxToken` state, which
  // rebuilt the backend selection → factory → adapter. An adapter swap makes
  // `useChecklistSync` re-read the whole document, and that read raced the save
  // the 401 had interrupted — it returned the pre-save bytes and replaced the
  // on-screen document with them, so a just-typed item disappeared. Rotating a
  // token is not a backend change; `dropboxToken` must sit still across one.
  it("does not move dropboxToken state when a refresh rotates the token", () => {
    setDropboxToken("stale-access");
    setDropboxRefreshToken("dbx-refresh");
    const { result } = renderHook(() => useCloudTokens(vi.fn()));
    const before = result.current.dropboxToken;

    act(() => {
      result.current.onDropboxAccessTokenRefreshed("rotated-access");
    });

    expect(result.current.dropboxToken).toBe(before);
    expect(result.current.dropboxToken).toBe("stale-access");
    // Still connected, and the rotated token is what callers actually use.
    expect(result.current.readDropboxToken()).toBe("rotated-access");
  });

  // The other half of the same regression, stated as the invariant that
  // actually matters: every value `useStorageBackend`'s backend-selection memo
  // depends on must keep its identity across a silent refresh. If any of them
  // moves, the memo rebuilds, a fresh adapter is constructed, and the document
  // re-read that follows is what loses the edit.
  it("keeps every backend-selection input stable across a silent refresh", () => {
    setDropboxToken("stale-access");
    setDropboxRefreshToken("dbx-refresh");
    const { result } = renderHook(() => useCloudTokens(vi.fn()));
    const before = {
      dropboxToken: result.current.dropboxToken,
      dropboxRefresh: result.current.dropboxRefresh,
      onDropboxAccessTokenRefreshed:
        result.current.onDropboxAccessTokenRefreshed,
      readDropboxToken: result.current.readDropboxToken,
    };

    act(() => {
      result.current.onDropboxAccessTokenRefreshed("rotated-access");
    });

    expect(result.current.dropboxToken).toBe(before.dropboxToken);
    expect(result.current.dropboxRefresh).toBe(before.dropboxRefresh);
    expect(result.current.onDropboxAccessTokenRefreshed).toBe(
      before.onDropboxAccessTokenRefreshed,
    );
    expect(result.current.readDropboxToken).toBe(before.readDropboxToken);
  });

  it("readDropboxToken falls back to the connection token before any refresh", () => {
    setDropboxToken("dbx-access");
    const { result } = renderHook(() => useCloudTokens(vi.fn()));

    expect(result.current.readDropboxToken()).toBe("dbx-access");
  });

  it("readDropboxToken goes null once Dropbox is disconnected", () => {
    setDropboxToken("dbx-access");
    setDropboxRefreshToken("dbx-refresh");
    const { result } = renderHook(() => useCloudTokens(vi.fn()));

    act(() => {
      result.current.onDropboxAccessTokenRefreshed("rotated-access");
    });
    act(() => {
      result.current.disconnectDropbox();
    });

    expect(result.current.readDropboxToken()).toBeNull();
  });

  it("connectDropbox kicks off the OAuth redirect", async () => {
    const { result } = renderHook(() => useCloudTokens(vi.fn()));
    act(() => {
      result.current.connectDropbox();
    });
    // The redirect starter is loaded via a dynamic import; let it resolve.
    await waitFor(() => expect(h.startDropboxAuth).toHaveBeenCalled());
  });

  it("connectDropbox signs in through the phone's session host, in place", async () => {
    const host = installAuthSessionHost();
    h.connectDropboxAuthSession.mockResolvedValue({
      accessToken: "phone-access",
      refreshToken: "phone-refresh",
    });
    const switchToBackend = vi.fn();
    const { result } = renderHook(() => useCloudTokens(switchToBackend));

    act(() => {
      result.current.connectDropbox();
    });

    await waitFor(() =>
      expect(result.current.dropboxToken).toBe("phone-access"),
    );
    expect(h.connectDropboxAuthSession).toHaveBeenCalledWith(host);
    // No redirect: the page never navigates away from itself on the phone.
    expect(h.startDropboxAuth).not.toHaveBeenCalled();
    expect(switchToBackend).toHaveBeenCalledWith("dropbox");
    expect(getDropboxRefreshToken()).toBe("phone-refresh");
  });

  it("a closed sign-in sheet leaves the app where it was", async () => {
    installAuthSessionHost();
    h.connectDropboxAuthSession.mockRejectedValue(
      new AuthCancelledError("Dropbox"),
    );
    const switchToBackend = vi.fn();
    const { result } = renderHook(() => useCloudTokens(switchToBackend));

    act(() => {
      result.current.connectDropbox();
    });

    await waitFor(() => expect(h.connectDropboxAuthSession).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current.dropboxToken).toBeNull();
    expect(switchToBackend).not.toHaveBeenCalled();
    expect(h.startDropboxAuth).not.toHaveBeenCalled();
  });

  it("disconnectDropbox clears the tokens and falls back to the browser", () => {
    setDropboxToken("dbx-access");
    setDropboxRefreshToken("dbx-refresh");
    const switchToBackend = vi.fn();
    const { result } = renderHook(() => useCloudTokens(switchToBackend));

    act(() => {
      result.current.disconnectDropbox();
    });

    expect(result.current.dropboxToken).toBeNull();
    expect(result.current.dropboxRefresh).toBeNull();
    expect(getDropboxToken()).toBeNull();
    expect(getDropboxRefreshToken()).toBeNull();
    expect(switchToBackend).toHaveBeenCalledWith("browser");
  });
});
