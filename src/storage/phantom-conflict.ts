// Pure phantom-conflict detection for the file-based directory adapter.
//
// On a flaky link a save can commit to the backend while its response is lost,
// so the device never learns the new revision and keeps basing on the stale
// one. The next save then sees the aggregate revision "move" even though the
// remote holds exactly what this device wrote — that must NOT surface as a
// conflict over the user's own edit. This module holds the pure half of that
// decision: the content fingerprint, the order-independent canonical form the
// comparison is made on, and the adopt / overwrite / conflict verdict. The
// adapter (`directory-adapter.ts`) keeps the I/O (listing, reading, writing)
// and the persisted write log; everything here is a pure function over strings,
// so the algorithm can be unit-tested in isolation.

import type { Snapshot } from "../domain/types.ts";
import { parse, serialize } from "./serialize.ts";

// A compact, dependency-free content fingerprint for the write history: the
// string length plus two differently-seeded rolling hashes. Storing
// fingerprints rather than whole documents keeps the persisted log tiny and
// leaks no extra plaintext, while an accidental collision between two *distinct*
// documents stays vanishingly unlikely — enough to tell this device's own
// earlier write from another device's edit.
export function fingerprint(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xc2b2ae35;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca77) >>> 0;
  }
  return `${s.length}:${h1.toString(36)}:${h2.toString(36)}`;
}

// An order-independent canonical form of a document, for the phantom-conflict
// comparison only (never for what's written). `load` — and the remote
// readback — rebuilds a snapshot in the backend's file-*listing* order, while
// the bytes about to be written carry the *in-memory* order, which can come
// from the offline cache and need not match how the backend lists its files.
// The two then serialize the *same* content to the *same* byte length but a
// different top-level array order, so a raw string compare never matches — the
// field bug where the remote was byte-identical in size to this device's own
// earlier write yet came back "unrecognised". Sorting the checklist / template
// / folder arrays by id makes them comparable; item order *within* a list is
// intrinsic to the document and left untouched.
export function comparable(text: string): string {
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

/**
 * The verdict on a revision that moved past the caller's base:
 *
 *  - `adopt`     — the remote already holds exactly the document we're about to
 *                  write (our own lost-response write of these bytes is what
 *                  moved the revision). Nothing left to write; report success.
 *  - `overwrite` — the remote holds an *earlier* write of ours and the user has
 *                  since edited further, so the local document has moved ahead.
 *                  Still not another device — write the newer bytes over it.
 *  - `conflict`  — the remote moved to a document this device never wrote. A
 *                  genuine cross-device clash.
 */
export type PhantomResolution = "adopt" | "overwrite" | "conflict";

/**
 * Decide whether a moved aggregate revision is a phantom conflict (our own
 * lost-response write resurfacing) or a real cross-device clash.
 *
 * `writingFingerprint` is the fingerprint of the order-independent canonical
 * form of the bytes we're about to write; `remoteDoc` is the document the
 * backend now holds (already reconstructed and folder-injected by the adapter);
 * `recentWrites` is the history of documents this device has *attempted* to
 * write, newest last. The remote is compared on the same order-independent
 * footing the history is kept in, since it was rebuilt from a file listing
 * whose order need not match the in-memory document's.
 *
 * Encrypted envelopes carry a random IV, so two envelopes of the same document
 * never compare equal — the adapter never has a `writingFingerprint` for them
 * and resolves any revision move as a genuine conflict without calling this.
 */
export function resolvePhantomConflict(args: {
  writingFingerprint: string;
  remoteDoc: string;
  recentWrites: readonly string[];
}): PhantomResolution {
  const { writingFingerprint, remoteDoc, recentWrites } = args;
  const remoteFingerprint = fingerprint(comparable(remoteDoc));
  if (writingFingerprint === remoteFingerprint) return "adopt";
  if (recentWrites.includes(remoteFingerprint)) return "overwrite";
  return "conflict";
}
