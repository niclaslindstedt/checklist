// Direct unit coverage for the cooldown scheduler extracted from
// `use-checklist-sync.ts`. The generation-guarded resume, the throttle
// escalation curve, and the transient retry budget were previously only
// reachable through the full sync hook; here they are exercised in
// isolation. Jitter is pinned via the injectable `rand` so the backoff
// curve is deterministic.
import { afterEach, describe, expect, it, vi } from "vitest";

import { RetryScheduler } from "../../src/app/retry-scheduler.ts";
import { SaveQueue } from "../../src/app/save-queue.ts";
import { MAX_TRANSIENT_SAVE_RETRIES } from "../../src/storage/save-retry.ts";

// rand → 0 pins each backoff delay to exactly half its cap:
// attempt 0 → 250ms, 1 → 500ms, 2 → 1000ms, 3 → 2000ms, 4 → 4000ms.
const noJitter = () => 0;

describe("RetryScheduler arm / generation guard", () => {
  afterEach(() => vi.useRealTimers());

  it("re-queues the failed snapshot and resumes once the cooldown elapses", () => {
    vi.useFakeTimers();
    const queue = new SaveQueue<string>();
    const resume = vi.fn();
    const scheduler = new RetryScheduler(queue, resume, noJitter);

    scheduler.arm("doc", 100);
    // The failed snapshot is parked in the queue so the resume has bytes.
    expect(queue.hasPending).toBe(true);
    expect(scheduler.armed).toBe(true);
    expect(resume).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(scheduler.armed).toBe(false);
  });

  it("does NOT resume when the document was swapped wholesale before the timer fired", () => {
    vi.useFakeTimers();
    const queue = new SaveQueue<string>();
    const resume = vi.fn();
    const scheduler = new RetryScheduler(queue, resume, noJitter);

    scheduler.arm("doc", 100);
    // A reload / backend swap / conflict-adopt bumps the generation. The
    // armed resume captured the old generation, so it must bail.
    queue.reset();
    vi.advanceTimersByTime(100);
    expect(resume).not.toHaveBeenCalled();
  });

  it("coalesces back-to-back arms into a single resume (cancels the prior timer)", () => {
    vi.useFakeTimers();
    const queue = new SaveQueue<string>();
    const resume = vi.fn();
    const scheduler = new RetryScheduler(queue, resume, noJitter);

    scheduler.arm("a", 100);
    scheduler.arm("b", 100);
    vi.advanceTimersByTime(100);
    // Only the second timer survives; the first was cleared.
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("cancelTimer disarms a pending resume without firing it", () => {
    vi.useFakeTimers();
    const queue = new SaveQueue<string>();
    const resume = vi.fn();
    const scheduler = new RetryScheduler(queue, resume, noJitter);

    scheduler.arm("doc", 100);
    scheduler.cancelTimer();
    expect(scheduler.armed).toBe(false);
    vi.advanceTimersByTime(100);
    expect(resume).not.toHaveBeenCalled();
  });
});

describe("RetryScheduler throttle escalation", () => {
  it("floors retryAfter against the backoff curve and escalates per consecutive 429", () => {
    const scheduler = new RetryScheduler(
      new SaveQueue<string>(),
      () => {},
      noJitter,
    );

    // A tiny server cooldown is floored to the curve's first step (250ms)...
    expect(scheduler.nextThrottleDelay(50)).toEqual({
      waitMs: 250,
      floorMs: 250,
    });
    // ...and the floor escalates on the next consecutive 429 (500ms).
    expect(scheduler.nextThrottleDelay(50)).toEqual({
      waitMs: 500,
      floorMs: 500,
    });
    // A generous server cooldown wins over the (now 1000ms) floor.
    expect(scheduler.nextThrottleDelay(5000)).toEqual({
      waitMs: 5000,
      floorMs: 1000,
    });
  });

  it("resetCounters restarts the throttle escalation from the first step", () => {
    const scheduler = new RetryScheduler(
      new SaveQueue<string>(),
      () => {},
      noJitter,
    );
    scheduler.nextThrottleDelay(0);
    scheduler.nextThrottleDelay(0);
    scheduler.resetCounters();
    expect(scheduler.nextThrottleDelay(0)).toEqual({
      waitMs: 250,
      floorMs: 250,
    });
  });
});

describe("RetryScheduler transient budget", () => {
  it("grows the backoff each attempt and exhausts after MAX_TRANSIENT_SAVE_RETRIES", () => {
    const scheduler = new RetryScheduler(
      new SaveQueue<string>(),
      () => {},
      noJitter,
    );

    const delays: number[] = [];
    let attempts = 0;
    while (scheduler.canRetryTransient) {
      const { waitMs, attempt } = scheduler.nextTransientDelay();
      delays.push(waitMs);
      attempts += 1;
      expect(attempt).toBe(attempts);
    }
    expect(attempts).toBe(MAX_TRANSIENT_SAVE_RETRIES);
    // Each step at least doubles the cap → strictly growing delays.
    expect(delays).toEqual([250, 500, 1000, 2000]);
    expect(scheduler.canRetryTransient).toBe(false);
  });

  it("resetTransients reopens the budget without touching the throttle counter", () => {
    const scheduler = new RetryScheduler(
      new SaveQueue<string>(),
      () => {},
      noJitter,
    );
    // Spend the throttle counter and the full transient budget.
    scheduler.nextThrottleDelay(0);
    while (scheduler.canRetryTransient) scheduler.nextTransientDelay();
    expect(scheduler.canRetryTransient).toBe(false);

    scheduler.resetTransients();
    expect(scheduler.canRetryTransient).toBe(true);
    // The throttle escalation is untouched — next 429 floors at the 2nd step.
    expect(scheduler.nextThrottleDelay(0).floorMs).toBe(500);
  });

  it("cancel clears the timer AND both escalation counters", () => {
    vi.useFakeTimers();
    const queue = new SaveQueue<string>();
    const resume = vi.fn();
    const scheduler = new RetryScheduler(queue, resume, noJitter);

    scheduler.nextThrottleDelay(0);
    scheduler.nextTransientDelay();
    scheduler.arm("doc", 100);

    scheduler.cancel();
    expect(scheduler.armed).toBe(false);
    expect(scheduler.canRetryTransient).toBe(true);
    expect(scheduler.nextThrottleDelay(0).floorMs).toBe(250);
    vi.advanceTimersByTime(100);
    expect(resume).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
