// Direct unit coverage for the serialized-save state machine extracted
// from `use-checklist-sync.ts`. The coalescing ("newest snapshot wins"),
// the single-in-flight gate, and the stale-generation guard were
// previously only reachable through the full sync hook; here they are
// exercised in isolation.
import { describe, expect, it } from "vitest";

import { SaveQueue } from "../../src/app/save-queue.ts";

describe("SaveQueue coalescing", () => {
  it("take() drains the queued edit and empties it", () => {
    const q = new SaveQueue<string>();
    expect(q.hasPending).toBe(false);
    expect(q.take()).toBeNull();

    q.enqueue("a");
    expect(q.hasPending).toBe(true);
    expect(q.take()).toBe("a");
    expect(q.hasPending).toBe(false);
    expect(q.take()).toBeNull();
  });

  it("enqueue keeps only the newest snapshot — earlier edits coalesce away", () => {
    const q = new SaveQueue<string>();
    q.enqueue("a");
    q.enqueue("b");
    q.enqueue("c");
    // The newest snapshot covers every one before it.
    expect(q.take()).toBe("c");
    expect(q.hasPending).toBe(false);
  });

  it("requeue only re-arms when nothing newer already superseded it", () => {
    const q = new SaveQueue<string>();
    // Empty queue: requeue arms the failed snapshot so a resume has bytes.
    q.requeue("failed");
    expect(q.take()).toBe("failed");

    // A newer edit is already queued: requeue must not clobber it.
    q.enqueue("fresh");
    q.requeue("failed");
    expect(q.take()).toBe("fresh");
  });
});

describe("SaveQueue in-flight gate", () => {
  it("tracks a single write in flight", () => {
    const q = new SaveQueue<string>();
    expect(q.inFlight).toBe(false);
    q.beginFlight();
    expect(q.inFlight).toBe(true);
    q.endFlight();
    expect(q.inFlight).toBe(false);
  });
});

describe("SaveQueue generation guard", () => {
  it("a captured generation goes stale once the queue resets", () => {
    const q = new SaveQueue<string>();
    const captured = q.generation;
    expect(q.isStale(captured)).toBe(false);

    q.reset();
    // The baseline was swapped — a save captured at `captured` is now stale.
    expect(q.isStale(captured)).toBe(true);
    // The fresh generation matches itself.
    expect(q.isStale(q.generation)).toBe(false);
  });

  it("reset abandons in-flight and pending state and bumps the generation", () => {
    const q = new SaveQueue<string>();
    q.enqueue("queued");
    q.beginFlight();
    const before = q.generation;

    q.reset();

    expect(q.generation).toBe(before + 1);
    expect(q.inFlight).toBe(false);
    expect(q.hasPending).toBe(false);
    expect(q.take()).toBeNull();
  });

  it("each reset advances the generation monotonically", () => {
    const q = new SaveQueue<string>();
    const g0 = q.generation;
    q.reset();
    q.reset();
    q.reset();
    expect(q.generation).toBe(g0 + 3);
    expect(q.isStale(g0)).toBe(true);
  });
});
