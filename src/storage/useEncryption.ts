// At-rest encryption lifecycle as a React hook: owns the encryption-mode
// and session-passphrase state, derives the `locked` gate, and carries the
// enable / disable / unlock verbs that re-wrap (or decrypt) whatever the
// active backend currently holds. Peeled out of `useStorageBackend` so the
// crypto round-trip is unit-testable against a mocked adapter instead of a
// live cloud backend, mirroring how `useNamespaceRegistry` was extracted.
//
// Encryption note: there are no user accounts, so the passphrase isn't
// derived from a login — it's set explicitly in Settings and held only in
// memory for the session. After a reload the app is "locked" (encryption is
// on but no passphrase is held) until the user re-enters it; the `locked`
// flag drives the unlock gate in `App`.

import { useCallback, useState } from "react";

// Aliased: this hook exposes an encryption `unlock` verb, so the achievement
// bus's `unlock` comes in under a distinct name.
import { unlock as unlockAchievement } from "../achievements/bus.ts";
import { createLogger } from "../dev/logger.ts";
import {
  RateLimitError,
  type StorageAdapter,
  type StoredSnapshot,
} from "./adapter.ts";
import {
  type EncryptionMode,
  getEncryption,
  setEncryption as persistEncryption,
} from "./backend-preference.ts";
import { OfflineUnavailableError } from "./cache/index.ts";
import { decryptEnvelope, encryptText, isEncryptedEnvelope } from "./crypto.ts";

const log = createLogger("storage");

// The ordered phases turning encryption on/off passes through, surfaced to the
// settings UI so it can flash a one-line status while the work runs. `reading`,
// `saving`, and `finalizing` bracket the storage round-trip; the key-derivation
// and cipher phases (`derivingKey` / `encrypting` / `decrypting`) bubble up
// from the crypto layer — the superset keeps a single callback driving both.
export type EncryptionProgressStep =
  | "reading"
  | "derivingKey"
  | "encrypting"
  | "decrypting"
  | "saving"
  | "throttled"
  | "finalizing";
export type EncryptionProgress = (step: EncryptionProgressStep) => void;

// How many times an enable/disable re-wrap rides out a backend rate limit (HTTP
// 429) before giving up, and the ceiling on each honoured cooldown. The
// steady-state save path parks in `throttled` and retries forever, but the
// encryption toggle drives the backend directly and outside that loop, so it
// needs its own bounded retry: without it a 429 aborts the re-wrap partway,
// which is precisely what stranded the document (see `directory-adapter`'s
// `readSnapshotText`). Bounded so a genuinely stuck backend still surfaces as a
// failure — which, thanks to the staging guard, is now recoverable rather than
// lossy.
const RATE_LIMIT_MAX_RETRIES = 8;
const RATE_LIMIT_MAX_WAIT_MS = 30_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Run a storage op, riding out a backend rate limit instead of letting it abort
// the re-wrap. Honours the backend's `retryAfterMs` (capped), flashes the
// `throttled` phase so the UI shows it's waiting rather than stalled, and
// rethrows any non-429 error (and the 429 itself once the budget is spent) so a
// real failure still surfaces.
async function withRateLimitRetries<T>(
  op: () => Promise<T>,
  onThrottle: () => void,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (
        !(err instanceof RateLimitError) ||
        attempt >= RATE_LIMIT_MAX_RETRIES
      ) {
        throw err;
      }
      const waitMs = Math.min(err.retryAfterMs, RATE_LIMIT_MAX_WAIT_MS);
      log.warn(
        `encryption toggle throttled — retry in ${waitMs}ms ` +
          `(attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`,
      );
      onThrottle();
      await sleep(waitMs);
    }
  }
}

export interface Encryption {
  /** Encryption mode (`plaintext` | `encrypted`). */
  encryption: EncryptionMode;
  /**
   * The session passphrase, or `null` when none is held — either because
   * encryption is off, or because it's on but not yet unlocked this session.
   * Never persisted; lost on reload by design.
   */
  password: string | null;
  /** True when encryption is on but no passphrase is held yet (needs unlock). */
  locked: boolean;
  /**
   * Turn encryption on with a fresh passphrase, re-wrapping stored bytes.
   * `onProgress` (optional) fires once per phase so the UI can show progress.
   */
  enableEncryption: (
    password: string,
    onProgress?: EncryptionProgress,
  ) => Promise<void>;
  /**
   * Turn encryption off, decrypting stored bytes back to plaintext.
   * `onProgress` (optional) fires once per phase so the UI can show progress.
   */
  disableEncryption: (onProgress?: EncryptionProgress) => Promise<void>;
  /**
   * Supply the passphrase for an already-encrypted store; throws if wrong.
   * `onProgress` (optional) fires once per phase so the unlock gate can flash a
   * status line while the passphrase is checked and the document decrypts.
   */
  unlock: (password: string, onProgress?: EncryptionProgress) => Promise<void>;
}

