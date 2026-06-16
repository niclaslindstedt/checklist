// Top-level storage wiring, as a hook. Selects the active
// `StorageAdapter` from the per-device backend preference, holds the
// cloud access tokens, completes the OAuth redirect on boot, and layers
// optional at-rest encryption on top. The checklist counterpart of the
// budget project's `useStorageBackend` / `boot-auth` pair, collapsed to
// fit an account-less, single-document app.
//
// Encryption note: there are no user accounts, so the encryption
// passphrase isn't derived from a login — it's set explicitly in
// Settings and held only in memory for the session. After a reload the
// app is "locked" (encryption is on but no passphrase is held) until the
// user re-enters it; the `locked` flag drives the unlock gate in `App`.

import { useCallback, useEffect, useMemo, useState } from "react";

import { createLogger } from "../dev/logger.ts";
import type { StorageAdapter, StoredSnapshot } from "./adapter.ts";
import {
  type BackendId,
  type EncryptionMode,
  clearDropboxRefreshToken,
  clearDropboxToken,
  clearGdriveToken,
  getBackend,
  getDropboxRefreshToken,
  getDropboxToken,
  getEncryption,
  getGdriveToken,
  setBackend as persistBackend,
  setDropboxRefreshToken,
  setDropboxToken,
  setEncryption as persistEncryption,
  setGdriveToken,
} from "./backend-preference.ts";
import { decryptEnvelope, encryptText, isEncryptedEnvelope } from "./crypto.ts";
import {
  completeDropboxAuth,
  createDropboxAdapter,
  hasPendingDropboxAuth,
  isDropboxConfigured,
} from "./dropbox/index.ts";
import { withEncryption } from "./encrypting/index.ts";
import {
  createGdriveAdapter,
  isGdriveConfigured,
  startGdriveAuth,
} from "./gdrive/index.ts";
import { BrowserLocalStorageAdapter } from "./local/index.ts";

const log = createLogger("storage");

