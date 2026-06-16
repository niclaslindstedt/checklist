// Google-Drive-backed `StorageAdapter`. Talks to the Drive v3 REST API
// directly (no SDK — Drive v3 is two endpoints away from "two fetch
// calls", same shape as the Dropbox adapter). Each namespace's document
// lands in its own `checklist/<namespace>/` folder under the `drive.file`
// scope so the files are visible to the user (they can browse, share, or
// delete a namespace folder directly from drive.google.com). Ported and
// pared from the budget project's `gdrive-adapter.ts` — the checklist has
// no backups or receipts, so this keeps load / save / getRevision.
//
// Migration: builds before namespaces wrote the default document as
// `checklist/checklist.json` (directly in the app folder). The default
// namespace adapter re-parents that legacy file into
// `checklist/default/` the first time it loads and finds the namespace
// folder empty — do-once and self-healing, in the spirit of the budget
// project's forward-only migrations.
//
// Concurrency rides on Drive's ETag: `StoredSnapshot.revision` is the
// ETag returned from the previous `load` / `save`, and the next `save`
// passes it back via `If-Match`. A 412 surfaces as `ConflictError`
// carrying the fresh remote snapshot.

import { createLogger } from "../../dev/logger.ts";
import {
  AuthError,
  ConflictError,
  type StorageAdapter,
  type StoredSnapshot,
} from "../adapter.ts";
import { DEFAULT_NAMESPACE_SLUG, namespaceCloudFolder } from "../namespaces.ts";

const log = createLogger("gdrive");

// Public OAuth client id. The Drive flow uses Google Identity Services'
// token client (popup + postMessage), the SPA-friendly path Google
// steers public clients to today — no client secret, no redirect URI,
// no code-for-token exchange. The id itself is published in the deployed
// JS bundle either way; it's read from a build-time env var so a fork
// can plug in its own Google Cloud project. Set `VITE_GOOGLE_CLIENT_ID`
// in `.env.local` for dev and as a GitHub Actions secret for the
// production build. Unset means the Google Drive backend is disabled in
// the picker.
//
// Setup:
//   1. Create a Google Cloud project at console.cloud.google.com.
//   2. Enable the Google Drive API (APIs & Services → Library).
//   3. Create an OAuth 2.0 Client ID, Application type "Web application".
//   4. Authorized JavaScript origins (the only origin check GIS runs):
//        https://checklist.niclaslindstedt.se
//        http://localhost:5173
//   5. Authorized redirect URIs: leave empty (the token client uses a
//      Google-hosted popup that posts results back via postMessage).
//   6. Expose the client id to the build as `VITE_GOOGLE_CLIENT_ID`.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

export function isGdriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

// Name of the app folder at the root of the user's My Drive. All files
// this adapter manages live inside it.
export const GDRIVE_APP_FOLDER_NAME = "checklist";

// Name of the single document the app reads / writes, stored inside
// `GDRIVE_APP_FOLDER_NAME`.
export const GDRIVE_FILE_NAME = "checklist.json";

// `drive.file` lets the app see and manage only files it created. The
// file is visible to the user in Drive's UI, mirroring the Dropbox "App
// folder" visibility model.
export const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

const DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

// 1-second coalescing window — matches the Dropbox adapter so the "save
// on every change" behaviour is consistent regardless of the active
// cloud backend.
const SAVE_DEBOUNCE_MS = 1000;

export type FetchImpl = typeof fetch;

// Build the Error a failed Drive response surfaces. A 401 lands as
// AuthError so the UI can surface a "Reconnect" affordance — GIS popup
// tokens have no refresh path and expire after ~1h, so an expired token
// is the common cause.
function gdriveError(op: string, status: number, body: string): Error {
  const message = `Google Drive ${op} failed: ${status} ${body}`;
  return status === 401 ? new AuthError(message) : new Error(message);
}

