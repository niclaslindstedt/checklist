// Wraps any `FileStore` into a `StorageAdapter`, storing a namespace as a
// folder of individual markdown files (one per checklist, one per
// template). This is the single place the file-based backends — local
// folder, Dropbox, Google Drive — share, so the markdown representation,
// the legacy/encrypted single-file fallback, and conflict detection are
// implemented once rather than per backend.
//
// Bytes in, bytes out: the adapter still speaks the `StorageAdapter`
// contract (serialized JSON text on `save`, the same back on `load`), so
// nothing upstream — the encryption wrapper, the sync engine — changes.
// The markdown lives only on disk.
//
//   - load():  read every `*.md` file → reconstruct the snapshot →
//              re-serialize to canonical JSON for the pipeline. If there
//              are no markdown files but a `checklist.json` exists (an
//              encrypted envelope, or a not-yet-migrated legacy document),
//              return that file verbatim.
//   - save():  plaintext JSON → markdown files (writing changed files,
//              deleting removed ones, and clearing any legacy
//              `checklist.json`). An encrypted envelope can't be split, so
//              it's stored whole in `checklist.json` and the markdown
//              files are cleared.
//
// Concurrency uses an aggregate revision built from the per-file
// revisions the store reports for the whole directory; a save re-lists
// first and raises `ConflictError` when the aggregate moved past the
// caller's `baseRevision`.

import { createLogger } from "../dev/logger.ts";
import type { Folder, Snapshot } from "../domain/types.ts";
import type { StorageAdapter, StoredSnapshot } from "./adapter.ts";
import { AuthError, ConflictError } from "./adapter.ts";
import { type EncryptionMode, getEncryption } from "./backend-preference.ts";
import { isOfflineError } from "./cache/index.ts";
import { isEncryptedEnvelope } from "./crypto.ts";
import type { FileEntry, FileStore } from "./file-store.ts";
import { snapshotToFiles } from "./markdown/codec.ts";
import { filesToSnapshot } from "./markdown/codec.ts";
import {
  comparable,
  fingerprint,
  resolvePhantomConflict,
} from "./phantom-conflict.ts";
import {
  parse,
  parseFolders,
  serialize,
  serializeFolders,
} from "./serialize.ts";

// Single-file location for bytes that can't be expressed as markdown: an
// AES-GCM envelope (encryption on), and the pre-markdown legacy document
// the cloud backends used to write.
export const BLOB_FILE_NAME = "checklist.json";

// The folder registry sidecar (folder display names + empty folders), beside
// the checklist files in the namespace root. Plaintext JSON — folder names
// aren't secret, and a list's `folder:` frontmatter only carries the id — and
// metadata, not a list: each checklist `.md` carries only the folder *id*, so
// this maps id → name and keeps a folder that holds no lists. Written only on
// the plaintext path; when encryption is on the whole document (folders
// included) rides the single `checklist.json` blob instead.
export const FOLDERS_FILE_NAME = "folders.json";

const log = createLogger("directory");

// How many recent local writes to remember for phantom-conflict detection.
// One lost-response write plus the burst of edits the user makes before the
// device next reaches the backend stays well inside this; bounded so the
// buffer can't grow without limit across a long session.
const MAX_RECENT_WRITES = 50;

function isMarkdownPath(path: string): boolean {
  return path.endsWith(".md");
}

// Build the directory's aggregate revision from the per-file revisions.
// Order-independent (sorted) so two listings of the same bytes compare
// equal regardless of the order the backend returned them in. The folder
// registry sidecar is folded in too, so a folder rename (which rewrites only
// `folders.json`) still moves the revision and is caught by conflict detection.
function aggregateRevision(entries: readonly FileEntry[]): string {
  const md = entries
    .filter(
      (e) =>
        isMarkdownPath(e.path) ||
        e.path === BLOB_FILE_NAME ||
        e.path === FOLDERS_FILE_NAME,
    )
    .map((e) => `${e.path}:${e.rev ?? ""}`)
    .sort();
  return md.join("\n");
}

