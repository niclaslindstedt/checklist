// Single source of truth for the "should this adapter be encryption-wrapped?"
// decision. Both the steady-state `adapter` memo and the folder seed / mirror
// `wrapForActive` path in `useStorageBackend` route through here, so the
// locked / plaintext / encrypted matrix lives in exactly one place instead of
// being re-derived at each wrapping site — two copies of the decision is two
// chances to diverge if the encryption matrix ever gains a case.

import type { StorageAdapter } from "./adapter.ts";
import type { EncryptionMode } from "./backend-preference.ts";
import { withEncryption } from "./encrypting/index.ts";

/**
 * Wrap `raw` in the session encryption envelope when encryption is on and a
 * passphrase is held; otherwise return it untouched. A null `password`
 * (encryption on but locked, or encryption off) passes through, so a wrapped
 * adapter is only ever produced with a usable key.
 */
export function wrapForEncryption(
  raw: StorageAdapter,
  mode: EncryptionMode,
  password: string | null,
): StorageAdapter {
  return mode === "encrypted" && password !== null
    ? withEncryption(raw, { current: password })
    : raw;
}
