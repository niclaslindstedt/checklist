// Per-device preferences that select which `StorageAdapter` backs the
// active document — and the cloud access tokens that unlock the cloud
// backends. Kept in localStorage on purpose: putting the backend choice
// inside the document would be a chicken-and-egg loop (the bytes select
// the place that holds the bytes). Ported from the budget project's
// `backend-preference.ts`, collapsed to a single-user model (the
// checklist has no accounts) and a thin localStorage shim.

import { DROPBOX_BUILT, LOCAL_FOLDER_BUILT } from "../build-env.ts";
import { createLogger } from "../dev/logger.ts";
import { namespaceLocalKey } from "./namespaces.ts";
import { isICloudAvailable } from "./native-bridge.ts";

const log = createLogger("backend-pref");

export type BackendId = "browser" | "folder" | "dropbox" | "icloud";

// Whether stored bytes are wrapped in the AES-GCM envelope before being
// handed to the adapter. Defaults to "plaintext" — encryption is an
// explicit opt-in from Settings, and there are no accounts to inherit a
// password from.
export type EncryptionMode = "encrypted" | "plaintext";

const BACKEND_KEY = "checklist:backend";
const DROPBOX_TOKEN_KEY = "checklist:dropbox:token";
// Long-lived companion to the short-lived access token. Stored under its
// own key so a legacy install (access token only) round-trips unchanged.
const DROPBOX_REFRESH_KEY = "checklist:dropbox:refresh";
// Dropbox is gone as a backend. The key stays named here so the token a
// device may still hold can be cleared rather than left sitting in storage.
const RETIRED_GDRIVE_TOKEN_KEY = "checklist:gdrive:token";
const ENCRYPTION_KEY = "checklist:encryption";

function read(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch (err) {
    log.warn(`write failed for ${key}`, err);
  }
}

function clear(key: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

/** Drop the access token of the retired Dropbox backend, once. */
export function clearRetiredGdriveToken(): void {
  clear(RETIRED_GDRIVE_TOKEN_KEY);
}

export function getBackend(): BackendId {
  const raw = read(BACKEND_KEY);
  if (raw === "dropbox") {
    if (DROPBOX_BUILT) return "dropbox";
    // The phone app no longer offers Dropbox. An install that had it selected
    // (a test build from before) moves to this device, keeping what it last
    // synced, and the lists in the user's Dropbox are left as they are.
    retireDropbox();
    return "browser";
  }
  // Dropbox was removed as a backend; a device that had it selected
  // falls through to browser storage, where `adoptRetiredGdriveDocument` in
  // backend-factory.ts has already put its last synced copy.
  // The phone app offers no local folder (`LOCAL_FOLDER_BUILT`), and its
  // WebView could never pick one, so the lists of a phone install with a
  // stored folder choice are on this device all along: read it as this device.
  if (raw === "folder") return LOCAL_FOLDER_BUILT ? "folder" : "browser";
  // iCloud is only selectable inside the iOS native wrapper. All three web
  // deploy slots share one origin (and localStorage), so a stored "icloud"
  // preference could otherwise follow the user into a plain browser where the
  // bridge doesn't exist — downgrade to browser unless the bridge is live.
  if (raw === "icloud" && isICloudAvailable()) return "icloud";
  // Legacy value "local" predates the rename to "browser" — silently
  // migrate. Any unknown / missing value also falls through to browser.
  return "browser";
}

const DROPBOX_CACHE_PREFIX = "checklist:cache:dropbox:";

// Move a phone install off Dropbox, once: each namespace's offline copy of
// its Dropbox lists (`withLocalCache`, the same bytes the device backend
// reads, encrypted or not) becomes that namespace's device document wherever
// the device has none, then the choice and the tokens are cleared.
function retireDropbox(): void {
  try {
    if (typeof localStorage === "undefined") return;
    const cacheKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DROPBOX_CACHE_PREFIX)) cacheKeys.push(key);
    }
    for (const key of cacheKeys) {
      const target = namespaceLocalKey(key.slice(DROPBOX_CACHE_PREFIX.length));
      const cached = JSON.parse(localStorage.getItem(key) ?? "null") as {
        text?: unknown;
      } | null;
      if (
        localStorage.getItem(target) === null &&
        typeof cached?.text === "string"
      ) {
        localStorage.setItem(target, cached.text);
        log.info(`adopted the Dropbox copy of [${target}] on this device`);
      }
    }
  } catch (err) {
    log.warn("could not adopt the Dropbox copy", err);
  }
  write(BACKEND_KEY, "browser");
  clearDropboxTokens();
}

export function setBackend(backend: BackendId): void {
  write(BACKEND_KEY, backend);
}

export function getDropboxToken(): string | null {
  return read(DROPBOX_TOKEN_KEY);
}

export function setDropboxToken(token: string): void {
  write(DROPBOX_TOKEN_KEY, token);
}

export function clearDropboxToken(): void {
  clear(DROPBOX_TOKEN_KEY);
}

export function getDropboxRefreshToken(): string | null {
  return read(DROPBOX_REFRESH_KEY);
}

export function setDropboxRefreshToken(token: string): void {
  write(DROPBOX_REFRESH_KEY, token);
}

export function clearDropboxRefreshToken(): void {
  clear(DROPBOX_REFRESH_KEY);
}

// Drop both Dropbox tokens together. Disconnect always clears the pair —
// keeping the access token without its refresh companion (or vice versa)
// would leave a half-authenticated state, so they move as one.
export function clearDropboxTokens(): void {
  clearDropboxToken();
  clearDropboxRefreshToken();
}

export function getEncryption(): EncryptionMode {
  return read(ENCRYPTION_KEY) === "encrypted" ? "encrypted" : "plaintext";
}

export function setEncryption(mode: EncryptionMode): void {
  write(ENCRYPTION_KEY, mode);
}