export type DirectoryAdapterOptions = {
  id: StorageAdapter["id"];
  label: string;
  saveDebounceMs?: number;
  /**
   * Where to persist the phantom-conflict write log so it survives a reload.
   * The lost-response writes that cause phantom conflicts are made *offline*;
   * the device often reloads (and so re-creates this adapter, dropping the
   * in-memory history) before it next reaches the backend, then loads a *stale*
   * revision from the offline cache and sees the remote "move" to a write the
   * previous session made. Persisting the log per (backend, namespace) lets the
   * new session still recognise that write as its own. Omitted in tests that
   * only exercise the in-memory path, and on platforms without `localStorage`.
   */
  writeLog?: WriteLogStore;
  /**
   * Per-file network-error retry schedule, in ms — one entry per *retry*
   * after the first attempt. A `load` fans out into one `list` plus a read
   * per file and is all-or-nothing, so on a flaky link a single dropped
   * request (a raw `TypeError`, the way `fetch` rejects when a request can't
   * complete) would fail the whole load even though the others succeeded.
   * Retrying each individual `FileStore` op a few times on a *network* error
   * (never a typed Auth/Conflict/RateLimit signal) lets the load/save ride
   * out an intermittent request instead of collapsing. Defaults to a short
   * bounded curve; tests pass `[]` (or tiny delays) to stay fast. The local
   * folder backend never raises network errors, so this is inert there.
   */
  retryDelaysMs?: readonly number[];
  /**
   * Reads the persisted at-rest encryption mode. It decides which side wins
   * when an encrypted-envelope `checklist.json` blob and markdown files
   * coexist — the fingerprint of an interrupted enable/disable (see
   * `readSnapshotText`). Defaults to the device-global {@link getEncryption};
   * injected in tests that need to exercise the encrypted-mode branch without a
   * `localStorage`.
   */
  encryptionMode?: () => EncryptionMode;
};

/** Per-(backend, namespace) persistence for the phantom-conflict write log. */
export type WriteLogStore = {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  key: string;
};

/**
 * Build the browser-backed write log for a backend + namespace, or `undefined`
 * when `localStorage` isn't available (SSR, a locked-down embedding). Fingerprints
 * are tiny, so this adds only a few hundred bytes per namespace.
 */
export function browserWriteLog(
  id: string,
  namespace: string,
): WriteLogStore | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return {
    storage: localStorage,
    key: `checklist:writelog:${id}:${namespace}`,
  };
}

// Default per-file retry curve: three retries on a network error, backing
// off ~0.3s → 0.6s → 1.2s. Bounded so a genuinely-down backend still fails
// quickly enough to fall back to the offline cache, while a single dropped
// request on a flaky link gets a few chances to land.
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [300, 600, 1200];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Wrap a `FileStore` so each operation retries on a *network* error (a raw
// `TypeError` — never a typed Auth/Conflict/RateLimit signal, which carry
// their own upstream handling). All four ops are idempotent (overwrite write,
// missing-tolerant remove, pure read/list), so a retry can never corrupt
// state. This is what lets an all-or-nothing `load` (one `list` + N parallel
// reads) survive one request dropping on a flaky link instead of collapsing
// the whole load to "offline".
function withFileStoreRetry(
  inner: FileStore,
  delaysMs: readonly number[],
): FileStore {
  async function run<T>(op: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await op();
      } catch (err) {
        if (!isOfflineError(err) || attempt >= delaysMs.length) throw err;
        await sleep(delaysMs[attempt]!);
      }
    }
  }
  return {
    list: () => run(() => inner.list()),
    read: (path) => run(() => inner.read(path)),
    write: (path, text) => run(() => inner.write(path, text)),
    remove: (path) => run(() => inner.remove(path)),
  };
}