// `inner` is the active namespace's *unwrapped* scoped backend — the bytes the
// enable / disable / unlock verbs re-wrap, decrypt, and probe. The caller
// layers `withEncryption` on top of `inner` for the steady-state adapter using
// the `encryption` / `password` this hook owns.
export function useEncryption(inner: StorageAdapter): Encryption {
  const [encryption, setEncryptionState] =
    useState<EncryptionMode>(getEncryption);
  // Session-only passphrase. Never persisted — lost on reload by design.
  const [password, setPassword] = useState<string | null>(null);

  const locked = encryption === "encrypted" && password === null;

  const enableEncryption = useCallback(
    async (next: string, onProgress?: EncryptionProgress) => {
      if (!next) throw new Error("Passphrase is required");
      log.info("enable encryption: start");
      // Re-wrap whatever the inner backend currently holds so existing
      // plaintext becomes an envelope. A first run with no data is a
      // no-op beyond flipping the flag.
      const throttle = () => onProgress?.("throttled");
      onProgress?.("reading");
      const snap = await withRateLimitRetries(() => inner.load(), throttle);
      if (snap && !isEncryptedEnvelope(snap.text)) {
        const payload = await encryptText(snap.text, next, onProgress);
        onProgress?.("saving");
        // No base revision: the re-wrap is a deliberate whole-document rewrite,
        // and a 429 that lands mid-write moves the aggregate revision, so
        // re-basing on the pre-write revision would surface our own retry as a
        // phantom conflict. The prior representation stays authoritative until
        // this write lands whole, so force-writing is safe (see
        // `directory-adapter`'s `readSnapshotText`).
        await withRateLimitRetries(() => inner.save(payload), throttle);
      }
      onProgress?.("finalizing");
      persistEncryption("encrypted");
      setEncryptionState("encrypted");
      setPassword(next);
      log.info("enable encryption: done");
      unlockAchievement("paranoidMode");
    },
    [inner],
  );

  const disableEncryption = useCallback(
    async (onProgress?: EncryptionProgress) => {
      if (password === null) {
        throw new Error("Unlock before turning encryption off");
      }
      log.info("disable encryption: start");
      // Rewrite the document at rest as plaintext and drop the encrypted blob.
      // Decrypt when the load surfaced the envelope; when a stale plaintext
      // copy shadows the blob (a both-representations state a backend can drift
      // into), the load returns that document instead, so re-save it as-is.
      // Either way the plaintext write makes the directory adapter clear the
      // superseded `checklist.json`, so disabling can't leave the envelope
      // behind — gating the re-save on the load happening to surface the
      // envelope is what let the file linger.
      const throttle = () => onProgress?.("throttled");
      onProgress?.("reading");
      const snap = await withRateLimitRetries(() => inner.load(), throttle);
      if (snap) {
        const plaintext = isEncryptedEnvelope(snap.text)
          ? await decryptEnvelope(snap.text, password, onProgress)
          : snap.text;
        onProgress?.("saving");
        // No base revision: force-write the decrypted plaintext. A 429 can land
        // after some markdown files are written, moving the aggregate revision;
        // re-basing on the pre-write revision would then surface our own
        // half-written document as a phantom conflict and abort the retry. The
        // encrypted blob stays authoritative (and is what a fresh load recovers)
        // until this write fully lands and drops it — so an interrupted attempt
        // is recoverable, never lossy.
        await withRateLimitRetries(() => inner.save(plaintext), throttle);
      }
      onProgress?.("finalizing");
      persistEncryption("plaintext");
      setEncryptionState("plaintext");
      setPassword(null);
      log.info("disable encryption: done");
    },
    [inner, password],
  );

  const unlock = useCallback(
    async (candidate: string, onProgress?: EncryptionProgress) => {
      if (!candidate) throw new Error("Passphrase is required");
      // Verify by decrypting the stored envelope. For a cloud backend the
      // load falls back to the on-device cache when offline, so the
      // passphrase can be checked in airplane mode against the cached
      // ciphertext. If the backend is unreachable *and* nothing is cached,
      // map it to a distinct error so the gate says "you're offline" instead
      // of the misleading "wrong passphrase".
      onProgress?.("reading");
      let snap: StoredSnapshot | null;
      try {
        snap = await inner.load();
      } catch (err) {
        log.warn("unlock: backend unreachable and no cached copy", err);
        throw new OfflineUnavailableError();
      }
      // Plaintext-at-rest (the re-wrap never ran) can't be verified, so it
      // unlocks optimistically. `decryptEnvelope` reports the `derivingKey`
      // and `decrypting` phases itself.
      if (snap && isEncryptedEnvelope(snap.text)) {
        await decryptEnvelope(snap.text, candidate, onProgress); // throws on wrong pass
      }
      onProgress?.("finalizing");
      setPassword(candidate);
    },
    [inner],
  );

  return {
    encryption,
    password,
    locked,
    enableEncryption,
    disableEncryption,
    unlock,
  };
}
