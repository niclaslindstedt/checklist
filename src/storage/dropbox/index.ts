// Dropbox-backed `StorageAdapter`. Talks to the v2 HTTP API directly (no
// SDK — a handful of endpoints don't justify ~100kB of bundle) and stores
// each namespace as a folder of individual markdown files under the app's
// scoped folder (`/<namespace>/checklists/*.md`, `/<namespace>/templates/*.md`),
// so a whole namespace folder can be shared with another Dropbox account
// (the `family/` folder shared with relatives) and the files open as plain
// task lists in any editor.
//
// The markdown <-> snapshot conversion, the encrypted-blob fallback, and
// conflict detection live in the shared directory adapter
// (`../directory-adapter.ts`); this module only implements the small
// `FileStore` that moves one file's bytes at a time, plus the OAuth /
// token-refresh machinery the cloud connection needs. Encryption still
// happens one level up in `withEncryption`, so an encrypted store lands as
// a single `/<namespace>/checklist.json` envelope instead of markdown.
//
// Ported and pared from the budget project's `dropbox-adapter.ts`.

import { createLogger } from "../../dev/logger.ts";
import { AuthError, RateLimitError, type StorageAdapter } from "../adapter.ts";
import {
  browserWriteLog,
  createDirectoryAdapter,
} from "../directory-adapter.ts";
import type { FileEntry, FileStore } from "../file-store.ts";
import { DEFAULT_NAMESPACE_SLUG, namespaceCloudFolder } from "../namespaces.ts";
import { fileSettingsStore, type SettingsStore } from "../settings-store.ts";
import {
  fileNamespaceStore,
  type NamespaceRegistryStore,
} from "../namespace-store.ts";
import {
  describeError,
  parseRetryAfterMs,
  readErrorBody,
  requestLabel,
} from "../http-utils.ts";
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

/** `/<namespace>` — the folder a namespace's markdown files live under. */
export function dropboxNamespacePath(namespace: string): string {
  return `/${namespaceCloudFolder(namespace)}`;
}

// Web URL that opens a namespace's folder in Dropbox's web UI.
export function dropboxWebUrl(
  namespace: string = DEFAULT_NAMESPACE_SLUG,
): string {
  const folder = namespaceCloudFolder(namespace);
  return `https://www.dropbox.com/home/Apps/${DROPBOX_APP_FOLDER}/${encodeURIComponent(folder)}`;
}

const TOKEN_ENDPOINT = "https://api.dropboxapi.com/oauth2/token";
const AUTH_BASE = "https://www.dropbox.com/oauth2/authorize";
const UPLOAD_ENDPOINT = "https://content.dropboxapi.com/2/files/upload";
const DOWNLOAD_ENDPOINT = "https://content.dropboxapi.com/2/files/download";
const LIST_FOLDER_ENDPOINT = "https://api.dropboxapi.com/2/files/list_folder";
const LIST_FOLDER_CONTINUE_ENDPOINT =
  "https://api.dropboxapi.com/2/files/list_folder/continue";
const DELETE_ENDPOINT = "https://api.dropboxapi.com/2/files/delete_v2";

// 1-second coalescing window so cloud sync matches local-storage "save
// on every change" in feel — rapid edits within a single gesture
// collapse into one network save.
const SAVE_DEBOUNCE_MS = 1000;

// Floor for the cooldown after Dropbox returns 429
// "too_many_write_operations".
const RATE_LIMIT_FALLBACK_MS = 5000;

// `sessionStorage` survives the OAuth redirect round-trip but is scoped
// to the tab, so a parallel auth flow in another tab can't race with this.
const PKCE_VERIFIER_KEY = "checklist:dropbox:pkce:verifier";

export type FetchImpl = typeof fetch;

