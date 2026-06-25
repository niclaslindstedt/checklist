// The serialized-save state machine the checklist's sync engine runs on
// top of any `StorageBackend`. Framework-free and pure (no React, no I/O)
// so the coalescing and stale-generation rules — the correctness-critical
// part of the save path — are directly unit-testable instead of only
// reachable through the full `useChecklistSync` hook.
//
// Three invariants live here:
//
// 1. **At most one write in flight.** A second save started before the
//    first resolves would base on a revision the in-flight write is about
//    to bump, so the backend rejects the loser as a `ConflictError` — the
//    device colliding with *itself* on a slow link. Callers gate on
//    `inFlight` and leave the edit queued instead.
//
// 2. **Newest snapshot wins.** Each enqueued value is a complete snapshot,
//    so edits that pile up during an in-flight write coalesce: the latest
//    supersedes every one before it and a single follow-up save drains the
//    queue. `requeue` is the softer variant used by the retry / offline
//    paths — it only re-arms a failed snapshot when nothing newer has
//    already taken its place.
//
// 3. **A generation token invalidates stale results.** When the on-screen
//    document is replaced wholesale (backend swap, reload, conflict-adopt)
//    the generation is bumped; an in-flight save captured the old value at
//    launch, so its write-back and any queued follow-up describe a baseline
//    that no longer exists and are dropped.

export class SaveQueue<T> {
  // Latest unsaved document; `take()` drains it. Null when the queue is
  // empty.
  private pending: T | null = null;
  // At most one write in flight at a time.
  private writing = false;
  // Bumped whenever the document is replaced wholesale. A save captures
  // this at launch and checks it again on completion via `isStale`.
  private generationCounter = 0;

  /** Queue an edit, replacing any prior unsaved snapshot. */
  enqueue(doc: T): void {
    this.pending = doc;
  }

  /**
   * Re-queue a snapshot only if nothing newer already superseded it — the
   * "unless a newer edit already arrived" rule the retry / offline-resume /
   * hard-error paths use so a resume always has bytes to push without
   * clobbering a fresh edit.
   */
  requeue(doc: T): void {
    if (this.pending === null) this.pending = doc;
  }

  /** Whether an unsaved edit is waiting. */
  get hasPending(): boolean {
    return this.pending !== null;
  }

  /** Take the queued edit (clearing it), or null if none is waiting. */
  take(): T | null {
    const next = this.pending;
    this.pending = null;
    return next;
  }

  /** Whether a write is currently in flight. */
  get inFlight(): boolean {
    return this.writing;
  }

  /** Mark a write as started. */
  beginFlight(): void {
    this.writing = true;
  }

  /** Mark the in-flight write as finished. */
  endFlight(): void {
    this.writing = false;
  }

  /** The current generation token; a save captures this at launch. */
  get generation(): number {
    return this.generationCounter;
  }

  /**
   * Whether `generation` no longer matches the live token — i.e. the
   * document was swapped out from under a save captured at that generation,
   * so its result must be dropped.
   */
  isStale(generation: number): boolean {
    return this.generationCounter !== generation;
  }

  /**
   * Abandon any in-flight or queued save and start a fresh baseline: bump
   * the generation (so an outstanding save's write-back becomes a no-op),
   * clear the in-flight flag, and drop the pending edit. Called on backend
   * swap, reload, and conflict-adopt.
   */
  reset(): void {
    this.generationCounter += 1;
    this.writing = false;
    this.pending = null;
  }
}
