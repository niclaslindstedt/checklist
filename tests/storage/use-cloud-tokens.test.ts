// @vitest-environment jsdom
// Direct coverage for `useCloudTokens`, peeled out of `useStorageBackend` so the
// Dropbox OAuth boot-redirect completion, the access/refresh token state, and
// both cloud backends' connect / disconnect verbs are testable against the
// persisted token store instead of a live OAuth grant — which Vitest can't
// reach. The Dropbox and Google Drive auth modules are mocked at their module
// boundary; the tokens persist through the real `backend-preference` store, so
// each test clears localStorage and asserts against its getters.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDropboxRefreshToken,
  getDropboxToken,
  getGdriveToken,
  setDropboxRefreshToken,
  setDropboxToken,
  setGdriveToken,
} from "../../src/storage/backend-preference.ts";

// Shared mock state, hoisted so the `vi.mock` factories below can close over it.
const h = vi.hoisted(() => ({
  completeDropboxAuth:
    vi.fn<
      (code: string) => Promise<{ accessToken: string; refreshToken?: string }>
    >(),
  hasPendingDropboxAuth: vi.fn<() => boolean>(),
  startDropboxAuth: vi.fn<() => void>(),
  startGdriveAuth: vi.fn<() => Promise<string>>(),
}));

vi.mock("../../src/storage/dropbox/index.ts", () => ({
  completeDropboxAuth: h.completeDropboxAuth,
  hasPendingDropboxAuth: h.hasPendingDropboxAuth,
  startDropboxAuth: h.startDropboxAuth,
}));

vi.mock("../../src/storage/gdrive/gis-oauth.ts", () => ({
  startGdriveAuth: h.startGdriveAuth,
}));

import { useCloudTokens } from "../../src/storage/useCloudTokens.ts";

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
  h.startGdriveAuth.mockReset();
});

afterEach(() => {
  localStorage.clear();
  setSearch("");
});

describe("useCloudTokens", () => {
  it("boots disconnected when nothing is persisted", () => {
    const { result } = renderHook(() => useCloudTokens(vi.fn()));
    expect(result.current.dropboxToken).toBeNull();
    expect(result.current.dropboxRefresh).toBeNull();
    expect(result.current.gdriveToken).toBeNull();
  });

  it("rehydrates persisted tokens on boot", () => {
    setDropboxToken("dbx-access");
    setDropboxRefreshToken("dbx-refresh");
    setGdriveToken("gd-access");
    const { result } = renderHook(() => useCloudTokens(vi.fn()));
    expect(result.current.dropboxToken).toBe("dbx-access");
    expect(result.current.dropboxRefresh).toBe("dbx-refresh");
    expect(result.current.gdriveToken).toBe("gd-access");
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

  it("onDropboxAccessTokenRefreshed persists and reflects a refreshed token", () => {
    setDropboxToken("stale-access");
    const { result } = renderHook(() => useCloudTokens(vi.fn()));

    act(() => result.current.onDropboxAccessTokenRefreshed("rotated-access"));

    expect(result.current.dropboxToken).toBe("rotated-access");
    expect(getDropboxToken()).toBe("rotated-access");
  });

  it("connectDropbox kicks off the OAuth redirect", async () => {
    const { result } = renderHook(() => useCloudTokens(vi.fn()));
    act(() => result.current.connectDropbox());
    // The redirect starter is loaded via a dynamic import; let it resolve.
    await waitFor(() => expect(h.startDropboxAuth).toHaveBeenCalled());
  });

  it("disconnectDropbox clears the tokens and falls back to the browser", () => {
    setDropboxToken("dbx-access");
    setDropboxRefreshToken("dbx-refresh");
    const switchToBackend = vi.fn();
    const { result } = renderHook(() => useCloudTokens(switchToBackend));

    act(() => result.current.disconnectDropbox());

    expect(result.current.dropboxToken).toBeNull();
    expect(result.current.dropboxRefresh).toBeNull();
    expect(getDropboxToken()).toBeNull();
    expect(getDropboxRefreshToken()).toBeNull();
    expect(switchToBackend).toHaveBeenCalledWith("browser");
  });

  it("connectGdrive stores the popup token and switches to it", async () => {
    h.startGdriveAuth.mockResolvedValue("gd-fresh");
    const switchToBackend = vi.fn();
    const { result } = renderHook(() => useCloudTokens(switchToBackend));

    await act(async () => {
      await result.current.connectGdrive();
    });

    expect(result.current.gdriveToken).toBe("gd-fresh");
    expect(getGdriveToken()).toBe("gd-fresh");
    expect(switchToBackend).toHaveBeenCalledWith("gdrive");
  });

  it("disconnectGdrive clears the token and falls back to the browser", () => {
    setGdriveToken("gd-access");
    const switchToBackend = vi.fn();
    const { result } = renderHook(() => useCloudTokens(switchToBackend));

    act(() => result.current.disconnectGdrive());

    expect(result.current.gdriveToken).toBeNull();
    expect(getGdriveToken()).toBeNull();
    expect(switchToBackend).toHaveBeenCalledWith("browser");
  });
});