export interface UseStorageBackend {
  /** The adapter to hand to `useChecklist`. A no-op placeholder while locked. */
  adapter: StorageAdapter;
  /** Which backend is selected. */
  backend: BackendId;
  /** Whether each cloud backend's app key / client id is built in. */
  dropboxConfigured: boolean;
  gdriveConfigured: boolean;
  /** Whether each cloud backend currently holds a usable token. */
  dropboxConnected: boolean;
  gdriveConnected: boolean;
  /** Encryption mode and whether a passphrase is held this session. */
  encryption: EncryptionMode;
  /** True when encryption is on but no passphrase is held yet (needs unlock). */
  locked: boolean;
  selectBrowser: () => void;
  connectDropbox: () => void;
  disconnectDropbox: () => void;
  connectGdrive: () => Promise<void>;
  disconnectGdrive: () => void;
  /** Turn encryption on with a fresh passphrase, re-wrapping stored bytes. */
  enableEncryption: (password: string) => Promise<void>;
  /** Turn encryption off, decrypting stored bytes back to plaintext. */
  disableEncryption: () => Promise<void>;
  /** Supply the passphrase for an already-encrypted store; throws if wrong. */
  unlock: (password: string) => Promise<void>;
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

// Placeholder used while the store is locked: never touches the real
// backend, so the encrypted bytes stay sealed and an accidental edit
// behind the unlock gate can't overwrite them. Resolves saves to a
// no-op rather than rejecting so no stray promise rejection surfaces.
function lockedAdapter(id: BackendId): StorageAdapter {
  return {
    id,
    label: "Locked",
    capabilities: new Set(),
    async load(): Promise<StoredSnapshot | null> {
      return null;
    },
    async save(text: string): Promise<StoredSnapshot> {
      log.warn("save ignored — store is locked");
      return { text };
    },
  };
}

export function useStorageBackend(): UseStorageBackend {
  const [backend, setBackendState] = useState<BackendId>(getBackend);
  const [dropboxToken, setDropboxTokenState] = useState<string | null>(
    getDropboxToken,
  );
  const [dropboxRefresh, setDropboxRefreshState] = useState<string | null>(
    getDropboxRefreshToken,
  );
  const [gdriveToken, setGdriveTokenState] = useState<string | null>(
    getGdriveToken,
  );
  const [encryption, setEncryptionState] =
    useState<EncryptionMode>(getEncryption);
  // Session-only passphrase. Never persisted — lost on reload by design.
  const [password, setPassword] = useState<string | null>(null);

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
        persistBackend("dropbox");
        setBackendState("dropbox");
      } catch (err) {
        log.error("boot: Dropbox OAuth completion failed", err);
      } finally {
        if (!cancelled) cleanAuthParamsFromUrl();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The unwrapped backend. Cloud adapters get fresh tokens on every
  // change so a reconnect rebuilds them. The Dropbox adapter persists any
  // silently-refreshed access token back to localStorage and state.
  const inner = useMemo<StorageAdapter>(() => {
    if (backend === "dropbox" && dropboxToken) {
      return createDropboxAdapter({
        accessToken: dropboxToken,
        refreshToken: dropboxRefresh,
        onAccessTokenRefreshed: (token) => {
          setDropboxToken(token);
          setDropboxTokenState(token);
        },
      });
    }
    if (backend === "gdrive" && gdriveToken) {
      return createGdriveAdapter(gdriveToken);
    }
    return new BrowserLocalStorageAdapter();
  }, [backend, dropboxToken, dropboxRefresh, gdriveToken]);

  const locked = encryption === "encrypted" && password === null;

  // The adapter handed to the app. Wrapped with encryption when on;
  // replaced by the locked placeholder until the passphrase is supplied.
  const adapter = useMemo<StorageAdapter>(() => {
    if (locked) return lockedAdapter(backend);
    if (encryption === "encrypted") {
      return withEncryption(inner, { current: password });
    }
    return inner;
  }, [inner, encryption, password, locked, backend]);

  const selectBrowser = useCallback(() => {
    persistBackend("browser");
    setBackendState("browser");
  }, []);

  const connectDropbox = useCallback(() => {
    // Redirects away; completion runs in the boot effect above.
    void import("./dropbox/index.ts").then((m) => m.startDropboxAuth());
  }, []);

  const disconnectDropbox = useCallback(() => {
    clearDropboxToken();
    clearDropboxRefreshToken();
    setDropboxTokenState(null);
    setDropboxRefreshState(null);
    persistBackend("browser");
    setBackendState("browser");
  }, []);

  const connectGdrive = useCallback(async () => {
    const token = await startGdriveAuth();
    setGdriveToken(token);
    setGdriveTokenState(token);
    persistBackend("gdrive");
    setBackendState("gdrive");
  }, []);

  const disconnectGdrive = useCallback(() => {
    clearGdriveToken();
    setGdriveTokenState(null);
    persistBackend("browser");
    setBackendState("browser");
  }, []);

  const enableEncryption = useCallback(
    async (next: string) => {
      if (!next) throw new Error("Passphrase is required");
      // Re-wrap whatever the inner backend currently holds so existing
      // plaintext becomes an envelope. A first run with no data is a
      // no-op beyond flipping the flag.
      const snap = await inner.load();
      if (snap && !isEncryptedEnvelope(snap.text)) {
        const payload = await encryptText(snap.text, next);
        await inner.save(payload, snap.revision);
      }
      persistEncryption("encrypted");
      setEncryptionState("encrypted");
      setPassword(next);
    },
    [inner],
  );

  const disableEncryption = useCallback(async () => {
    if (password === null) {
      throw new Error("Unlock before turning encryption off");
    }
    const snap = await inner.load();
    if (snap && isEncryptedEnvelope(snap.text)) {
      const plaintext = await decryptEnvelope(snap.text, password);
      await inner.save(plaintext, snap.revision);
    }
    persistEncryption("plaintext");
    setEncryptionState("plaintext");
    setPassword(null);
  }, [inner, password]);

  const unlock = useCallback(
    async (candidate: string) => {
      if (!candidate) throw new Error("Passphrase is required");
      // Verify by decrypting the stored envelope. Plaintext-at-rest (the
      // re-wrap never ran) can't be verified, so it unlocks optimistically.
      const snap = await inner.load();
      if (snap && isEncryptedEnvelope(snap.text)) {
        await decryptEnvelope(snap.text, candidate); // throws on wrong pass
      }
      setPassword(candidate);
    },
    [inner],
  );

  return {
    adapter,
    backend,
    dropboxConfigured: isDropboxConfigured(),
    gdriveConfigured: isGdriveConfigured(),
    dropboxConnected: dropboxToken !== null,
    gdriveConnected: gdriveToken !== null,
    encryption,
    locked,
    selectBrowser,
    connectDropbox,
    disconnectDropbox,
    connectGdrive,
    disconnectGdrive,
    enableEncryption,
    disableEncryption,
    unlock,
  };
}
