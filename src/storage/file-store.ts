// The small contract a file-based backend implements so the shared
// directory adapter (`./directory-adapter.ts`) can store a namespace as a
// folder of individual markdown files. Each backend (local folder,
// Dropbox, Google Drive) only has to move bytes for a single relative
// path; the markdown <-> snapshot conversion, the encrypted-blob
// fallback, and conflict detection all live once in the directory
// adapter.
//
// Paths are POSIX-style and relative to the namespace root
// (`checklists/<stem>.md`, `templates/<stem>.md`, or `checklist.json`).
// Each store prepends its own root: the folder backend a subdirectory of
// the picked handle, Dropbox `/<namespace>/…`, Drive `checklist/<namespace>/…`.

/** A file's path plus an opaque per-file revision used to detect drift. */
export type FileEntry = {
  path: string;
  // Backend-defined token that changes when the file's bytes change: a
  // folder mtime, a Dropbox `rev`, a Drive version. Used only to build
  // the directory's aggregate revision — never interpreted.
  rev?: string;
};

export interface FileStore {
  /** Every file under the namespace root, with its current revision. */
  list(): Promise<FileEntry[]>;
  /** Read one file's bytes, or null when it doesn't exist. */
  read(path: string): Promise<string | null>;
  /** Write (create or overwrite) one file. */
  write(path: string, text: string): Promise<void>;
  /** Delete one file. A missing file is treated as already gone. */
  remove(path: string): Promise<void>;
}