// Serialize an argument struct for the `Dropbox-API-Arg` header.
// ASCII-escape every character at or above U+0080 to its `\uXXXX` form —
// the browser's `fetch` refuses header values above U+00FF, and Dropbox
// decodes the escapes back to the original string.
export function dropboxApiArg(arg: unknown): string {
  return JSON.stringify(arg).replace(
    /[\u0080-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

// Live access to the user's Dropbox tokens. The access token is short-
// lived (~4 hours), so the adapter holds a mutable copy and exchanges the
// refresh token for a fresh one on any 401 before retrying.
// `refreshToken` may be null for legacy connections authorized before
// refresh tokens were captured.
export type DropboxAuth = {
  accessToken: string;
  refreshToken: string | null;
  onAccessTokenRefreshed: (accessToken: string) => void;
};

type DropboxEntry = {
  ".tag": "file" | "folder" | "deleted";
  path_display?: string;
  path_lower?: string;
  rev?: string;
};

type ListFolderResult = {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
};

export function createDropboxAdapter(
  auth: string | DropboxAuth,
  fetchImpl: FetchImpl = fetch,
  namespace: string = DEFAULT_NAMESPACE_SLUG,
): StorageAdapter {
  const rootPath = dropboxNamespacePath(namespace);
  log.info(`adapter created ns=${namespace}`);
  const store = createDropboxFileStore(
    createAuthedFetch(auth, fetchImpl),
    rootPath,
  );
  return createDirectoryAdapter(store, {
    id: "dropbox",
    label: "Dropbox",
    saveDebounceMs: SAVE_DEBOUNCE_MS,
    writeLog: browserWriteLog("dropbox", namespace),
  });
}

// Root settings store for the Dropbox backend: `/settings.json` at the
// app-folder root (an empty root path), beside the namespace folders.
export function createDropboxSettingsStore(
  auth: string | DropboxAuth,
  fetchImpl: FetchImpl = fetch,
): SettingsStore {
  return fileSettingsStore(
    createDropboxFileStore(createAuthedFetch(auth, fetchImpl), ""),
  );
}

// Root namespace-registry store for the Dropbox backend: `/namespaces.json`
// at the app-folder root, beside `settings.json` and the namespace folders.
export function createDropboxNamespaceStore(
  auth: string | DropboxAuth,
  fetchImpl: FetchImpl = fetch,
): NamespaceRegistryStore {
  return fileNamespaceStore(
    createDropboxFileStore(createAuthedFetch(auth, fetchImpl), ""),
  );
}

type AuthedFetch = (
  url: string,
  build: (token: string) => RequestInit,
  // Optional human label for the sync log (e.g. `download checklists/x.md`).
  // The file store passes the relative path so a failure names the file —
  // never the access token or contents. Defaults to the URL's host + path.
  label?: string,
) => Promise<Response>;

// Build the bearer-token fetch the file store runs on: issue with the
// current access token, and on a 401 swap in a fresh one via the refresh
// token (coalescing concurrent refreshes) and retry exactly once before
// surfacing `AuthError`. Shared by the document adapter and the settings
// store so both ride the same silent-refresh path.
function createAuthedFetch(
  auth: string | DropboxAuth,
  fetchImpl: FetchImpl,
): AuthedFetch {
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

  // Coalesce in-flight refreshes so a concurrent burst doesn't trade the
  // refresh_token in twice.
  let pendingRefresh: Promise<string> | null = null;
  async function refreshOnce(): Promise<string | null> {
    if (!refreshToken) {
      log.warn("refresh skipped — no refresh token (legacy connection)");
      return null;
    }
    pendingRefresh ??= (async () => {
      try {
        const fresh = await refreshDropboxAccessToken(refreshToken!, fetchImpl);
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

  return async function authedFetch(
    url: string,
    build: (token: string) => RequestInit,
    labelOverride?: string,
  ): Promise<Response> {
    // Per-request diagnostics: which endpoint / file (never the token or the
    // file contents), how long it ran, and how it ended. This is what tells
    // sync failures apart on a flaky link: a download that *throws* after
    // several seconds is a timeout / dropped connection; one that throws in
    // tens of ms is a refused / blocked request (CORS, Private Relay); a load
    // that logs five `→ 200` downloads and one `threw` is an intermittent
    // per-request drop, not the whole host being unreachable; and a single
    // file that always throws while the rest succeed points at that file
    // (e.g. a path-encoding bug on the nested-folder entry).
    const label = labelOverride
      ? `${requestLabel(url)} ${labelOverride}`
      : requestLabel(url);
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    let res: Response;
    try {
      res = await fetchImpl(url, build(currentAccessToken));
    } catch (err) {
      log.warn(`${label} threw after ${elapsed()}ms: ${describeError(err)}`);
      throw err;
    }
    if (res.status === 401) {
      log.info("401 — attempting silent refresh");
      const fresh = await refreshOnce();
      if (fresh) {
        try {
          res = await fetchImpl(url, build(fresh));
        } catch (err) {
          log.warn(
            `${label} threw after ${elapsed()}ms (post-refresh): ${describeError(err)}`,
          );
          throw err;
        }
      }
    }
    if (res.status === 401) {
      const body = await readErrorBody(res);
      throw new AuthError(`Dropbox auth failed: 401 ${body}`);
    }
    const line = `${label} → ${res.status} (${elapsed()}ms)`;
    if (res.ok) log.info(line);
    else log.warn(line);
    return res;
  };
}

function createDropboxFileStore(
  authedFetch: AuthedFetch,
  rootPath: string,
): FileStore {
  const rootPrefix = `${rootPath}/`.toLowerCase();

  function relativePath(entry: DropboxEntry): string | null {
    const full = entry.path_display ?? entry.path_lower;
    if (!full) return null;
    if (full.toLowerCase().startsWith(rootPrefix)) {
      return full.slice(rootPrefix.length);
    }
    return null;
  }

  async function listOnce(
    endpoint: string,
    body: unknown,
  ): Promise<ListFolderResult | null> {
    const res = await authedFetch(endpoint, (token) => ({
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }));
    if (res.status === 409) return null; // path/not_found — empty folder
    if (!res.ok) {
      const detail = await readErrorBody(res);
      throw new Error(`Dropbox list_folder failed: ${res.status} ${detail}`);
    }
    return (await res.json()) as ListFolderResult;
  }

  return {
    async list(): Promise<FileEntry[]> {
      let page = await listOnce(LIST_FOLDER_ENDPOINT, {
        path: rootPath,
        recursive: true,
      });
      if (!page) return [];
      const out: FileEntry[] = [];
      for (;;) {
        for (const entry of page.entries) {
          if (entry[".tag"] !== "file") continue;
          const path = relativePath(entry);
          if (path) out.push({ path, rev: entry.rev });
        }
        if (!page.has_more) break;
        const next = await listOnce(LIST_FOLDER_CONTINUE_ENDPOINT, {
          cursor: page.cursor,
        });
        if (!next) break;
        page = next;
      }
      return out;
    },

    async read(path: string): Promise<string | null> {
      const res = await authedFetch(
        DOWNLOAD_ENDPOINT,
        (token) => ({
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Dropbox-API-Arg": dropboxApiArg({ path: `${rootPath}/${path}` }),
          },
        }),
        `download ${path}`,
      );
      if (res.status === 409) return null;
      if (!res.ok) {
        const detail = await readErrorBody(res);
        throw new Error(`Dropbox download failed: ${res.status} ${detail}`);
      }
      return res.text();
    },

    async write(path: string, text: string): Promise<void> {
      const res = await authedFetch(
        UPLOAD_ENDPOINT,
        (token) => ({
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Dropbox-API-Arg": dropboxApiArg({
              path: `${rootPath}/${path}`,
              mode: "overwrite",
              mute: true,
            }),
            "Content-Type": "application/octet-stream",
          },
          body: text,
        }),
        `upload ${path}`,
      );
      if (res.status === 429) {
        throw new RateLimitError(
          parseRetryAfterMs(res.headers, RATE_LIMIT_FALLBACK_MS),
        );
      }
      if (!res.ok) {
        const detail = await readErrorBody(res);
        throw new Error(`Dropbox upload failed: ${res.status} ${detail}`);
      }
    },

    async remove(path: string): Promise<void> {
      const res = await authedFetch(DELETE_ENDPOINT, (token) => ({
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: `${rootPath}/${path}` }),
      }));
      if (res.status === 409) return; // already gone
      if (!res.ok) {
        const detail = await readErrorBody(res);
        throw new Error(`Dropbox delete failed: ${res.status} ${detail}`);
      }
    },
  };
}

// Delete a namespace's entire folder (`/<namespace>`) from Dropbox. Used
// when a namespace is removed while Dropbox is the active backend. A 409
// (path/not_found) is treated as "already gone".
export async function deleteDropboxNamespace(
  accessToken: string,
  namespace: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  const path = dropboxNamespacePath(namespace);
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
    const body = await readErrorBody(res);
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
  return sessionStorage.getItem(PKCE_VERIFIER_KEY) !== null;
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
