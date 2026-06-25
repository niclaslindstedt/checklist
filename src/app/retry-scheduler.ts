// The cooldown scheduler the checklist's sync engine arms after a save
// backs off — the second half of the save state machine, sibling to the
// `SaveQueue` it composes. Framework-free (the only side effect is its own
// `setTimeout`) so the correctness-critical parts — the generation-guarded
// resume and the per-failure backoff escalation — are directly
// unit-testable instead of only reachable through the full
// `useChecklistSync` hook.
//
// It owns three pieces of mutable state the hook used to keep inline:
//
// 1. **The armed resume timer.** At most one cooldown is pending at a time.
//    `arm` re-queues the failed snapshot (via the `SaveQueue`, so a newer
//    edit that already arrived wins) and schedules a single resume; a fresh
//    `arm` cancels any prior one so edits coalesce into one resume rather
//    than stacking timers. The timer captures the queue's generation at arm
//    time and bails — without resuming — if the document was swapped
//    wholesale (backend change, reload, conflict-adopt) before it fired, so
//    a stale resume can't write the old baseline onto the new one.
//
// 2. **The throttle escalation counter.** Back-to-back rate limits (HTTP
//    429) with no save in between floor the backend's `retryAfterMs`
//    against an escalating backoff curve, so a server returning a tiny (or
//    zero) cooldown can't pull autosave into a tight resend loop. Reset the
//    moment a save lands.
//
// 3. **The transient retry budget.** Consecutive transient (non-typed) save
//    failures retry on a growing backoff up to `MAX_TRANSIENT_SAVE_RETRIES`
//    before the save path gives up and surfaces a hard error. Reset on
//    success, and also on the offline / hard-error paths (which don't spend
//    the transient budget).

import {
  backoffDelayMs,
  MAX_TRANSIENT_SAVE_RETRIES,
} from "../storage/save-retry.ts";
import type { SaveQueue } from "./save-queue.ts";

export class RetryScheduler<T> {
  // The single armed cooldown resume; non-null means a cooldown is in
  // progress and the hook's `flushSave` should stay queued rather than
  // start a fresh write.
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Count of back-to-back rate limits with no successful save in between.
  private throttles = 0;
  // Count of consecutive transient save failures bounding the retry curve.
  private transients = 0;

  constructor(
    // The save queue this scheduler shares with the hook — read for the
    // generation guard and used to re-queue a failed snapshot on arm.
    private readonly queue: SaveQueue<T>,
    // Called when an armed cooldown elapses and its generation is still
    // current. In the hook this drains the queue with a fresh write.
    private readonly resume: () => void,
    // Injectable jitter source, threaded into `backoffDelayMs` so tests can
    // pin the escalation curve. Production uses the default `Math.random`.
    private readonly rand: () => number = Math.random,
  ) {}

  /** Whether a cooldown resume is currently armed (the `flushSave` guard). */
  get armed(): boolean {
    return this.timer !== null;
  }

  /**
   * Re-queue a failed snapshot and schedule a resume `waitMs` from now.
   * Captures the queue generation at arm time; when the timer fires it bails
   * without resuming if the document was swapped wholesale in the meantime.
   */
  arm(failedDoc: T, waitMs: number): void {
    this.queue.requeue(failedDoc);
    this.cancelTimer();
    const generation = this.queue.generation;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.queue.isStale(generation)) return;
      this.resume();
    }, waitMs);
  }

  /**
   * Cooldown for a rate limit: floor the backend's `retryAfterMs` against
   * the backoff curve and advance the escalation counter so a run of 429s
   * widens the wait. Returns both the chosen wait and the computed floor
   * (the caller logs them).
   */
  nextThrottleDelay(retryAfterMs: number): { waitMs: number; floorMs: number } {
    const floorMs = backoffDelayMs(this.throttles, {}, this.rand);
    this.throttles += 1;
    return { waitMs: Math.max(retryAfterMs, floorMs), floorMs };
  }

  /** Whether another transient retry is still within budget. */
  get canRetryTransient(): boolean {
    return this.transients < MAX_TRANSIENT_SAVE_RETRIES;
  }

  /**
   * The next transient backoff delay; advances the attempt counter and
   * returns the post-increment attempt number (the caller logs it as
   * `attempt/${MAX_TRANSIENT_SAVE_RETRIES}`).
   */
  nextTransientDelay(): { waitMs: number; attempt: number } {
    const waitMs = backoffDelayMs(this.transients, {}, this.rand);
    this.transients += 1;
    return { waitMs, attempt: this.transients };
  }

  /** Reset just the transient budget (offline / hard-error paths). */
  resetTransients(): void {
    this.transients = 0;
  }

  /** Reset both escalation counters after a save lands. */
  resetCounters(): void {
    this.throttles = 0;
    this.transients = 0;
  }

  /** Cancel any armed resume without touching the counters. */
  cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Cancel any armed resume and reset both escalation counters. */
  cancel(): void {
    this.cancelTimer();
    this.resetCounters();
  }
}
