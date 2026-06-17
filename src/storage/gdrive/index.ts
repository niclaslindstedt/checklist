// Google-Drive-backed `StorageAdapter`. Talks to the Drive v3 REST API
// directly (no SDK). Each namespace becomes a folder of individual
// markdown files under `checklist/<namespace>/` (one file per checklist
// and template, in `checklists/` and `templates/` subfolders), so the
// files are visible and editable from drive.google.com and any tool the
// user syncs the folder into.
//
// The markdown <-> snapshot conversion, the encrypted-blob fallback, and
// conflict detection live in the shared directory adapter
// (`../directory-adapter.ts`); this module implements the small
// `FileStore` that moves one file at a time over Drive's API plus the
// nested-folder id bookkeeping Drive requires, and the GIS OAuth flow.
// Encryption happens one level up in `withEncryption`, so an encrypted
// store lands as a single `checklist.json` envelope in the namespace
// folder rather than markdown.
//
// Ported and pared from the budget project's `gdrive-adapter.ts`.

import { createLogger } from "../../dev/logger.ts";
import { AuthError, RateLimitError, type StorageAdapter } from "../adapter.ts";
import { createDirectoryAdapter } from "../directory-adapter.ts";
import type { FileEntry, FileStore } from "../file-store.ts";
import { DEFAULT_NAMESPACE_SLUG, namespaceCloudFolder } from "../namespaces.ts";
import { fileSettingsStore, type SettingsStore } from "../settings-store.ts";
import {
  fileNamespaceStore,
  type NamespaceRegistryStore,
} from "../namespace-store.ts";
import { parseRetryAfterMs, readErrorBody } from "../http-utils.ts";

const log = createLogger("gdrive");

// Public OAuth client id, read from a build-time env var so a fork can
// plug in its own Google Cloud project. Unset means the Google Drive
// backend is disabled in the picker. See the budget project's setup notes
// for the Google Cloud console steps (Drive API + OAuth client).
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

export function isGdriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

// Name of the app folder at the root of the user's My Drive. All files
// this adapter manages live inside it.
export const GDRIVE_APP_FOLDER_NAME = "checklist";

// `drive.file` lets the app see and manage only files it created. Files
// stay visible to the user in Drive's UI.
export const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

const SAVE_DEBOUNCE_MS = 1000;

// Floor for the cooldown after Drive rate-limits a request, used when the
// response carries no usable `Retry-After`. Drive usually omits the header
// and just asks clients to back off exponentially, so the sync engine's
// backoff curve does most of the work; this is only a sane lower bound.
const RATE_LIMIT_FALLBACK_MS = 5000;

export type FetchImpl = typeof fetch;

// Unlike Dropbox's clean 429, Google Drive signals a rate limit mostly as
// HTTP 403 with a structured `reason` in the JSON body — disambiguating a
// throttle from a genuine permission error. A bare 429 counts too. A 403
// quota-exhaustion (`dailyLimitExceeded`) is deliberately NOT treated as a
// transient throttle: that's a hard cap, not a "retry shortly" signal.
function isDriveRateLimit(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  return (
    body.includes("userRateLimitExceeded") || body.includes("rateLimitExceeded")
  );
}

function gdriveError(
  op: string,
  status: number,
  body: string,
  headers?: Headers,
): Error {
  // Map a rate limit to the typed signal so the sync engine parks the
  // session in `throttled` and resumes after a cooldown instead of going
  // red — mirrors the Dropbox adapter's 429 handling.
  if (isDriveRateLimit(status, body)) {
    return new RateLimitError(
      parseRetryAfterMs(headers, RATE_LIMIT_FALLBACK_MS),
    );
  }
  const message = `Google Drive ${op} failed: ${status} ${body}`;
  return status === 401 ? new AuthError(message) : new Error(message);
}

// Returns a URL that opens Drive's web UI (the app folder, or My Drive
// when the folder id isn't known here).
export function gdriveWebUrl(folderId: string | null): string {
  return folderId
    ? `https://drive.google.com/drive/folders/${folderId}`
    : "https://drive.google.com/drive/my-drive";
}

type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  version?: string;
};
type DriveListResponse = { files?: DriveFile[] };

