// Dropbox-backed `StorageAdapter`. Talks to the v2 HTTP API directly
// (no SDK — a handful of endpoints don't justify ~100kB of bundle) and
// stores each namespace's document as `/<namespace>/checklist.json`
// inside the app's scoped folder, so a whole namespace folder can be
// shared with another Dropbox account (the `family/` folder shared with
// relatives). Encryption happens one level up in `withEncryption`, so the
// bytes that land in Dropbox are the same AES-GCM envelope localStorage
// would have held. Ported and pared from the budget project's
// `dropbox-adapter.ts` — the checklist has no backups, receipts, or
// payslips, so this keeps load / save / getRevision.
//
// Migration: builds before namespaces wrote the default document to
// `/checklist.json` at the app-folder root. The default namespace adapter
// moves that legacy file into `/default/checklist.json` the first time it
// loads and finds the folder empty (Dropbox `move_v2`). The move is
// do-once and self-healing — once relocated the folder file exists, so the
// legacy probe never fires again — in the spirit of the budget project's
// forward-only migrations.
//
// Concurrency mirrors Dropbox's own `rev`: `StoredSnapshot.revision`
// round-trips through the caller, and `save` uses the `update`
// write-mode variant (`{".tag":"update","update":<rev>}`) with the
// previous `rev` so a remote that moved underneath us surfaces as
// `ConflictError` instead of a silent overwrite.

import { createLogger } from "../../dev/logger.ts";
import {
  AuthError,
  ConflictError,
  RateLimitError,
  type StorageAdapter,
  type StoredSnapshot,
} from "../adapter.ts";
import { DEFAULT_NAMESPACE_SLUG, namespaceCloudFolder } from "../namespaces.ts";
import {
  type OAuthConfig,
  type TokenResult,
  completeAuth,
  refreshAccessToken,
  startAuth,
} from "../oauth-pkce.ts";

const log = createLogger("dropbox");

// Public app key. Dropbox's PKCE flow doesn't require a client secret,
// and the key itself is published in the deployed JS bundle either way —
// but it's read from a build-time env var so a fork can plug in its own
// Dropbox app without inheriting the upstream developer's identifier.
// Set `VITE_DROPBOX_APP_KEY` in `.env.local` for dev and as a GitHub
// Actions secret for the production build. Unset means the Dropbox
// backend is disabled in the picker.
//
// The matching app is registered at
// https://www.dropbox.com/developers/apps as "Scoped access" with
// permission type "App folder" (folder name `checklist.niclaslindstedt.se`).
// Its redirect URIs must include `https://checklist.niclaslindstedt.se`
// (prod) and `http://localhost:5173` (dev), no trailing slash —
// `startDropboxAuth` derives the URI from `window.location.origin` and
// Dropbox requires an exact match.
export const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY ?? "";

export function isDropboxConfigured(): boolean {
  return DROPBOX_APP_KEY.length > 0;
}

// Public folder name inside the user's Dropbox `Apps/` directory. This
// matches the Dropbox app registration's "App folder" name and is what
// the user sees when browsing Dropbox in their file manager.
export const DROPBOX_APP_FOLDER = "checklist.niclaslindstedt.se";

// Legacy single-file location, written before namespaces existed. The
// default namespace adapter migrates this into `/default/checklist.json`
// on first load (see the header note).
export const DROPBOX_LEGACY_FILE_PATH = "/checklist.json";

// Document file name inside each namespace folder.
const DROPBOX_FILE_NAME = "checklist.json";

/** `/<namespace>/checklist.json` — where a namespace's document lives. */
export function dropboxFilePath(namespace: string): string {
  return `/${namespaceCloudFolder(namespace)}/${DROPBOX_FILE_NAME}`;
}

