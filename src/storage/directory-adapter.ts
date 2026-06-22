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
import { isOfflineError } from "./cache/index.ts";
import { isEncryptedEnvelope } from "./crypto.ts";
import type { FileEntry, FileStore } from "./file-store.ts";
import { snapshotToFiles } from "./markdown/codec.ts";
import { filesToSnapshot } from "./markdown/codec.ts";
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

// A compact, dependency-free content fingerprint for the write history: the
// string length plus two differently-seeded rolling hashes. Storing
// fingerprints rather than whole documents keeps the persisted log tiny and
// leaks no extra plaintext, while an accidental collision between two *distinct*
// documents stays vanishingly unlikely — enough to tell this device's own
// earlier write from another device's edit.
function fingerprint(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xc2b2ae35;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca77) >>> 0;
  }
  return `${s.length}:${h1.toString(36)}:${h2.toString(36)}`;
}

export function createDirectoryAdapter(
  store: FileStore,
  options: DirectoryAdapterOptions,
): StorageAdapter {
  const { writeLog } = options;

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

  // An order-independent canonical form of a document, for the phantom-conflict
  // comparison only (never for what's written). `load` — and the remote
  // readback below — rebuilds a snapshot in the backend's file-*listing* order,
  // while the bytes we're about to write carry the *in-memory* order, which can
  // come from the offline cache and need not match how the backend lists its
  // files. The two then serialize the *same* content to the *same* byte length
  // but a different top-level array order, so a raw string compare never
  // matches — the field bug where the remote was byte-identical in size to this
  // device's own earlier write yet came back "unrecognised". Sorting the
  // checklist / template / folder arrays by id makes them comparable; item
  // order *within* a list is intrinsic to the document and left untouched.
  function comparable(text: string): string {
    const snap = parse(text);
    const byId = (a: { id: string }, b: { id: string }) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    const normalized: Snapshot = {
      templates: [...snap.templates].sort(byId),
      checklists: [...snap.checklists].sort(byId),
    };
    if (snap.folders && snap.folders.length > 0) {
      normalized.folders = [...snap.folders].sort(byId);
    }
    return serialize(normalized);
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
    if (entries.some((e) => e.path === BLOB_FILE_NAME)) {
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
        if (writingFingerprint !== null) {
          // Compare on the same order-independent footing the history is kept
          // in: the remote was rebuilt from a file listing whose order need not
          // match our in-memory document's.
          const remoteFingerprint = fingerprint(comparable(remoteDoc));
          if (writingFingerprint === remoteFingerprint) {
            // The remote already holds exactly the document we're about to
            // write: our own lost-response write of *these* bytes is what moved
            // the revision. Adopt it and report success — nothing left to write.
            log.info(
              "save: remote already holds these bytes — adopting revision",
            );
            return { text, revision: current };
          }
          if (recentWrites.includes(remoteFingerprint)) {
            // The remote holds an *earlier* write of ours (the lost-response
            // one) and the user has since edited further, so the local document
            // has moved ahead of what landed. Still not another device — write
            // the newer bytes over the moved revision instead of conflicting.
            log.info(
              "save: remote holds an earlier local write — writing newer bytes over it",
            );
            // fall through to the write below, which re-bases on `before`.
          } else {
            log.warn(
              "save: remote moved to an unrecognised document — real conflict",
            );
            throw new ConflictError({ text: remoteDoc, revision: current });
          }
        } else {
          // Encrypted: can't tell our own re-encryption from another device's
          // edit, so any revision move is treated as a genuine conflict.
          throw new ConflictError({ text: remoteDoc, revision: current });
        }
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

  // Cheap reachability check: a single directory listing, no file bodies.
  // Resolves true when the backend answered, false when the request couldn't
  // reach it (offline). A lapsed session re-throws `AuthError` so the caller
  // routes to Reconnect rather than parking in the offline state; any other
  // unexpected failure also counts as "not reachable" so the UI doesn't claim
  // we're back online on a backend that's still erroring.
  async function probe(): Promise<boolean> {
    try {
      await store.list();
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