export function createGdriveAdapter(
  token: string,
  fetchImpl: FetchImpl = fetch,
  namespace: string = DEFAULT_NAMESPACE_SLUG,
): StorageAdapter {
  log.info(`adapter created hasToken=${Boolean(token)} ns=${namespace}`);
  const store = createGdriveFileStore(token, fetchImpl, namespace);
  return createDirectoryAdapter(store, {
    id: "gdrive",
    label: "Google Drive",
    saveDebounceMs: SAVE_DEBOUNCE_MS,
  });
}

// Root settings store for the Google Drive backend: `settings.json` in the
// `checklist/` app folder, beside the namespace folders. Built with an
// empty namespace so the file store resolves at the app-folder root.
export function createGdriveSettingsStore(
  token: string,
  fetchImpl: FetchImpl = fetch,
): SettingsStore {
  return fileSettingsStore(createGdriveFileStore(token, fetchImpl, ""));
}

// Root namespace-registry store for the Google Drive backend:
// `namespaces.json` in the `checklist/` app folder, beside `settings.json`
// and the namespace folders. Built with an empty namespace so the file
// store resolves at the app-folder root.
export function createGdriveNamespaceStore(
  token: string,
  fetchImpl: FetchImpl = fetch,
): NamespaceRegistryStore {
  return fileNamespaceStore(createGdriveFileStore(token, fetchImpl, ""));
}

