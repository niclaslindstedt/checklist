// Per-device preferences that select which `StorageAdapter` backs the
// active document — and the cloud access tokens that unlock the cloud
// backends. Kept in localStorage on purpose: putting the backend choice
// inside the document would be a chicken-and-egg loop (the bytes select
// the place that holds the bytes). Ported from the budget project's
// `backend-preference.ts`, collapsed to a single-user model (the
// checklist has no accounts) and a thin localStorage shim.

import { createLogger } from "../dev/logger.ts";
import { isICloudAvailable } from "./native-bridge.ts";

const log = createLogger("backend-pref");

export type BackendId = "browser" | "folder" | "dropbox" | "gdrive" | "icloud";

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
const GDRIVE_TOKEN_KEY = "checklist:gdrive:token";
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

export function getBackend(): BackendId {
  const raw = read(BACKEND_KEY);
  if (raw === "dropbox") return "dropbox";
  if (raw === "gdrive") return "gdrive";
  if (raw === "folder") return "folder";
  // iCloud is only selectable inside the iOS native wrapper. All three web
  // deploy slots share one origin (and localStorage), so a stored "icloud"
  // preference could otherwise follow the user into a plain browser where the
  // bridge doesn't exist — downgrade to browser unless the bridge is live.
  if (raw === "icloud" && isICloudAvailable()) return "icloud";
  // Legacy value "local" predates the rename to "browser" — silently
  // migrate. Any unknown / missing value also falls through to browser.
  return "browser";
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

export function getGdriveToken(): string | null {
  return read(GDRIVE_TOKEN_KEY);
}

export function setGdriveToken(token: string): void {
  write(GDRIVE_TOKEN_KEY, token);
}

export function clearGdriveToken(): void {
  clear(GDRIVE_TOKEN_KEY);
}

export function getEncryption(): EncryptionMode {
  return read(ENCRYPTION_KEY) === "encrypted" ? "encrypted" : "plaintext";
}

export function setEncryption(mode: EncryptionMode): void {
  write(ENCRYPTION_KEY, mode);
}
