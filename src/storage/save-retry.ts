// Retry policy for the save path. Pure so the schedule can be
// unit-tested without a fake timer or a live adapter; the sync engine in
// `src/app/use-checklist-sync.ts` reads `MAX_TRANSIENT_SAVE_RETRIES`,
// `backoffDelayMs`, and `isRetryableSaveError` and owns the actual
// `setTimeout` / save-queue plumbing.
//
// Two callers, two shapes:
//
// 1. Transient save failures — the generic `catch` branch that would
//    otherwise surface a red `error` on the first hiccup. A reachable
//    backend that returns 5xx (or a bare adapter that throws a raw
//    network error) is almost always a momentary blip on a flaky mobile
//    link. We re-queue the failed snapshot and retry up to
//    `MAX_TRANSIENT_SAVE_RETRIES` times with growing backoff before
//    giving up and surfacing `error`.
//
// 2. Rate limits (HTTP 429) — the backend hands us a `retryAfterMs`. We
//    honour it, but floor it against the same backoff curve and escalate
//    per consecutive 429 so a server that returns a tiny (or zero)
//    cooldown can't pull us into a tight resend loop. There is
//    deliberately NO budget here: giving up on a rate limit would
//    surface a red error and stop autosave, which is worse than
//    continuing to wait — so the throttle path keeps retrying.

import { AuthError, ConflictError, RateLimitError } from "./adapter.ts";

// Number of automatic retries for a transient save failure before the
// save path surfaces a hard `error`. The first attempt isn't a retry,
// so the worst case is 1 + this many calls to `adapter.save`.
export const MAX_TRANSIENT_SAVE_RETRIES = 4;

// How long to wait before a gentle background resume of a save that failed
// because the backend was unreachable (a raw network error / offline), as
// opposed to a transient 5xx from a reachable backend. An offline failure is
// handled apart from the fast escalating backoff above: `withLocalCache` has
// already persisted the bytes, so it is never surfaced as a hard error and
// never spends the transient budget. Instead the save is retried on this
// single, slow, unbudgeted interval — enough that a flaky link recovers on its
// own, without the per-couple-of-seconds storm (and the heavy re-serialization
// each attempt drags in) the fast curve would create across a long outage. The
// `online` event, the Check connection probe, and the next edit also resume,
// so this interval only needs to be a gentle safety net.
export const OFFLINE_RESUME_MS = 15_000;

export type BackoffOptions = {
  // First step of the curve, in ms. attempt 0 caps at this value.
  baseMs?: number;
  // Multiplier per attempt: cap = baseMs * factor^attempt.
  factor?: number;
  // Hard ceiling on the cap so a long run of failures can't schedule
  // a multi-minute wait.
  maxMs?: number;
};

const DEFAULT_BACKOFF: Required<BackoffOptions> = {
  baseMs: 500,
  factor: 2,
  maxMs: 30_000,
};

// Equal-jitter exponential backoff. The deterministic cap for an
// attempt is `min(maxMs, baseMs * factor^attempt)`; the returned delay
// is `cap/2 + random(0, cap/2)`, i.e. somewhere in `[cap/2, cap)`.
// Equal jitter (rather than full jitter, `random(0, cap)`) guarantees
// each wait is at least half the cap so the curve always makes forward
// progress, while still de-correlating concurrent clients.
//
// `rand` is injectable so tests can pin the jitter; production passes
// the default `Math.random`.
export function backoffDelayMs(
  attempt: number,
  options: BackoffOptions = {},
  rand: () => number = Math.random,
): number {
  const { baseMs, factor, maxMs } = { ...DEFAULT_BACKOFF, ...options };
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const uncapped = baseMs * Math.pow(factor, safeAttempt);
  const cap = Math.min(maxMs, uncapped);
  const half = cap / 2;
  return Math.round(half + rand() * half);
}

// True for errors the save path should retry automatically. The
// adapter's three typed signals each have dedicated handling upstream
// (`ConflictError` → resolution modal, `AuthError` → reconnect prompt,
// `RateLimitError` → throttle cooldown), so they're explicitly NOT
// transient-retryable here. Everything else reaching the generic catch
// is treated as a momentary backend hiccup worth a bounded retry — a
// deterministic failure simply fails the same way a few times and then
// surfaces, which costs a few seconds and never loses data.
export function isRetryableSaveError(err: unknown): boolean {
  if (err instanceof ConflictError) return false;
  if (err instanceof AuthError) return false;
  if (err instanceof RateLimitError) return false;
  return true;
}