// Returns a URL that opens the document (or the Drive home, if the file
// id isn't known here) in Drive's web UI.
export function gdriveWebUrl(fileId: string | null): string {
  return fileId
    ? `https://drive.google.com/file/d/${fileId}/view`
    : "https://drive.google.com/drive/my-drive";
}

type DriveFile = { id: string };
type DriveListResponse = { files?: DriveFile[] };

export function createGdriveAdapter(
  token: string,
  fetchImpl: FetchImpl = fetch,
  namespace: string = DEFAULT_NAMESPACE_SLUG,
): StorageAdapter {
  log.info(`adapter created hasToken=${Boolean(token)} ns=${namespace}`);
  const namespaceFolderName = namespaceCloudFolder(namespace);
  const isDefaultNamespace = namespace === DEFAULT_NAMESPACE_SLUG;
  // The Drive file id never changes for the lifetime of the file, so we
  // look it up by name once and cache it in the closure. The cache is
  // invalidated on 404 (file deleted in Drive) so the next save
  // recreates it.
  let cachedFileId: string | null = null;
  let cachedAppFolderId: string | null = null;
  let cachedNamespaceFolderId: string | null = null;

  function authHeader(): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  async function searchOne(query: string): Promise<string | null> {
    const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(
      query,
    )}&spaces=drive&fields=files(id)`;
    log.info(`search: ${query}`);
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: authHeader() });
    } catch (err) {
      log.error("search: network error", err);
      throw err;
    }
    log.info(`search: → ${res.status}`);
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      log.error(`search: failed ${res.status}`, body);
      throw gdriveError("search", res.status, body);
    }
    const json = (await res.json()) as DriveListResponse;
    return json.files?.[0]?.id ?? null;
  }

  async function findAppFolderId(): Promise<string | null> {
    if (cachedAppFolderId) return cachedAppFolderId;
    const id = await searchOne(
      `name='${GDRIVE_APP_FOLDER_NAME}' and mimeType='${FOLDER_MIME_TYPE}'` +
        ` and trashed=false`,
    );
    if (id) cachedAppFolderId = id;
    return id;
  }

  async function ensureAppFolder(): Promise<string> {
    const existing = await findAppFolderId();
    if (existing) return existing;
    log.info("appFolder: creating");
    const res = await fetchImpl(`${DRIVE_FILES_API}?fields=id`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: GDRIVE_APP_FOLDER_NAME,
        mimeType: FOLDER_MIME_TYPE,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw gdriveError("app folder create", res.status, body);
    }
    const meta = (await res.json()) as DriveFile;
    cachedAppFolderId = meta.id;
    return meta.id;
  }

  async function findNamespaceFolderId(): Promise<string | null> {
    if (cachedNamespaceFolderId) return cachedNamespaceFolderId;
    const appId = await findAppFolderId();
    if (!appId) return null;
    const id = await searchOne(
      `name='${namespaceFolderName}' and mimeType='${FOLDER_MIME_TYPE}'` +
        ` and '${appId}' in parents and trashed=false`,
    );
    if (id) cachedNamespaceFolderId = id;
    return id;
  }

  async function ensureNamespaceFolder(): Promise<string> {
    const existing = await findNamespaceFolderId();
    if (existing) return existing;
    const appId = await ensureAppFolder();
    log.info(`nsFolder: creating ${namespaceFolderName}`);
    const res = await fetchImpl(`${DRIVE_FILES_API}?fields=id`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: namespaceFolderName,
        mimeType: FOLDER_MIME_TYPE,
        parents: [appId],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw gdriveError("namespace folder create", res.status, body);
    }
    const meta = (await res.json()) as DriveFile;
    cachedNamespaceFolderId = meta.id;
    return meta.id;
  }

  // One-time relocation of the pre-namespaces document: the legacy file
  // sat directly in the app folder (`checklist/checklist.json`). Re-parent
  // it into the default namespace folder (`checklist/default/`) by adding
  // the namespace folder and removing the app folder from its parents.
  // Returns the file id when migrated, null when there's nothing to move.
  async function migrateLegacyDefault(): Promise<string | null> {
    const appId = await findAppFolderId();
    if (!appId) return null;
    const legacyId = await searchOne(
      `name='${GDRIVE_FILE_NAME}' and '${appId}' in parents and trashed=false`,
    );
    if (!legacyId) return null;
    const nsFolderId = await ensureNamespaceFolder();
    log.info(
      `migrate: re-parenting legacy ${legacyId} → ${namespaceFolderName}`,
    );
    const res = await fetchImpl(
      `${DRIVE_FILES_API}/${legacyId}?addParents=${nsFolderId}` +
        `&removeParents=${appId}&fields=id`,
      { method: "PATCH", headers: authHeader() },
    );
    if (!res.ok) {
      // A racing device may have moved it already; re-search the folder
      // rather than failing the load.
      const body = await res.text().catch(() => "<unreadable>");
      log.warn(`migrate: re-parent failed ${res.status} — re-searching`, body);
      const moved = await searchOne(
        `name='${GDRIVE_FILE_NAME}' and '${nsFolderId}' in parents` +
          ` and trashed=false`,
      );
      if (moved) cachedFileId = moved;
      return moved;
    }
    cachedFileId = legacyId;
    log.info(`migrate: moved id=${legacyId}`);
    return legacyId;
  }

  async function findFileId(): Promise<string | null> {
    if (cachedFileId) {
      log.info(`findFileId: cache hit ${cachedFileId}`);
      return cachedFileId;
    }
    const nsFolderId = await findNamespaceFolderId();
    if (nsFolderId) {
      const id = await searchOne(
        `name='${GDRIVE_FILE_NAME}' and '${nsFolderId}' in parents` +
          ` and trashed=false`,
      );
      if (id) {
        cachedFileId = id;
        log.info(`findFileId: in namespace folder ${id}`);
        return id;
      }
    }
    // Namespace folder empty: migrate the legacy app-folder document into
    // it (default namespace only).
    if (isDefaultNamespace) {
      const migrated = await migrateLegacyDefault();
      if (migrated) return migrated;
    }
    log.info("findFileId: result <none>");
    return null;
  }

  async function load(): Promise<StoredSnapshot | null> {
    log.info("load: start");
    const fileId = await findFileId();
    if (!fileId) {
      log.info("load: no file id — empty");
      return null;
    }
    const url = `${DRIVE_FILES_API}/${fileId}?alt=media`;
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: authHeader() });
    } catch (err) {
      log.error("load: network error", err);
      throw err;
    }
    log.info(`load: download → ${res.status}`);
    if (res.status === 404) {
      // File was deleted between the search and the download. Drop the
      // cache so the next save recreates it.
      log.warn("load: 404 — cached id is stale, clearing");
      cachedFileId = null;
      return null;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      log.error(`load: failed ${res.status}`, body);
      throw gdriveError("load", res.status, body);
    }
    const text = await res.text();
    const revision = res.headers.get("ETag") ?? undefined;
    log.info(`load: bytes=${text.length} etag=${revision ?? "<none>"}`);
    return { text, revision };
  }

  // Cheap revision probe. A metadata GET (`fields=id`) returns the
  // file's ETag in the response header — the same token `load` reads off
  // the `alt=media` download — so a caller can compare it against a
  // last-known revision and skip the body fetch when nothing changed.
  async function getRevision(): Promise<string | null> {
    log.info("getRevision: start");
    const fileId = await findFileId();
    if (!fileId) {
      log.info("getRevision: no file id — empty");
      return null;
    }
    const res = await fetchImpl(`${DRIVE_FILES_API}/${fileId}?fields=id`, {
      headers: authHeader(),
    });
    if (res.status === 404) {
      log.warn("getRevision: 404 — cached id is stale, clearing");
      cachedFileId = null;
      return null;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      log.error(`getRevision: failed ${res.status}`, body);
      throw gdriveError("getRevision", res.status, body);
    }
    const revision = res.headers.get("ETag");
    log.info(`getRevision: etag=${revision ?? "<none>"}`);
    return revision;
  }

  async function create(text: string): Promise<StoredSnapshot> {
    log.info(`create: multipart upload bytes=${text.length}`);
    // Multipart upload — one part is the metadata (file name + parent
    // folder), the other is the body. Drive returns the new file id but
    // not the ETag in this response, so we issue a tiny follow-up GET to
    // pick up the revision token.
    const folderId = await ensureNamespaceFolder();
    const meta = JSON.stringify({
      name: GDRIVE_FILE_NAME,
      parents: [folderId],
    });
    const boundary = `checklist-${randomBoundary()}`;
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n${text}\r\n` +
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
    log.info(`create: → ${res.status}`);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "<unreadable>");
      log.error(`create: failed ${res.status}`, errBody);
      throw gdriveError("create", res.status, errBody);
    }
    const created = (await res.json()) as DriveFile;
    cachedFileId = created.id;
    log.info(`create: ok id=${cachedFileId}, fetching ETag`);
    const head = await fetchImpl(
      `${DRIVE_FILES_API}/${cachedFileId}?fields=id`,
      {
        headers: authHeader(),
      },
    );
    const revision = head.headers.get("ETag") ?? undefined;
    log.info(`create: etag=${revision ?? "<none>"}`);
    return { text, revision };
  }

  async function save(
    text: string,
    baseRevision?: string,
  ): Promise<StoredSnapshot> {
    log.info(`save: bytes=${text.length} baseRev=${baseRevision ?? "<none>"}`);
    const fileId = await findFileId();
    if (!fileId) {
      log.info("save: no file id — creating");
      return create(text);
    }
    const headers: Record<string, string> = {
      ...authHeader(),
      "Content-Type": "application/octet-stream",
    };
    if (baseRevision) headers["If-Match"] = baseRevision;
    const res = await fetchImpl(
      `${DRIVE_UPLOAD_API}/${fileId}?uploadType=media`,
      { method: "PATCH", headers, body: text },
    );
    log.info(`save: PATCH → ${res.status}`);
    if (res.status === 412) {
      log.warn("save: 412 If-Match failed — re-reading remote");
      // Precondition failed — the remote ETag moved past our
      // baseRevision. Re-fetch so the caller can surface a proper
      // ConflictError with the current bytes.
      const remote = await load();
      if (remote) throw new ConflictError(remote);
      log.error("save: 412 with no remote bytes");
      throw new Error("Google Drive save failed: 412 with no remote bytes");
    }
    if (res.status === 404) {
      log.warn("save: 404 — cached id stale, recreating");
      cachedFileId = null;
      return create(text);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      log.error(`save: failed ${res.status}`, body);
      throw gdriveError("save", res.status, body);
    }
    const revision = res.headers.get("ETag") ?? undefined;
    log.info(`save: ok etag=${revision ?? "<none>"}`);
    return { text, revision };
  }

  return {
    id: "gdrive",
    label: "Google Drive",
    saveDebounceMs: SAVE_DEBOUNCE_MS,
    capabilities: new Set(["getRevision"]),
    load,
    save,
    getRevision,
  };
}

