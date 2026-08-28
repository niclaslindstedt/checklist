// Cloud-credential lifecycle as a hook: owns the Dropbox access /
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
import { completeDropboxAuth, hasPendingDropboxAuth } from "./dropbox/index.ts";
import { startGdriveAuth } from "./gdrive/gis-oauth.ts";

const log = createLogger("storage");

export interface CloudTokens {
  /** The Dropbox access token, or null when not connected. */
  dropboxToken: string | null;
  /** The Dropbox refresh token, or null when not connected / not issued. */
  dropboxRefresh: string | null;
  /** The Google Drive access token, or null when not connected. */
  gdriveToken: string | null;
  /**
   * Persist a Dropbox access token the adapter refreshed silently mid-session
   * (the selection's `onAccessTokenRefreshed` hook).
   *
   * Deliberately does **not** move `dropboxToken` state. The live adapter
   * already holds the rotated token — `createAuthedFetch` keeps it in a
   * closure and swaps it in place — so re-rendering with it would only churn
   * the adapter's *identity*, and an adapter swap tears down and re-reads the
   * whole document (see `useChecklistSync`'s load effect). That read races the
   * save the 401 interrupted: it returns the pre-save bytes, replaces the
   * on-screen document with them, and the just-typed item vanishes. Rotating
   * an access token is not a backend change, so it must not look like one.
   */
  onDropboxAccessTokenRefreshed: (token: string) => void;
  /**
   * The freshest Dropbox access token — the silently-rotated one when a
   * refresh has happened this session, else the connection's. Callers that
   * need a token to *use* (building a store, deleting a namespace's bytes)
   * read it through here; `dropboxToken` only answers "is Dropbox connected?".
   */
  readDropboxToken: () => string | null;
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

  // Persisting is the whole job: `setDropboxToken` writes the rotated token to
  // localStorage, which `readDropboxToken` reads back, so a later adapter
  // rebuild (namespace switch, reconnect) picks it up without this hook having
  // to re-render — and without churning the adapter now. See the interface doc.
  const onDropboxAccessTokenRefreshed = useCallback((token: string) => {
    setDropboxToken(token);
  }, []);

  // localStorage is the durable home of the access token and every write path
  // keeps it current: connect and the silent refresh both persist, disconnect
  // clears. So it — not the `dropboxToken` render state, which intentionally
  // sits still across a refresh — is where the freshest value lives.
  const readDropboxToken = useCallback(
    () => getDropboxToken() ?? dropboxToken,
    [dropboxToken],
  );

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
    readDropboxToken,
    connectDropbox,
    disconnectDropbox,
    connectGdrive,
    disconnectGdrive,
  };
}
