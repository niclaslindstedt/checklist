// Higher-order adapter that wraps any `StorageAdapter` and applies
// password-based encryption at the byte boundary. The underlying
// adapter still sees opaque bytes, so the same wrapper works whether
// the bytes ultimately live in localStorage, a Dropbox app folder, or a
// Google Drive file. Ported from the budget project's
// `encrypting-adapter.ts`, pared to the checklist's smaller adapter
// surface (no backups, receipts, or `markSynced`).
//
// The password is held by reference so it can change at runtime (enable
// / disable encryption from settings) without re-creating the adapter.
// A null `passwordRef.current` means "pass through" — useful for the
// transitional window after the user enables encryption but before the
// imperative re-wrap of existing storage has run.

import { createLogger } from "../../dev/logger.ts";
import type {
  AdapterCapability,
  StorageAdapter,
  StoredSnapshot,
} from "../adapter.ts";
import {
  decryptEnvelope,
  encryptText,
  isEncryptedEnvelope,
} from "../crypto.ts";

const log = createLogger("encrypt");

export type PasswordRef = { readonly current: string | null };

export function withEncryption(
  inner: StorageAdapter,
  passwordRef: PasswordRef,
): StorageAdapter {
  // Forward every inner capability except `loadSync` — decryption is
  // async even when the inner backend can serve bytes synchronously, so
  // this wrapper never implements the sync fast path.
  const capabilities = new Set<AdapterCapability>(inner.capabilities);
  capabilities.delete("loadSync");

  return {
    id: inner.id,
    label: `${inner.label} (encrypted)`,
    saveDebounceMs: inner.saveDebounceMs,
    capabilities,

    // No `loadSync`: even when the inner adapter can hand back bytes
    // synchronously, decryption is asynchronous. Callers fall back to
    // `load()` and tolerate the brief loading state.

    getRevision: inner.getRevision ? () => inner.getRevision!() : undefined,
    // Reachability doesn't involve the passphrase — forward the probe as-is.
    probe: inner.probe ? () => inner.probe!() : undefined,

    async load(): Promise<StoredSnapshot | null> {
      log.info(`load: delegate to inner [${inner.id}]`);
      const snap = await inner.load();
      if (!snap) {
        log.info("load: inner returned null");
        return null;
      }
      if (!isEncryptedEnvelope(snap.text)) {
        // Plaintext leftover (e.g. encryption was just enabled and the
        // imperative re-wrap hasn't run yet) — hand it back as-is so the
        // document survives the transition.
        log.info(`load: inner bytes are plaintext (${snap.text.length} B)`);
        return snap;
      }
      const password = passwordRef.current;
      if (!password) {
        log.error("load: encrypted envelope but no password available");
        throw new Error("Storage is encrypted; password is required");
      }
      log.info(`load: decrypting envelope (${snap.text.length} B)`);
      const start = performance.now();
      try {
        const text = await decryptEnvelope(snap.text, password);
        const ms = (performance.now() - start).toFixed(0);
        log.info(`load: decrypt ok (${ms}ms) → ${text.length} B plaintext`);
        return { ...snap, text };
      } catch (err) {
        const ms = (performance.now() - start).toFixed(0);
        log.error(`load: decrypt failed (${ms}ms)`, err);
        throw err;
      }
    },

    async save(text: string, baseRevision?: string): Promise<StoredSnapshot> {
      const password = passwordRef.current;
      if (!password) {
        log.warn(
          `save: no password — writing plaintext (${text.length} B) to inner [${inner.id}]`,
        );
      } else {
        log.info(`save: encrypting plaintext (${text.length} B)`);
      }
      const start = performance.now();
      const payload = password ? await encryptText(text, password) : text;
      if (password) {
        const ms = (performance.now() - start).toFixed(0);
        log.info(`save: encrypt ok (${ms}ms) → ${payload.length} B envelope`);
      }
      const written = await inner.save(payload, baseRevision);
      // The caller compares revisions, not bytes, so it's safe to hand
      // back the plaintext alongside the revision the inner adapter
      // produced for the ciphertext.
      return { ...written, text };
    },

    watch: inner.watch
      ? (onRemoteChange) =>
          inner.watch!((snap) => {
            if (!isEncryptedEnvelope(snap.text)) {
              log.info("watch: remote bytes are plaintext — forwarding");
              onRemoteChange(snap);
              return;
            }
            const password = passwordRef.current;
            if (!password) {
              log.warn(
                "watch: remote is encrypted but no password — dropping update",
              );
              return;
            }
            decryptEnvelope(snap.text, password)
              .then((text) => {
                log.info("watch: decrypt ok — forwarding");
                onRemoteChange({ ...snap, text });
              })
              .catch((err) => {
                log.error("watch: decrypt failed — dropping update", err);
              });
          })
      : undefined,
  };
}