export function createDirectoryAdapter(
  rawStore: FileStore,
  options: DirectoryAdapterOptions,
): StorageAdapter {
  const { writeLog } = options;
  // Every `FileStore` access below goes through the retrying wrapper so a
  // flaky per-request failure doesn't doom a whole load / save (see
  // `withFileStoreRetry`). `probe` deliberately calls the raw store so the
  // reachability check stays a single quick request, not a retried one.
  const store = withFileStoreRetry(
    rawStore,
    options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
  );

  const readEncryptionMode = options.encryptionMode ?? getEncryption;

  // The canonical JSON of the folder registry as it currently stands on disk
  // (null = no `folders.json` sidecar exists). Set on every load and after
  // each write so `save` skips a redundant rewrite when the folders didn't
  // change, and so enabling encryption knows whether a stale sidecar needs
  // clearing.
  let lastFoldersJson: string | null = null;

  // Fingerprints (see `fingerprint`) of the order-independent canonical form
  // (see `comparable`) of every document this adapter has *attempted* to write,
  // newest last — recorded up front in `save`, before the network round-trip,
  // so even an attempt that throws still enters the history (see the note
  // there), and persisted via `writeLog` so it survives the reload that
  // otherwise wipes it. A flaky link can land a write server-side while losing
  // the response, so the device keeps basing on the stale revision; when a
  // later save (even one in a *later session*, after a reload that loaded a
  // stale revision from the offline cache) sees the aggregate revision "move",
  // the remote holds one of *these* — our own earlier write, not another
  // device's edit. Matching the remote against this whole history is what stops
  // a burst of edits made *after* the lost response from surfacing a phantom
  // conflict over the user's own work. Plaintext only: encrypted envelopes
  // carry a random IV, so two envelopes of the same document never compare
  // equal, and nothing is recorded for them.
  const recentWrites: string[] = loadWriteLog();
  function loadWriteLog(): string[] {
    if (!writeLog) return [];
    try {
      const raw = writeLog.storage.getItem(writeLog.key);
      if (!raw) return [];
      const arr: unknown = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter((x): x is string => typeof x === "string");
    } catch {
      return [];
    }
  }
  function rememberWrite(fp: string): void {
    if (recentWrites[recentWrites.length - 1] === fp) return;
    recentWrites.push(fp);
    if (recentWrites.length > MAX_RECENT_WRITES) recentWrites.shift();
    if (writeLog) {
      try {
        writeLog.storage.setItem(writeLog.key, JSON.stringify(recentWrites));
      } catch {
        // A full / unavailable localStorage just degrades to in-memory history.
      }
    }
  }

  // Read the folder registry sidecar, tolerating a missing / corrupt file by
  // yielding no folders. Records the canonical bytes so the next save can tell
  // whether the registry actually changed. Skips the read entirely when the
  // listing shows no sidecar, so a folder-less document costs no extra fetch.
  async function readFolders(entries: readonly FileEntry[]): Promise<Folder[]> {
    if (!entries.some((e) => e.path === FOLDERS_FILE_NAME)) {
      lastFoldersJson = null;
      return [];
    }
    let raw: string | null;
    try {
      raw = await store.read(FOLDERS_FILE_NAME);
    } catch {
      lastFoldersJson = null;
      return [];
    }
    if (!raw) {
      lastFoldersJson = null;
      return [];
    }
    let folders: Folder[];
    try {
      folders = parseFolders(JSON.parse(raw));
    } catch {
      folders = [];
    }
    lastFoldersJson = serializeFolders(folders);
    return folders;
  }

  // Fold the registry's folders into a snapshot's text on load — the
  // checklists are rebuilt from the `.md` files and carry only a folder *id*,
  // so the names (and any empty folders) come from the sidecar. The single
  // encrypted blob already carries its folders inside the (sealed) document,
  // so it's left untouched.
  function injectFolders(text: string, folders: readonly Folder[]): string {
    if (folders.length === 0 || isEncryptedEnvelope(text)) return text;
    const snap = parse(text);
    snap.folders = [...folders];
    return serialize(snap);
  }

  // The canonical document a `load` would return for `text` once it has been
  // written to markdown files and read back: the markdown carries no item ids,
  // so they're regenerated to the positional `<parentId>-<index>` form (see
  // the codec's round-trip note). A remote rebuilt from markdown is in that
  // same form, so projecting our about-to-be-written bytes through the round
  // trip is the only way to compare them like-for-like — which is what lets
  // conflict detection tell a *phantom* conflict (the remote already holds
  // these bytes) from a real divergence.
  function loadEquivalent(text: string): string {
    const snapshot = parse(text);
    const rebuilt = serialize(filesToSnapshot(snapshotToFiles(snapshot)));
    return injectFolders(rebuilt, snapshot.folders ?? []);
  }

  // Write the folder registry sidecar when it changed. Writes `[]` to clear a
  // sidecar whose folders were all removed; skips entirely on a folder-less
  // document that never had one, so a plain checklist folder gains no stray
  // file.
  async function persistFolders(snapshot: Snapshot): Promise<void> {
    const folders = snapshot.folders ?? [];
    if (folders.length === 0 && lastFoldersJson === null) return;
    const json = serializeFolders(folders);
    if (json === lastFoldersJson) return;
    await store.write(FOLDERS_FILE_NAME, json);
    lastFoldersJson = json;
  }

  async function readSnapshotText(
    entries: readonly FileEntry[],
  ): Promise<string | null> {
    const mdPaths = entries.map((e) => e.path).filter(isMarkdownPath);
    const hasBlob = entries.some((e) => e.path === BLOB_FILE_NAME);

    // An encrypted-envelope blob and markdown files never coexist in a healthy
    // store — enabling encryption clears the markdown, disabling clears the
    // blob. When both are present an encryption transition was interrupted (a
    // throttled or half-finished enable/disable), and which side is
    // authoritative turns on the persisted encryption mode — the exact bit the
    // transition flips only on success:
    //   - "encrypted": the complete envelope wins. An interrupted *disable*
    //     writes plaintext markdown first and drops the blob last, so a failure
    //     mid-write leaves half-written markdown beside the intact blob. Reading
    //     that partial markdown (and then re-saving it, which deletes the blob)
    //     is exactly how "turn encryption off, get rate limited, retry" made
    //     checklists vanish. Preferring the blob keeps the full document
    //     recoverable and unshadowable until the plaintext side lands whole.
    //   - "plaintext": the markdown wins. An interrupted *enable* leaves a
    //     lingering envelope beside the plaintext; the app holds no key in
    //     plaintext mode, so the readable markdown is the right thing to load.
    if (hasBlob && mdPaths.length > 0 && readEncryptionMode() === "encrypted") {
      const blob = await store.read(BLOB_FILE_NAME);
      if (blob !== null && isEncryptedEnvelope(blob)) return blob;
    }

    if (mdPaths.length > 0) {
      const files = await Promise.all(
        mdPaths.map(async (path) => ({
          path,
          text: (await store.read(path)) ?? "",
        })),
      );
      return serialize(filesToSnapshot(files));
    }
    // No markdown yet: fall back to the single-file blob (an encrypted
    // envelope, or a legacy JSON document the cloud backends wrote before
    // markdown). Returned verbatim so the pipeline can decrypt / migrate.
    if (hasBlob) {
      return store.read(BLOB_FILE_NAME);
    }
    return null;
  }

  async function load(): Promise<StoredSnapshot | null> {
    const entries = await store.list();
    // Read the registry alongside the checklists so an empty folder (one no
    // list references) still loads, and a document whose only content is empty
    // folders loads as a real, non-null document rather than null.
    const folders = await readFolders(entries);
    const revision = aggregateRevision(entries);
    const text = await readSnapshotText(entries);
    if (text === null) {
      if (folders.length === 0) return null;
      return {
        text: injectFolders(serialize(parse(null)), folders),
        revision,
      };
    }
    return { text: injectFolders(text, folders), revision };
  }

  async function save(
    text: string,
    baseRevision?: string,
  ): Promise<StoredSnapshot> {
    // The fingerprint of the order-independent canonical form of the bytes
    // we're about to write, for phantom-conflict comparison and the write
    // history. Null for an encrypted envelope — its random IV makes byte
    // comparison meaningless.
    const writingFingerprint = isEncryptedEnvelope(text)
      ? null
      : fingerprint(comparable(loadEquivalent(text)));
    // Record the *intended* write before touching the network. A lost-response
    // write — the whole reason phantom conflicts arise — happens on a flaky
    // link, where this save throws (often from `store.list()` below, before a
    // single byte is written) yet the underlying request still commits server
    // side. If we only remembered writes whose `store.list()` succeeded, the
    // offline attempts that actually became the lost-response write would never
    // enter the history, so the later online save couldn't recognise the remote
    // as our own and would surface a phantom conflict. Remembering up front
    // means every document this device tried to push is matchable later.
    if (writingFingerprint !== null) rememberWrite(writingFingerprint);
    const before = await store.list();
    if (baseRevision !== undefined) {
      const current = aggregateRevision(before);
      if (current !== baseRevision) {
        const remoteText = await readSnapshotText(before);
        const remoteFolders = await readFolders(before);
        const remoteDoc = injectFolders(
          remoteText ?? serialize(parse(null)),
          remoteFolders,
        );
        // The aggregate revision moved past our base — but on a single device
        // this is usually a *phantom* conflict, not another device's edit. A
        // save can commit to the backend while its response is lost to a flaky
        // link (a `fetch` that succeeds server-side but rejects client-side
        // with a raw network error, or a post-write re-list that fails): the
        // write lands, yet the client never learns the new revision and keeps
        // basing on the stale one. So the next save sees the revision "move"
        // and would surface a conflict over the user's own edit.
        if (writingFingerprint === null) {
          // Encrypted: can't tell our own re-encryption from another device's
          // edit, so any revision move is treated as a genuine conflict.
          throw new ConflictError({ text: remoteDoc, revision: current });
        }
        // Compare on the same order-independent footing the history is kept in:
        // the remote was rebuilt from a file listing whose order need not match
        // our in-memory document's.
        const resolution = resolvePhantomConflict({
          writingFingerprint,
          remoteDoc,
          recentWrites,
        });
        if (resolution === "adopt") {
          // The remote already holds exactly the document we're about to write:
          // our own lost-response write of *these* bytes is what moved the
          // revision. Adopt it and report success — nothing left to write.
          log.info(
            "save: remote already holds these bytes — adopting revision",
          );
          return { text, revision: current };
        }
        if (resolution === "conflict") {
          log.warn(
            "save: remote moved to an unrecognised document — real conflict",
          );
          throw new ConflictError({ text: remoteDoc, revision: current });
        }
        // resolution === "overwrite": the remote holds an *earlier* write of
        // ours (the lost-response one) and the user has since edited further, so
        // the local document has moved ahead of what landed. Still not another
        // device — fall through to the write below, which re-bases on `before`,
        // writing the newer bytes over the moved revision instead of conflicting.
        log.info(
          "save: remote holds an earlier local write — writing newer bytes over it",
        );
      }
    }

    const existingMd = new Set(
      before.map((e) => e.path).filter(isMarkdownPath),
    );
    const hasBlob = before.some((e) => e.path === BLOB_FILE_NAME);
    const hasFoldersSidecar = before.some((e) => e.path === FOLDERS_FILE_NAME);

    if (isEncryptedEnvelope(text)) {
      // Can't express an envelope as markdown — store it whole (folders and
      // all, inside the sealed document) and drop any markdown files so the
      // two representations can't disagree. The plaintext folder sidecar is
      // cleared too: encryption keeps the document to a single opaque blob,
      // so a stale `folders.json` would leak folder names on disk.
      await store.write(BLOB_FILE_NAME, text);
      const removals = [...existingMd];
      if (hasFoldersSidecar) removals.push(FOLDERS_FILE_NAME);
      await Promise.all(removals.map((path) => store.remove(path)));
      lastFoldersJson = null;
    } else {
      const snapshot = parse(text);
      const files = snapshotToFiles(snapshot);
      const desired = new Set(files.map((f) => f.path));
      await Promise.all(files.map((f) => store.write(f.path, f.text)));
      const removals = [...existingMd].filter((p) => !desired.has(p));
      if (hasBlob) removals.push(BLOB_FILE_NAME);
      await Promise.all(removals.map((path) => store.remove(path)));
      // Persist the folder registry sidecar (names + empty folders). The list
      // files carry only the folder id, so this is what makes a renamed or
      // empty folder survive. A no-op when the registry didn't change.
      await persistFolders(snapshot);
    }

    const after = await store.list();
    return { text, revision: aggregateRevision(after) };
  }

  // Cheap reachability check: a single directory listing, no file bodies and
  // no retry (the raw store) so it stays one quick request — the retrying
  // store is for the all-or-nothing load/save, not this yes/no probe.
  // Resolves true when the backend answered, false when the request couldn't
  // reach it (offline). A lapsed session re-throws `AuthError` so the caller
  // routes to Reconnect rather than parking in the offline state; any other
  // unexpected failure also counts as "not reachable" so the UI doesn't claim
  // we're back online on a backend that's still erroring.
  async function probe(): Promise<boolean> {
    try {
      await rawStore.list();
      return true;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      if (!isOfflineError(err)) {
        log.warn("probe: backend reachable but errored", err);
      }
      return false;
    }
  }

  return {
    id: options.id,
    label: options.label,
    saveDebounceMs: options.saveDebounceMs,
    capabilities: new Set(["probe"]),
    load,
    save,
    probe,
  };
}
