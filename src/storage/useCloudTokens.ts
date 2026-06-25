// Cloud-credential lifecycle as a React hook: owns the Dropbox access /
// refresh tokens and the Google Drive access token, completes the Dropbox
// OAuth redirect on boot, and carries the connect / disconnect verbs for both
// cloud backends. Peeled out of `useStorageBackend` so the credential flow is
// unit-testable against the persisted token store instead of a live OAuth
// grant, mirroring how `useEncryption`, `useNamespaceRegistry`, and
// `useFolderHandle` were extracted.
//
// Google Drive uses a popup whose token resolves inline in `connectGdrive`;
// Dropbox redirects away and lands back on boot with a `?code=`, which the
// boot effect here exchanges for tokens. Both connect paths persist the
// token, flip the in-memory backend selection via the passed-in
// `switchToBackend`, and raise the `cloudWalker` achievement inline so the
// catalog test's static `unlock("<id>")` scan still proves it's wired.

import { useCallback, useEffect, useState } from "react";

import { unlock as unlockAchievement } from "../achievements/bus.ts";
import { createLogger } from "../dev/logger.ts";
import {
  type BackendId,
  clearDropboxTokens,
  clearGdriveToken,
  getDropboxRefreshToken,
  getDropboxToken,
  getGdriveToken,
  setDropboxRefreshToken,
  setDropboxToken,
  setGdriveToken,
} from "./backend-preference.ts";
import {
  completeDropboxAuth,
  hasPendingDropboxAuth,
} from "./dropbox/index.ts";
import { startGdriveAuth } from "./gdrive/index.ts";

const log = createLogger("storage");

export interface CloudTokens {
  /** The Dropbox access token, or null when not connected. */
  dropboxToken: string | null;
  /** The Dropbox refresh token, or null when not connected / not issued. */
  dropboxRefresh: string | null;
  /** The Google Drive access token, or null when not connected. */
  gdriveToken: string | null;
  /**
   * Persist and reflect a Dropbox access token the adapter refreshed silently
   * mid-session (the selection's `onAccessTokenRefreshed` hook). Kept here so
   * the refreshed token lands in both localStorage and this hook's state.
   */
  onDropboxAccessTokenRefreshed: (token: string) => void;
  /** Start the Dropbox OAuth redirect (completion runs in the boot effect). */
  connectDropbox: () => void;
  /** Forget the Dropbox tokens and fall back to the browser store. */
  disconnectDropbox: () => void;
  /** Open the Google Drive auth popup, store the token, and switch to it. */
  connectGdrive: () => Promise<void>;
  /** Forget the Google Drive token and fall back to the browser store. */
  disconnectGdrive: () => void;
}

// Strip the OAuth redirect's query params (`code`, `state`, `scope`) from
// the address bar without reloading, so a refresh doesn't replay a
// spent authorization code.
function cleanAuthParamsFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    let touched = false;
    for (const key of ["code", "state", "scope"]) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        touched = true;
      }
    }
    if (touched) {
      window.history.replaceState(null, "", url.toString());
    }
  } catch (err) {
    log.warn("failed to clean auth params from URL", err);
  }
}

// `switchToBackend` persists the per-device backend choice and flips the
// in-memory selection; the cloud connect / disconnect verbs route through it
// exactly as the folder verbs do, so the boot effect and both connects land on
// the same single switch primitive.
export function useCloudTokens(
  switchToBackend: (id: BackendId) => void,
): CloudTokens {
  const [dropboxToken, setDropboxTokenState] = useState<string | null>(
    getDropboxToken,
  );
  const [dropboxRefresh, setDropboxRefreshState] = useState<string | null>(
    getDropboxRefreshToken,
  );
  const [gdriveToken, setGdriveTokenState] = useState<string | null>(
    getGdriveToken,
  );

  // Complete a Dropbox OAuth redirect on boot. Google Drive uses a popup
  // (resolved inline in `connectGdrive`), so only Dropbox lands back here
  // with a `?code=`.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code || !hasPendingDropboxAuth()) return;
    let cancelled = false;
    void (async () => {
      try {
        log.info("boot: completing Dropbox OAuth redirect");
        const result = await completeDropboxAuth(code);
        if (cancelled) return;
        setDropboxToken(result.accessToken);
        setDropboxTokenState(result.accessToken);
        if (result.refreshToken) {
          setDropboxRefreshToken(result.refreshToken);
          setDropboxRefreshState(result.refreshToken);
        }
        switchToBackend("dropbox");
        unlockAchievement("cloudWalker");
      } catch (err) {
        log.error("boot: Dropbox OAuth completion failed", err);
      } finally {
        if (!cancelled) cleanAuthParamsFromUrl();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [switchToBackend]);

  const onDropboxAccessTokenRefreshed = useCallback((token: string) => {
    setDropboxToken(token);
    setDropboxTokenState(token);
  }, []);

  const connectDropbox = useCallback(() => {
    // Redirects away; completion (and the `cloudWalker` unlock) runs in the
    // boot effect above — a unlock queued here wouldn't survive the redirect.
    void import("./dropbox/index.ts").then((m) => m.startDropboxAuth());
  }, []);

  const disconnectDropbox = useCallback(() => {
    clearDropboxTokens();
    setDropboxTokenState(null);
    setDropboxRefreshState(null);
    switchToBackend("browser");
  }, [switchToBackend]);

  const connectGdrive = useCallback(async () => {
    const token = await startGdriveAuth();
    setGdriveToken(token);
    setGdriveTokenState(token);
    switchToBackend("gdrive");
    unlockAchievement("cloudWalker");
  }, [switchToBackend]);

  const disconnectGdrive = useCallback(() => {
    clearGdriveToken();
    setGdriveTokenState(null);
    switchToBackend("browser");
  }, [switchToBackend]);

  return {
    dropboxToken,
    dropboxRefresh,
    gdriveToken,
    onDropboxAccessTokenRefreshed,
    connectDropbox,
    disconnectDropbox,
    connectGdrive,
    disconnectGdrive,
  };
}