// Web URL that opens a namespace's folder in Dropbox's web UI with the
// document pre-selected for preview.
export function dropboxWebUrl(
  namespace: string = DEFAULT_NAMESPACE_SLUG,
): string {
  const folder = namespaceCloudFolder(namespace);
  return `https://www.dropbox.com/home/Apps/${DROPBOX_APP_FOLDER}/${encodeURIComponent(folder)}?preview=${encodeURIComponent(DROPBOX_FILE_NAME)}`;
}

const AUTH_BASE = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_ENDPOINT = "https://api.dropboxapi.com/oauth2/token";
const UPLOAD_ENDPOINT = "https://content.dropboxapi.com/2/files/upload";
const DOWNLOAD_ENDPOINT = "https://content.dropboxapi.com/2/files/download";
const METADATA_ENDPOINT = "https://api.dropboxapi.com/2/files/get_metadata";
const MOVE_ENDPOINT = "https://api.dropboxapi.com/2/files/move_v2";
const DELETE_ENDPOINT = "https://api.dropboxapi.com/2/files/delete_v2";

// 1-second coalescing window so cloud sync matches local-storage "save
// on every change" in feel — rapid edits within a single gesture
// collapse into one network save.
const SAVE_DEBOUNCE_MS = 1000;

// Floor for the cooldown after Dropbox returns 429
// "too_many_write_operations". Dropbox normally sets `Retry-After`, but
// we clamp to at least this so a missing / zero / one-second header
// still gives the burst a chance to settle before we try again.
const RATE_LIMIT_FALLBACK_MS = 5000;

// `sessionStorage` survives the OAuth redirect round-trip but is scoped
// to the tab, so a parallel auth flow in another tab can't race with
// this one.
const PKCE_VERIFIER_KEY = "checklist:dropbox:pkce:verifier";

export type FetchImpl = typeof fetch;

