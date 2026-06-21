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

import type { Folder, Snapshot } from "../domain/types.ts";
import type { StorageAdapter, StoredSnapshot } from "./adapter.ts";
import { ConflictError } from "./adapter.ts";
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
};

export function createDirectoryAdapter(
  store: FileStore,
  options: DirectoryAdapterOptions,
): StorageAdapter {
  // The canonical JSON of the folder registry as it currently stands on disk
  // (null = no `folders.json` sidecar exists). Set on every load and after
  // each write so `save` skips a redundant rewrite when the folders didn't
  // change, and so enabling encryption knows whether a stale sidecar needs
  // clearing.
  let lastFoldersJson: string | null = null;

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
        // and would surface a conflict over the user's own edit. If the remote
        // already holds exactly the document we're about to write, that earlier
        // write is what moved it — adopt the new revision and report success
        // instead of interrupting the user. (Plaintext only: two AES-GCM
        // envelopes of the same document differ by their random IV, so an
        // encrypted blob can't be compared this way and always conflicts.)
        if (!isEncryptedEnvelope(text) && loadEquivalent(text) === remoteDoc) {
          return { text, revision: current };
        }
        throw new ConflictError({ text: remoteDoc, revision: current });
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

  return {
    id: options.id,
    label: options.label,
    saveDebounceMs: options.saveDebounceMs,
    capabilities: new Set(),
    load,
    save,
  };
}