function randomBoundary(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

// Delete a namespace's folder (and the document inside it) from Drive.
// Used when a namespace is removed while Google Drive is the active
// backend. Best-effort: a missing folder is treated as already gone.
export async function deleteGdriveNamespace(
  token: string,
  namespace: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  const auth = { Authorization: `Bearer ${token}` };
  const folderName = namespaceCloudFolder(namespace);
  const appQuery =
    `name='${GDRIVE_APP_FOLDER_NAME}' and mimeType='${FOLDER_MIME_TYPE}'` +
    ` and trashed=false`;
  const appRes = await fetchImpl(
    `${DRIVE_FILES_API}?q=${encodeURIComponent(appQuery)}&spaces=drive&fields=files(id)`,
    { headers: auth },
  );
  if (!appRes.ok) {
    const body = await appRes.text().catch(() => "<unreadable>");
    throw gdriveError(
      "namespace delete (app folder lookup)",
      appRes.status,
      body,
    );
  }
  const appId = ((await appRes.json()) as DriveListResponse).files?.[0]?.id;
  if (!appId) {
    log.info("delete: no app folder — nothing to remove");
    return;
  }
  const nsQuery =
    `name='${folderName}' and mimeType='${FOLDER_MIME_TYPE}'` +
    ` and '${appId}' in parents and trashed=false`;
  const nsRes = await fetchImpl(
    `${DRIVE_FILES_API}?q=${encodeURIComponent(nsQuery)}&spaces=drive&fields=files(id)`,
    { headers: auth },
  );
  if (!nsRes.ok) {
    const body = await nsRes.text().catch(() => "<unreadable>");
    throw gdriveError("namespace delete (folder lookup)", nsRes.status, body);
  }
  const nsId = ((await nsRes.json()) as DriveListResponse).files?.[0]?.id;
  if (!nsId) {
    log.info("delete: no namespace folder — already gone");
    return;
  }
  log.info(`delete: removing namespace folder ${folderName} (${nsId})`);
  const delRes = await fetchImpl(`${DRIVE_FILES_API}/${nsId}`, {
    method: "DELETE",
    headers: auth,
  });
  if (!delRes.ok && delRes.status !== 404) {
    const body = await delRes.text().catch(() => "<unreadable>");
    throw gdriveError("namespace delete", delRes.status, body);
  }
  log.info("delete: ok");
}

// ---- OAuth (GIS token client) --------------------------------------

// Google Identity Services token client. The popup flow is the modern
// SPA path — no redirect URI, no `/token` exchange, no client secret.
// `requestAccessToken` opens a Google-hosted consent popup; the popup
// posts the result back to GIS via `postMessage`, and GIS hands us an
// access token through `callback`. Tokens are short-lived (~1h) and
// there is no refresh token; the user reconnects when an API call
// returns 401.
//
// The GIS script is loaded lazily on first connect so an offline app
// load doesn't hang on accounts.google.com.

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
        log.info("loadGisScript: ready");
        resolve();
      } else {
        log.error("loadGisScript: loaded but globals missing");
        gisLoaderPromise = null;
        reject(
          new Error(
            "Google sign-in loaded but didn't initialise. Reload the page and try again.",
          ),
        );
      }
    };
    script.onerror = () => {
      log.error(`loadGisScript: network error src=${GIS_SCRIPT_URL}`);
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

// Kick off the GIS script load without blocking. Call this as soon as
// the UI knows the user will likely click "connect" so the eventual
// `requestAccessToken` call runs synchronously inside the user gesture
// and the popup isn't blocked by strict popup blockers.
export function preloadGdriveAuth(): void {
  log.info("preloadGdriveAuth: warming GIS script");
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
  log.info("startGdriveAuth: loading GIS");
  await loadGisScript();
  const gis = window.google?.accounts?.oauth2;
  if (!gis) {
    throw new Error("Google Identity Services unavailable after load");
  }
  log.info("startGdriveAuth: opening consent popup");
  return new Promise<string>((resolve, reject) => {
    const client = gis.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GDRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          const desc = resp.error_description ?? resp.error;
          log.error(`token client: error ${resp.error} (${desc})`);
          reject(new Error(`Google sign-in failed: ${desc}`));
          return;
        }
        if (!resp.access_token) {
          log.error("token client: no access_token in response");
          reject(new Error("Google did not return an access token"));
          return;
        }
        log.info(`token client: token received expires_in=${resp.expires_in}`);
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        log.error(`token client: error_callback type=${err.type}`);
        reject(
          new Error(err.message ?? `Google sign-in ${err.type ?? "failed"}`),
        );
      },
    });
    client.requestAccessToken();
  });
}