// Serialize an argument struct for the `Dropbox-API-Arg` header. The
// header travels as an HTTP header value, which the browser's `fetch`
// refuses to send when it contains a code point above U+00FF. Dropbox
// documents the fix and ships it in its own SDKs as
// `http_header_safe_json`: ASCII-escape every character at or above
// U+0080 to its `\uXXXX` form, which is valid JSON Dropbox decodes back
// to the original string.
export function dropboxApiArg(arg: unknown): string {
  return JSON.stringify(arg).replace(
    /[\u0080-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

// Live access to the user's Dropbox tokens. The access token is short-
// lived (~4 hours), so the adapter holds a mutable copy in its closure
// and exchanges the refresh token for a fresh one on any 401 before
// retrying the request. `onAccessTokenRefreshed` is the hook back into
// app-level state / localStorage so the new token survives reloads.
//
// `refreshToken` may be null for legacy connections that authorized
// before refresh tokens were captured — those users hit the "Sync
// failed" UI on expiry and reconnect from Settings.
export type DropboxAuth = {
  accessToken: string;
  refreshToken: string | null;
  onAccessTokenRefreshed: (accessToken: string) => void;
};

type FileMetadata = {
  rev: string;
};

// Dropbox's `WriteMode` is a tag union. `add` carries no payload so the
// short string form is accepted, but `update` carries the parent `rev`
// and must use the explicit `{".tag":"update",…}` struct form — sending
// `update` as a sibling of `mode` makes the upload endpoint reject the
// call with `unknown field 'update'`.
type WriteMode = "add" | { ".tag": "update"; update: string };

export function createDropboxAdapter(
  auth: string | DropboxAuth,
  fetchImpl: FetchImpl = fetch,
  namespace: string = DEFAULT_NAMESPACE_SLUG,
): StorageAdapter {
  const filePath = dropboxFilePath(namespace);
  const isDefaultNamespace = namespace === DEFAULT_NAMESPACE_SLUG;

  // Mutable so a silent refresh swap doesn't require rebuilding the
  // adapter. Plain string `auth` is still accepted for tests and any
  // caller that doesn't need refresh.
  let currentAccessToken: string;
  let refreshToken: string | null;
  let onAccessTokenRefreshed: ((token: string) => void) | null;
  if (typeof auth === "string") {
    currentAccessToken = auth;
    refreshToken = null;
    onAccessTokenRefreshed = null;
  } else {
    currentAccessToken = auth.accessToken;
    refreshToken = auth.refreshToken;
    onAccessTokenRefreshed = auth.onAccessTokenRefreshed;
  }
  log.info(
    `adapter created hasAccessToken=${Boolean(currentAccessToken)} hasRefreshToken=${Boolean(refreshToken)}`,
  );

  // Coalesce in-flight refreshes so a concurrent load + save burst
  // doesn't trade the refresh_token in twice.
  let pendingRefresh: Promise<string> | null = null;
  async function refreshOnce(): Promise<string | null> {
    if (!refreshToken) {
      log.warn("refresh skipped — no refresh token (legacy connection)");
      return null;
    }
    if (!pendingRefresh) {
      log.info("refreshing access token");
    } else {
      log.info("refresh already in flight — joining");
    }
    pendingRefresh ??= (async () => {
      try {
        const start = performance.now();
        const fresh = await refreshDropboxAccessToken(refreshToken!, fetchImpl);
        const ms = (performance.now() - start).toFixed(0);
        log.info(`refresh ok (${ms}ms)`);
        currentAccessToken = fresh;
        onAccessTokenRefreshed?.(fresh);
        return fresh;
      } finally {
        pendingRefresh = null;
      }
    })();
    try {
      return await pendingRefresh;
    } catch (err) {
      log.error("refresh failed", err);
      return null;
    }
  }

  // Issues a request with the current bearer token; on 401 (expired or
  // revoked token), swaps in a new access token via the refresh token
  // and retries exactly once.
  async function authedFetch(
    url: string,
    build: (token: string) => RequestInit,
  ): Promise<Response> {
    const start = performance.now();
    log.info(`fetch ${shortUrl(url)}`);
    let res: Response;
    try {
      res = await fetchImpl(url, build(currentAccessToken));
    } catch (err) {
      log.error(`fetch network error ${shortUrl(url)}`, err);
      throw err;
    }
    const ms = (performance.now() - start).toFixed(0);
    log.info(`fetch ${shortUrl(url)} → ${res.status} (${ms}ms)`);
    if (res.status === 401) {
      log.info("401 received — attempting silent refresh");
      const fresh = await refreshOnce();
      if (fresh) {
        const retryStart = performance.now();
        try {
          res = await fetchImpl(url, build(fresh));
        } catch (err) {
          log.error(`retry network error ${shortUrl(url)}`, err);
          throw err;
        }
        const retryMs = (performance.now() - retryStart).toFixed(0);
        log.info(`retry ${shortUrl(url)} → ${res.status} (${retryMs}ms)`);
      } else {
        log.warn("no refresh available — surfacing original 401");
      }
    }
    if (res.status === 401) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new AuthError(`Dropbox auth failed: 401 ${body}`);
    }
    return res;
  }

  // Download a single path. Returns null on path/not_found (409) so
  // callers can decide whether to fall back / seed an empty document.
  async function downloadPath(path: string): Promise<StoredSnapshot | null> {
    log.info(`load: download path=${path}`);
    const res = await authedFetch(DOWNLOAD_ENDPOINT, (token) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": dropboxApiArg({ path }),
      },
    }));
    if (res.status === 409) {
      log.info(`load: 409 path/not_found path=${path}`);
      return null;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      log.error(`load: failed ${res.status}`, body);
      throw new Error(`Dropbox load failed: ${res.status} ${body}`);
    }
    const metaHeader = res.headers.get("Dropbox-API-Result");
    let meta: FileMetadata | null = null;
    if (metaHeader) {
      try {
        meta = JSON.parse(metaHeader) as FileMetadata;
      } catch (err) {
        log.warn("load: Dropbox-API-Result header was not valid JSON", err);
      }
    }
    const text = await res.text();
    log.info(
      `load: read body ${text.length} bytes rev=${meta?.rev ?? "<none>"}`,
    );
    return { text, revision: meta?.rev };
  }

  // One-time relocation of the pre-namespaces document. When the default
  // namespace folder is empty but the legacy `/checklist.json` exists at
  // the app-folder root, move it into `/default/checklist.json` (Dropbox
  // auto-creates the folder). Returns the relocated snapshot, or null when
  // there is nothing to migrate. Only the default namespace ever carries
  // legacy data, so this runs for no other namespace.
  async function migrateLegacyDefault(): Promise<StoredSnapshot | null> {
    log.info("migrate: probing legacy root document");
    const legacy = await downloadPath(DROPBOX_LEGACY_FILE_PATH);
    if (!legacy) return null;
    log.info(`migrate: moving ${DROPBOX_LEGACY_FILE_PATH} → ${filePath}`);
    const res = await authedFetch(MOVE_ENDPOINT, (token) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from_path: DROPBOX_LEGACY_FILE_PATH,
        to_path: filePath,
        autorename: false,
      }),
    }));
    if (!res.ok) {
      // A racing device may have moved it already; fall back to reading
      // the (now-populated) folder path rather than failing the load.
      const body = await res.text().catch(() => "<unreadable>");
      log.warn(`migrate: move failed ${res.status} — re-reading folder`, body);
      return downloadPath(filePath);
    }
    const moved = (await res.json()) as { metadata?: FileMetadata };
    log.info(`migrate: moved rev=${moved.metadata?.rev ?? "<none>"}`);
    return { text: legacy.text, revision: moved.metadata?.rev };
  }

  async function loadFromDropbox(): Promise<StoredSnapshot | null> {
    const stored = await downloadPath(filePath);
    if (stored) return stored;
    // Folder empty: migrate the legacy root document into it (default
    // namespace only), otherwise this is a genuinely empty namespace.
    if (isDefaultNamespace) return migrateLegacyDefault();
    return null;
  }

  // Cheap revision probe. `get_metadata` returns the file's `rev` in a
  // small JSON body — the same token `loadFromDropbox` reads off the
  // download response — so a caller can compare it against a last-known
  // revision and skip the body fetch when nothing changed.
  async function getRevision(): Promise<string | null> {
    log.info(`getRevision: metadata path=${filePath}`);
    const res = await authedFetch(METADATA_ENDPOINT, (token) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: filePath }),
    }));
    if (res.status === 409) {
      log.info("getRevision: 409 path/not_found — empty namespace folder");
      return null;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      log.error(`getRevision: failed ${res.status}`, body);
      throw new Error(`Dropbox get_metadata failed: ${res.status} ${body}`);
    }
    const meta = (await res.json()) as FileMetadata;
    log.info(`getRevision: rev=${meta.rev}`);
    return meta.rev;
  }

  return {
    id: "dropbox",
    label: "Dropbox",
    saveDebounceMs: SAVE_DEBOUNCE_MS,
    capabilities: new Set(["getRevision"]),
    getRevision: () => getRevision(),
    load: () => loadFromDropbox(),

    async save(text: string, baseRevision?: string): Promise<StoredSnapshot> {
      const args: { path: string; mute: boolean; mode: WriteMode } = {
        path: filePath,
        mute: true,
        mode: baseRevision ? { ".tag": "update", update: baseRevision } : "add",
      };
      log.info(
        `save: upload bytes=${text.length} mode=${
          baseRevision ? `update(${baseRevision})` : "add"
        }`,
      );
      const res = await authedFetch(UPLOAD_ENDPOINT, (token) => ({
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Dropbox-API-Arg": dropboxApiArg(args),
          "Content-Type": "application/octet-stream",
        },
        body: text,
      }));
      if (res.status === 409) {
        log.warn("save: 409 — re-reading remote to surface conflict");
        // Either a write_conflict (the remote moved past our
        // baseRevision) or an "add" mode collision. Re-read so the
        // caller can surface a proper ConflictError with current bytes.
        const remote = await loadFromDropbox();
        if (remote) throw new ConflictError(remote);
        const detail = await res.text().catch(() => "conflict");
        log.error(`save: 409 with no remote bytes: ${detail}`);
        throw new Error(`Dropbox save failed: 409 ${detail}`);
      }
      if (res.status === 429) {
        const headerSeconds = Number(res.headers.get("Retry-After") ?? "");
        const headerMs = Number.isFinite(headerSeconds)
          ? Math.max(0, headerSeconds) * 1000
          : 0;
        const retryAfterMs = Math.max(headerMs, RATE_LIMIT_FALLBACK_MS);
        log.warn(`save: 429 — throttled retryAfter=${retryAfterMs}ms`);
        throw new RateLimitError(retryAfterMs);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "<unreadable>");
        log.error(`save: failed ${res.status}`, body);
        throw new Error(`Dropbox save failed: ${res.status} ${body}`);
      }
      const meta = (await res.json()) as FileMetadata;
      log.info(`save: ok rev=${meta.rev}`);
      return { text, revision: meta.rev };
    },
  };
}