function createGdriveFileStore(
  token: string,
  fetchImpl: FetchImpl,
  namespace: string,
): FileStore {
  const namespaceFolderName = namespaceCloudFolder(namespace);
  // Cache folder ids by their relative directory path ("" = the namespace
  // folder, "checklists" / "templates" = its subfolders). Drive ids are
  // stable, so this only ever grows within an adapter's lifetime.
  const dirIdCache = new Map<string, string>();

  function authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async function searchOne(query: string): Promise<string | null> {
    const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(
      query,
    )}&spaces=drive&fields=files(id)`;
    const res = await fetchImpl(url, { headers: authHeader() });
    if (!res.ok) {
      const body = await readErrorBody(res);
      throw gdriveError("search", res.status, body, res.headers);
    }
    const json = (await res.json()) as DriveListResponse;
    return json.files?.[0]?.id ?? null;
  }

  async function findChildFolder(
    name: string,
    parentId: string,
  ): Promise<string | null> {
    return searchOne(
      `name='${name}' and mimeType='${FOLDER_MIME_TYPE}'` +
        ` and '${parentId}' in parents and trashed=false`,
    );
  }

  async function createFolder(
    name: string,
    parentId: string | null,
  ): Promise<string> {
    const body: Record<string, unknown> = { name, mimeType: FOLDER_MIME_TYPE };
    if (parentId) body.parents = [parentId];
    const res = await fetchImpl(`${DRIVE_FILES_API}?fields=id`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await readErrorBody(res);
      throw gdriveError("folder create", res.status, detail, res.headers);
    }
    return ((await res.json()) as DriveFile).id;
  }

  // Resolve the id of the directory at `relDir` (""/"checklists"/…),
  // creating each missing segment when `create` is set. Returns null when
  // a segment is absent and `create` is false.
  async function resolveDirId(
    relDir: string,
    create: boolean,
  ): Promise<string | null> {
    if (dirIdCache.has(relDir)) return dirIdCache.get(relDir)!;

    // App folder at My Drive root.
    let appId = await findChildFolderAtRoot(GDRIVE_APP_FOLDER_NAME);
    if (!appId) {
      if (!create) return null;
      appId = await createFolder(GDRIVE_APP_FOLDER_NAME, null);
    }

    let parentId = appId;
    // An empty namespace resolves at the app-folder root (the root settings
    // store), so the namespace segment drops out and files land directly in
    // `checklist/`.
    for (const segment of [namespaceFolderName, ...split(relDir)].filter(
      (s) => s.length > 0,
    )) {
      let id = await findChildFolder(segment, parentId);
      if (!id) {
        if (!create) return null;
        id = await createFolder(segment, parentId);
      }
      parentId = id;
    }
    dirIdCache.set(relDir, parentId);
    return parentId;
  }

  async function findChildFolderAtRoot(name: string): Promise<string | null> {
    return searchOne(
      `name='${name}' and mimeType='${FOLDER_MIME_TYPE}'` +
        ` and 'root' in parents and trashed=false`,
    );
  }

  async function listDir(
    dirId: string,
    prefix: string,
    out: FileEntry[],
  ): Promise<void> {
    const query = `'${dirId}' in parents and trashed=false`;
    const url =
      `${DRIVE_FILES_API}?q=${encodeURIComponent(query)}&spaces=drive` +
      `&fields=files(id,name,mimeType,version)`;
    const res = await fetchImpl(url, { headers: authHeader() });
    if (!res.ok) {
      const body = await readErrorBody(res);
      throw gdriveError("list", res.status, body, res.headers);
    }
    const files = ((await res.json()) as DriveListResponse).files ?? [];
    for (const file of files) {
      const path = prefix ? `${prefix}/${file.name}` : (file.name ?? "");
      if (file.mimeType === FOLDER_MIME_TYPE) {
        await listDir(file.id, path, out);
      } else {
        out.push({ path, rev: file.version });
      }
    }
  }

  function dirAndName(path: string): { dir: string; name: string } {
    const idx = path.lastIndexOf("/");
    return idx === -1
      ? { dir: "", name: path }
      : { dir: path.slice(0, idx), name: path.slice(idx + 1) };
  }

  async function findFileId(path: string): Promise<string | null> {
    const { dir, name } = dirAndName(path);
    const dirId = await resolveDirId(dir, false);
    if (!dirId) return null;
    return searchOne(
      `name='${name}' and '${dirId}' in parents and trashed=false`,
    );
  }

  return {
    async list(): Promise<FileEntry[]> {
      const nsId = await resolveDirId("", false);
      if (!nsId) return [];
      const out: FileEntry[] = [];
      await listDir(nsId, "", out);
      return out;
    },

    async read(path: string): Promise<string | null> {
      const fileId = await findFileId(path);
      if (!fileId) return null;
      const res = await fetchImpl(`${DRIVE_FILES_API}/${fileId}?alt=media`, {
        headers: authHeader(),
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        const body = await readErrorBody(res);
        throw gdriveError("download", res.status, body, res.headers);
      }
      return res.text();
    },

    async write(path: string, text: string): Promise<void> {
      const { dir, name } = dirAndName(path);
      const dirId = await resolveDirId(dir, true);
      if (!dirId) throw new Error(`Google Drive: cannot resolve ${dir}`);
      const existing = await searchOne(
        `name='${name}' and '${dirId}' in parents and trashed=false`,
      );
      if (existing) {
        const res = await fetchImpl(
          `${DRIVE_UPLOAD_API}/${existing}?uploadType=media`,
          {
            method: "PATCH",
            headers: { ...authHeader(), "Content-Type": "text/markdown" },
            body: text,
          },
        );
        if (!res.ok) {
          const body = await readErrorBody(res);
          throw gdriveError("update", res.status, body, res.headers);
        }
        return;
      }
      await createFile(dirId, name, text);
    },

    async remove(path: string): Promise<void> {
      const fileId = await findFileId(path);
      if (!fileId) return;
      const res = await fetchImpl(`${DRIVE_FILES_API}/${fileId}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (!res.ok && res.status !== 404) {
        const body = await readErrorBody(res);
        throw gdriveError("delete", res.status, body, res.headers);
      }
    },
  };

  async function createFile(
    parentId: string,
    name: string,
    text: string,
  ): Promise<void> {
    const meta = JSON.stringify({ name, parents: [parentId] });
    const boundary = `checklist-${randomBoundary()}`;
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/markdown\r\n\r\n${text}\r\n` +
      `--${boundary}--`;
    const res = await fetchImpl(
      `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id`,
      {
        method: "POST",
        headers: {
          ...authHeader(),
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    if (!res.ok) {
      const errBody = await readErrorBody(res);
      throw gdriveError("create", res.status, errBody, res.headers);
    }
  }
}

function split(relDir: string): string[] {
  return relDir.split("/").filter((s) => s.length > 0);
}

function randomBoundary(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

// Delete a namespace's folder (and everything inside it) from Drive. Used
// when a namespace is removed while Google Drive is the active backend.
// Best-effort: a missing folder is treated as already gone.
export async function deleteGdriveNamespace(
  token: string,
  namespace: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  const auth = { Authorization: `Bearer ${token}` };
  const folderName = namespaceCloudFolder(namespace);
  const appQuery =
    `name='${GDRIVE_APP_FOLDER_NAME}' and mimeType='${FOLDER_MIME_TYPE}'` +
    ` and 'root' in parents and trashed=false`;
  const appRes = await fetchImpl(
    `${DRIVE_FILES_API}?q=${encodeURIComponent(appQuery)}&spaces=drive&fields=files(id)`,
    { headers: auth },
  );
  if (!appRes.ok) {
    const body = await readErrorBody(appRes);
    throw gdriveError(
      "namespace delete (app folder lookup)",
      appRes.status,
      body,
    );
  }
  const appId = ((await appRes.json()) as DriveListResponse).files?.[0]?.id;
  if (!appId) return;
  const nsQuery =
    `name='${folderName}' and mimeType='${FOLDER_MIME_TYPE}'` +
    ` and '${appId}' in parents and trashed=false`;
  const nsRes = await fetchImpl(
    `${DRIVE_FILES_API}?q=${encodeURIComponent(nsQuery)}&spaces=drive&fields=files(id)`,
    { headers: auth },
  );
  if (!nsRes.ok) {
    const body = await readErrorBody(nsRes);
    throw gdriveError("namespace delete (folder lookup)", nsRes.status, body);
  }
  const nsId = ((await nsRes.json()) as DriveListResponse).files?.[0]?.id;
  if (!nsId) return;
  const delRes = await fetchImpl(`${DRIVE_FILES_API}/${nsId}`, {
    method: "DELETE",
    headers: auth,
  });
  if (!delRes.ok && delRes.status !== 404) {
    const body = await readErrorBody(delRes);
    throw gdriveError("namespace delete", delRes.status, body);
  }
}

// ---- OAuth (GIS token client) --------------------------------------

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

type GisTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GisTokenClientConfig = {
  client_id: string;
  scope: string;
  callback: (response: GisTokenResponse) => void;
  error_callback?: (err: GisErrorResponse) => void;
};

type GisTokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

type GisErrorResponse = {
  type: string;
  message?: string;
};

type GisGlobal = {
  accounts: {
    oauth2: {
      initTokenClient(config: GisTokenClientConfig): GisTokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GisGlobal;
  }
}

let gisLoaderPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (typeof window !== "undefined" && window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisLoaderPromise) return gisLoaderPromise;
  log.info(`loadGisScript: injecting <script> src=${GIS_SCRIPT_URL}`);
  gisLoaderPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        gisLoaderPromise = null;
        reject(
          new Error(
            "Google sign-in loaded but didn't initialise. Reload the page and try again.",
          ),
        );
      }
    };
    script.onerror = () => {
      gisLoaderPromise = null;
      reject(
        new Error(
          "Couldn't reach Google to start sign-in. Check your connection (Wi-Fi, VPN, Private Relay, or content blocker) and try again.",
        ),
      );
    };
    document.head.appendChild(script);
  });
  return gisLoaderPromise;
}

// Kick off the GIS script load without blocking, so the eventual
// `requestAccessToken` runs synchronously inside the user gesture and the
// popup isn't blocked.
export function preloadGdriveAuth(): void {
  void loadGisScript().catch((err: unknown) => {
    log.warn(
      `preloadGdriveAuth: preload failed (will retry on click): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
}

// Opens the Google consent popup and resolves with a short-lived access
// token. Throws when the user dismisses the popup, the popup is blocked,
// or Google returns an error.
export async function startGdriveAuth(): Promise<string> {
  await loadGisScript();
  const gis = window.google?.accounts?.oauth2;
  if (!gis) {
    throw new Error("Google Identity Services unavailable after load");
  }
  return new Promise<string>((resolve, reject) => {
    const client = gis.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GDRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          const desc = resp.error_description ?? resp.error;
          reject(new Error(`Google sign-in failed: ${desc}`));
          return;
        }
        if (!resp.access_token) {
          reject(new Error("Google did not return an access token"));
          return;
        }
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(
          new Error(err.message ?? `Google sign-in ${err.type ?? "failed"}`),
        );
      },
    });
    client.requestAccessToken();
  });
}