// Delete a namespace's entire folder (`/<namespace>`) from Dropbox. Used
// when a namespace is removed while Dropbox is the active backend. A 409
// (path/not_found) is treated as "already gone". Best-effort: a hard
// failure is logged and surfaced so the caller can decide whether to keep
// the registry entry.
export async function deleteDropboxNamespace(
  accessToken: string,
  namespace: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  const path = `/${namespaceCloudFolder(namespace)}`;
  log.info(`delete: removing folder ${path}`);
  const res = await fetchImpl(DELETE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path }),
  });
  if (res.status === 409) {
    log.info("delete: 409 path/not_found — already gone");
    return;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    log.error(`delete: failed ${res.status}`, body);
    throw new Error(`Dropbox delete failed: ${res.status} ${body}`);
  }
  log.info("delete: ok");
}

// ---- OAuth (PKCE) ---------------------------------------------------

const DROPBOX_OAUTH: OAuthConfig = {
  authBase: AUTH_BASE,
  tokenEndpoint: TOKEN_ENDPOINT,
  clientId: DROPBOX_APP_KEY,
  state: "dropbox",
  verifierKey: PKCE_VERIFIER_KEY,
  providerName: "Dropbox",
  extraAuthParams: { token_access_type: "offline" },
};

export type DropboxAuthResult = TokenResult;

export function startDropboxAuth(): Promise<void> {
  return startAuth(DROPBOX_OAUTH);
}

// True when a Dropbox OAuth flow is mid-flight — i.e. `startDropboxAuth`
// stashed a PKCE verifier in `sessionStorage` and the redirect back from
// Dropbox has not yet been consumed by `completeDropboxAuth`.
export function hasPendingDropboxAuth(): boolean {
  const present = sessionStorage.getItem(PKCE_VERIFIER_KEY) !== null;
  log.info(
    `hasPendingDropboxAuth: key=${PKCE_VERIFIER_KEY} present=${present}`,
  );
  return present;
}

export function completeDropboxAuth(
  code: string,
  fetchImpl: FetchImpl = fetch,
): Promise<DropboxAuthResult> {
  return completeAuth(DROPBOX_OAUTH, code, fetchImpl);
}

export function refreshDropboxAccessToken(
  refreshToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  return refreshAccessToken(DROPBOX_OAUTH, refreshToken, fetchImpl);
}

// Short tail of a URL, used in logs so each line stays readable.
function shortUrl(url: string): string {
  const idx = url.lastIndexOf("/");
  return idx >= 0 ? url.slice(idx + 1) : url;
}
