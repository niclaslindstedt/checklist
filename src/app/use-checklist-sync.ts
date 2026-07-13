// The checklist's persistence engine: the debounced-save plumbing, the
// save-status / dirty / conflict state machine, and the load / reload /
// save-now / resolve-conflict verbs that move bytes between the in-memory
// document and the active StorageAdapter.
//
// Split out of `use-checklist.ts` so a new save / conflict feature lands
// in this concern-scoped file rather than the central hook. The undo
// timeline is threaded in by reference: the load / reload / conflict-adopt
// paths must reset the timeline (the old history describes edits against a
// document that's gone), but the timeline hook is constructed *after* this
// one in `use-checklist.ts` (it needs this hook's `setDoc` / `scheduleSave`
// to apply an undone snapshot). That construction cycle is broken with a
// ref: the parent passes an empty `resetHistory` ref here, then points it
// at the real `reset` once the timeline exists.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { unlock } from "../achievements/bus.ts";
import { createLogger } from "../dev/logger.ts";
import { createChecklist } from "../domain/checklists.ts";
import type { Snapshot } from "../domain/types.ts";
import {
  AuthError,
  ConflictError,
  RateLimitError,
  type StorageAdapter,
} from "../storage/adapter.ts";
import {
  describeStorageError,
  isOfflineError,
} from "../storage/cache/index.ts";
import {
  isRetryableSaveError,
  MAX_TRANSIENT_SAVE_RETRIES,
  OFFLINE_RESUME_MS,
} from "../storage/save-retry.ts";
import { parse, serialize } from "../storage/serialize.ts";
import { RetryScheduler } from "./retry-scheduler.ts";
import { SaveQueue } from "./save-queue.ts";
import { newId, now } from "./side-effects.ts";

const log = createLogger("checklist");

/**
 * Outcome of an active reachability probe (the "Check connection" gesture
 * on the offline glyph):
 * - `online` — the backend answered; the document was re-read and any edit
 *   that piled up offline was pushed.
 * - `offline` — still unreachable; the user stays on the local copy.
 * - `auth-error` — the session lapsed (not an outage); the UI routes to
 *   Reconnect instead.
 */
export type ConnectionProbeResult = "online" | "offline" | "auth-error";

/** The name a freshly-minted checklist carries until the user renames it. */
export const DEFAULT_LIST_NAME = "Checklist";

/** A divergence between the on-screen document and the backend's. */
export type ConflictState = {
  /** The bytes currently on the backend (typically another device's edit). */
  remote: Snapshot;
  /** The remote revision to base a "keep mine" overwrite on. */
  remoteRevision?: string;
};

/**
 * Coarse state of the last save against the active backend, driving the
 * cloud-sync status glyph in the header. A pared-down version of the
 * budget project's `SaveStatus` — the checklist has no offline mirror or
 * parse-error surface, so those states don't apply.
 */
export type SaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "conflict"
  | "auth-error"
  | "throttled";

// Guarantee the document always has one checklist to render. A freshly
// created default list isn't persisted until the first real edit, so a
// bare reload never writes an empty document.
export function withActiveList(snapshot: Snapshot): Snapshot {
  if (snapshot.checklists.length > 0) return snapshot;
  const list = createChecklist(newId(), DEFAULT_LIST_NAME, now());
  return { ...snapshot, checklists: [list] };
}

export interface ChecklistSync {
  /** The full in-memory document. */
  doc: Snapshot;
  /**
   * False until the active backend's first async load has resolved (and
   * again briefly across a backend swap). Gates the achievement watcher so
   * loading a saved document never backfills unlocks — only edits made after
   * the load count. See `src/achievements/useAchievementWatcher.ts`.
   */
  loaded: boolean;
  /** Latest document, readable from async callbacks without re-subscribing. */
  docRef: MutableRefObject<Snapshot>;
  /** Swap the visible document for an immediate re-render. */
  setDoc: (next: Snapshot) => void;
  /** Persist the edited document (debounced by the active backend). */
  scheduleSave: (next: Snapshot) => void;
  /** Set when a save collided with a newer remote revision; else null. */
  conflict: ConflictState | null;
  /** Coarse state of the last save, for the cloud-sync status glyph. */
  status: SaveStatus;
  /**
   * Human-readable reason the last save failed, captured from the thrown
   * error so the cloud-sync details modal can show *what* went wrong (not
   * just a red glyph). Only set while `status === "error"`; null otherwise.
   */
  statusDetail: string | null;
  /** Whether there are local edits not yet persisted to the backend. */
  dirty: boolean;
  /**
   * True when the active backend is unreachable and the document on screen
   * came from (or is being held in) the on-device cache — i.e. the user is
   * working against a local copy that will re-sync when the network returns.
   * Always false for the local backends, which are never "offline".
   */
  offline: boolean;
  /** Re-read the document from the active backend, replacing what's on screen. */
  reload: () => Promise<void>;
  /**
   * Actively re-check backend reachability with a lightweight probe (the
   * "Check connection" affordance shown while offline). On success it clears
   * the offline state, re-reads the live document, and flushes any edit that
   * queued during the outage. See `ConnectionProbeResult`.
   */
  checkConnection: () => Promise<ConnectionProbeResult>;
  /** Flush any debounced save immediately (the "save now" affordance). */
  saveNow: () => void;
  /** Resolve an open conflict by keeping this device's copy or the remote's. */
  resolveConflict: (keep: "local" | "remote") => void;
}

export function useChecklistSync(deps: {
  /** The active backend. A swap triggers a reload of the new document. */
  active: StorageAdapter;
  /**
   * Reset the undo timeline whenever the document arrives from outside the
   * edit path (load, reload, conflict-adopt). Held by ref because the
   * timeline hook is built after this one — see the module header.
   */
  resetHistory: MutableRefObject<(seed: Snapshot) => void>;
}): ChecklistSync {
  const { active, resetHistory } = deps;

  // Adapter and concurrency token survive re-renders.
  const adapterRef = useRef(active);
  const revisionRef = useRef<string | undefined>(undefined);
  // Monotonic count of user edits (every `scheduleSave`). The async backend
  // load captures this at launch and re-checks it on completion: if it moved,
  // the user edited while the read was in flight, so adopting the loaded
  // (pre-edit) document would silently revert that edit — the "check a box on
  // open and watch it uncheck itself" race. The load keeps the local edit
  // instead. See the load effect below.
  const editSeqRef = useRef(0);

  // Seed from the adapter's synchronous fast path so the first paint
  // shows stored data instead of a flash of empty list.
  const [doc, setDoc] = useState<Snapshot>(() =>
    withActiveList(parse(active.loadSync?.()?.text)),
  );
  // Latest doc, readable from async callbacks (debounced save, conflict
  // resolution) without re-subscribing them to every render.
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // True while the backend is unreachable and we're serving / holding the
  // on-device cache. Drives the header's offline glyph so a stale local copy
  // never masquerades as "synced". Cleared on any successful save and on a
  // live (non-cached) load.
  const [offline, setOffline] = useState(false);
  // Flips true once the first async backend load resolves; reset on every
  // backend swap so the achievement watcher re-baselines against the new
  // document instead of treating the swap as a burst of fresh unlocks.
  const [loaded, setLoaded] = useState(false);

  // Debounced-save plumbing. The timer coalesces a burst of edits into one
  // write per `saveDebounceMs` window (0 ⇒ save immediately, right for
  // localStorage); the `queue` below owns the unsaved snapshot, the single
  // in-flight gate, and the stale-generation guard.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The serialized-save state machine: at most one write in flight, edits
  // that arrive mid-write coalesce (newest snapshot wins), and a generation
  // token drops the result of a save whose baseline was swapped out from
  // under it (backend change, reload, conflict-adopt). Pure and directly
  // unit-tested in `save-queue.test.ts`; see `SaveQueue` for the invariants.
  // Held in a ref so the single instance survives every re-render.
  const queueRef = useRef<SaveQueue<Snapshot> | null>(null);
  queueRef.current ??= new SaveQueue<Snapshot>();
  const queue = queueRef.current;
  // Forward handle to `flushSave` (defined below): `performSave` calls it to
  // drain a queued edit on completion, but `flushSave` is built on top of
  // `performSave`, so the cycle is broken through a ref.
  const flushSaveRef = useRef<() => void>(() => {});
  // Whether the most recent `reload()` settled on the offline cache rather
  // than a live read. `checkConnection` reads it right after awaiting a
  // reload so a probe that reached the backend but a document load that
  // still served the cache is reported honestly as "offline", not "online".
  const reloadEndedOfflineRef = useRef(false);
  // The cooldown scheduler: owns the armed resume timer, the throttle
  // escalation counter, and the transient retry budget that used to live
  // inline. Composes the `queue` for the generation guard and re-queue;
  // `arm`'s resume drains the queue through `flushSave`. Held in a ref so
  // the single instance survives every re-render. See `RetryScheduler`.
  const schedulerRef = useRef<RetryScheduler<Snapshot> | null>(null);
  schedulerRef.current ??= new RetryScheduler<Snapshot>(queue, () =>
    flushSaveRef.current(),
  );
  const scheduler = schedulerRef.current;

  const performSave = useCallback(
    (next: Snapshot, baseRevision?: string) => {
      const generation = queue.generation;
      queue.beginFlight();
      setStatus("saving");
      log.info(
        `save: starting (gen ${generation}, base=${baseRevision ?? "none"})`,
      );
      void adapterRef.current
        .save(serialize(next), baseRevision)
        .then((stored) => {
          queue.endFlight();
          // The document was swapped out from under this save (reload, backend
          // change, conflict-adopt). Its revision and any queued follow-up
          // belong to a baseline that no longer exists — drop them.
          if (queue.isStale(generation)) {
            log.info(
              `save: result for stale gen ${generation} (now ${queue.generation}) — dropping`,
            );
            return;
          }
          // A save landed — clear the backoff escalation so a future failure
          // (throttle or transient) starts its curve from scratch.
          scheduler.resetCounters();
          // A write landed — we're demonstrably back online.
          setOffline(false);
          revisionRef.current = stored.revision;
          log.info(`save: ok → revision=${stored.revision ?? "none"}`);
          // An edit queued while this save was in flight. Each queued edit is a
          // full snapshot, so the latest supersedes every one before it — send
          // only that, based on the revision we just got, never concurrently.
          if (queue.hasPending) {
            log.info("save: draining edit queued during write");
            flushSaveRef.current();
          } else {
            setDirty(false);
            setStatus("saved");
            setStatusDetail(null);
          }
        })
        .catch((err: unknown) => {
          queue.endFlight();
          if (queue.isStale(generation)) return;
          // Offline (a raw network error) is handled apart from the typed
          // signals and the transient-retry storm below. `withLocalCache` has
          // already persisted the attempted bytes, so the edit is safe and
          // will re-sync — there is nothing to surface as an error. Crucially
          // we do NOT spend the fast escalating backoff here: on a long outage
          // that would re-run the heavy phantom-conflict serialization and hit
          // a dead link every couple of seconds for the whole duration. Mark
          // offline (the glyph shows the local-copy state), keep the edit
          // queued, and arm a single gentle resume on a slow interval. The
          // `online` event, the Check connection probe, and the next edit also
          // resume, so this is just a safety net for a flaky link the browser
          // never reports as fully offline.
          if (isOfflineError(err)) {
            log.info(
              `save: offline — cached locally, gentle resume in ${OFFLINE_RESUME_MS}ms`,
            );
            setOffline(true);
            // Not a transient failure — reset the budget so a real 5xx after
            // reconnect starts its curve fresh.
            scheduler.resetTransients();
            scheduler.arm(next, OFFLINE_RESUME_MS);
            return;
          }
          if (err instanceof ConflictError) {
            log.warn("save: remote moved — surfacing conflict");
            setStatus("conflict");
            setStatusDetail(null);
            setConflict({
              remote: withActiveList(parse(err.remote.text)),
              remoteRevision: err.remote.revision,
            });
          } else if (err instanceof AuthError) {
            log.error("save: auth error", err);
            setStatus("auth-error");
            setStatusDetail(null);
          } else if (err instanceof RateLimitError) {
            // Soft pause: re-queue this snapshot and schedule a resume once
            // the cooldown elapses, so whatever the user edits during the
            // wait coalesces into a single full-document save. The backend's
            // `retryAfterMs` is floored against the backoff curve and
            // escalated per consecutive 429, so a server returning a tiny
            // (or zero) cooldown can't pull us into a tight resend loop. No
            // budget here on purpose: giving up on a rate limit would
            // surface a red error and stop autosave, which is worse than
            // continuing to wait.
            const { waitMs, floorMs } = scheduler.nextThrottleDelay(
              err.retryAfterMs,
            );
            log.warn(
              `save throttled — retryAfter=${err.retryAfterMs}ms floor=${floorMs}ms resume in ${waitMs}ms`,
            );
            setStatus("throttled");
            setStatusDetail(null);
            scheduler.arm(next, waitMs);
          } else if (isRetryableSaveError(err) && scheduler.canRetryTransient) {
            // Transient backend hiccup (5xx, raw network error): re-queue
            // and back off rather than immediately surfacing a red error.
            // Status stays `saving` across attempts so the glyph keeps
            // spinning. After `MAX_TRANSIENT_SAVE_RETRIES` we fall through
            // to the hard-error branch below.
            const { waitMs, attempt } = scheduler.nextTransientDelay();
            log.warn(
              `save failed — retrying in ${waitMs}ms (attempt ${attempt}/${MAX_TRANSIENT_SAVE_RETRIES}): ${describeStorageError(err)}`,
            );
            scheduler.arm(next, waitMs);
          } else {
            // Echoing a bare network `TypeError` ("Load failed" on WebKit)
            // tells nobody anything — log the meaning, and keep the raw
            // error object only for unexpected failures whose stack is
            // worth capturing (a network outage's isn't).
            if (isOfflineError(err)) {
              log.error(`save failed — ${describeStorageError(err)}`);
            } else {
              log.error(`save failed — ${describeStorageError(err)}`, err);
            }
            scheduler.resetTransients();
            // Re-queue the failed snapshot (unless a newer edit already
            // superseded it) so the "Try again" affordance has bytes to push.
            // `flushSave` took the pending edit before this write started, and
            // a hard error arms no resume timer — without this, a manual retry
            // finds an empty queue and silently no-ops.
            queue.requeue(next);
            setStatus("error");
            // Capture the failure reason so the details modal can show *why*
            // the save failed instead of a bare "Sync failed" — and a clear
            // "backend unreachable" instead of the cryptic "Load failed" a
            // raw network error would otherwise put in front of the user.
            setStatusDetail(describeStorageError(err));
          }
        });
    },
    [queue, scheduler],
  );

  const flushSave = useCallback(() => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    // One save in flight at a time. Leave the edit queued; the outstanding
    // save drains it when it resolves.
    if (queue.inFlight) {
      log.info("flushSave: write already in flight — staying queued");
      return;
    }
    // A cooldown (rate-limit throttle or transient backoff) is in
    // progress — don't start a fresh write that would just be rejected
    // again. The edit stays queued; the armed resume timer drains it (and
    // any newer edit) when the cooldown elapses.
    if (scheduler.armed) {
      log.info("flushSave: cooldown active — staying queued");
      return;
    }
    const next = queue.take();
    if (next === null) return;
    performSave(next, revisionRef.current);
  }, [performSave, queue, scheduler]);

  useEffect(() => {
    flushSaveRef.current = flushSave;
  }, [flushSave]);

  const scheduleSave = useCallback(
    (next: Snapshot) => {
      // Record that a user edit happened, so an in-flight backend load that
      // resolves after this can tell it must not clobber the edit.
      editSeqRef.current += 1;
      queue.enqueue(next);
      setDirty(true);
      const ms = adapterRef.current.saveDebounceMs ?? 0;
      if (ms <= 0) {
        log.info("scheduleSave: no debounce — flushing now");
        flushSave();
        return;
      }
      log.info(`scheduleSave: debouncing ${ms}ms`);
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushSave, ms);
    },
    [flushSave, queue],
  );

  // Reload whenever the active adapter instance changes. On first mount
  // this re-confirms the loadSync seed (same bytes, no flicker); on a
  // mid-session swap (fake-data on/off, backend change, encryption
  // unlock) it loads the new backend's document and replaces what's on
  // screen. Any pending save against the old backend is flushed first so
  // an in-flight edit isn't dropped, and the concurrency token resets so
  // the first save against the new backend isn't rejected.
  useEffect(() => {
    // Cancel any armed cooldown so it can't fire into the new backend, and
    // reset the backoff escalation — the new backend starts with a clean
    // slate. Cleared before `flushSave` so a queued edit gets one last push
    // to the old backend rather than being blocked by the cooldown guard.
    scheduler.cancel();
    // Flush a queued edit to the *old* backend first (when nothing is in
    // flight) so a debounced edit isn't dropped on the swap, then bump the
    // generation so that save's write-back — and any save already in flight
    // against the old backend — becomes a no-op rather than landing the old
    // backend's bytes on the new one.
    flushSave();
    queue.reset();
    adapterRef.current = active;
    revisionRef.current = undefined;
    setConflict(null);
    setStatus("idle");
    setStatusDetail(null);
    setDirty(false);
    setLoaded(false);
    log.info(`load: loading from backend [${active.id}]`);
    let cancelled = false;
    // Snapshot the edit counter before the read starts. If the user checks a
    // box (or makes any edit) while the load is in flight, this moves and the
    // completion handler keeps the local document instead of overwriting it.
    const editSeqAtLoad = editSeqRef.current;
    void active
      .load()
      .then((stored) => {
        if (cancelled) return;
        // A user edit raced the load. The on-screen document already reflects
        // it (and `scheduleSave` has persisted it), while `stored` is the
        // pre-edit document we began reading before the click — adopting it
        // would revert the edit in front of the user. Keep the local document;
        // just mark the load resolved so the achievement watcher un-gates.
        if (editSeqRef.current !== editSeqAtLoad) {
          log.info("load: local edit raced the read — keeping local edits");
          setLoaded(true);
          return;
        }
        revisionRef.current = stored?.revision;
        log.info(
          `load: ok (revision=${stored?.revision ?? "none"}` +
            `${stored?.offline ? ", from offline cache" : ""})`,
        );
        // A cloud load served from the on-device cache carries `offline`;
        // record it so the header reflects that we're on a local copy, and
        // award the "off the grid" achievement the first time it happens.
        setOffline(stored?.offline ?? false);
        if (stored?.offline) unlock("offGrid");
        const loadedDoc = withActiveList(parse(stored?.text));
        setDoc(loadedDoc);
        // The freshly-loaded document is a new baseline — drop the old
        // backend's undo history so "undo" can't jump to a vanished state.
        resetHistory.current(loadedDoc);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Offline with nothing cached (or a transient backend error): keep an
        // empty document on screen rather than hanging on the loading state.
        log.warn(`initial load failed — ${describeStorageError(err)}`);
        if (isOfflineError(err)) setOffline(true);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active, flushSave, queue, resetHistory, scheduler]);

  // Flush any pending save on unmount so a debounced edit isn't lost, and
  // cancel any armed cooldown so the resume timer can't fire after teardown.
  useEffect(() => {
    return () => {
      scheduler.cancelTimer();
      flushSave();
    };
  }, [flushSave, scheduler]);

  const reload = useCallback(async () => {
    // Cancel any armed cooldown and reset the backoff escalation — the
    // reloaded document is a fresh baseline, so a pending throttle/retry
    // resume against the old baseline must not fire.
    scheduler.cancel();
    flushSave();
    // The reloaded document is a fresh baseline; abandon any in-flight or
    // queued save so its stale write-back can't clobber what we load.
    queue.reset();
    // Recorded for `checkConnection`: whether this reload settled on the
    // offline cache. A non-offline error below leaves it false.
    reloadEndedOfflineRef.current = false;
    log.info("reload: re-reading active backend");
    let stored;
    try {
      stored = await adapterRef.current.load();
    } catch (err) {
      // Pulling to refresh while offline with nothing cached: leave what's on
      // screen and flag offline rather than blanking the list.
      log.warn(`reload failed — ${describeStorageError(err)}`);
      if (isOfflineError(err)) {
        setOffline(true);
        reloadEndedOfflineRef.current = true;
      }
      return;
    }
    revisionRef.current = stored?.revision;
    const endedOffline = stored?.offline ?? false;
    reloadEndedOfflineRef.current = endedOffline;
    setOffline(endedOffline);
    if (stored?.offline) unlock("offGrid");
    setConflict(null);
    setStatus("idle");
    setStatusDetail(null);
    setDirty(false);
    const reloaded = withActiveList(parse(stored?.text));
    setDoc(reloaded);
    resetHistory.current(reloaded);
  }, [flushSave, queue, resetHistory, scheduler]);

  // Actively re-check reachability — the offline glyph's "Check connection"
  // gesture. Trusting `navigator.onLine` to flip back is unreliable (it's the
  // same flag that wrongly reported us offline), so this hits the network
  // with the adapter's lightweight probe and recovers from a real reconnect:
  // on success it re-reads the live document (clearing `offline`) and flushes
  // any edit queued during the outage. A lapsed session surfaces as a
  // reconnect prompt rather than a misleading "still offline".
  const checkConnection =
    useCallback(async (): Promise<ConnectionProbeResult> => {
      const adapter = adapterRef.current;
      if (!adapter.probe) {
        // No probe (the local backends) — just re-pull; there's nothing to be
        // offline from.
        await reload();
        return "online";
      }
      log.info("checkConnection: probing backend reachability");
      let reachable: boolean;
      try {
        reachable = await adapter.probe();
      } catch (err) {
        if (err instanceof AuthError) {
          // Reaching the backend and being refused is the opposite of offline —
          // clear the flag so the UI surfaces Reconnect instead of "offline".
          log.warn("checkConnection: session lapsed — needs reconnect");
          setOffline(false);
          setStatus("auth-error");
          setStatusDetail(null);
          return "auth-error";
        }
        log.warn("checkConnection: probe threw — treating as offline", err);
        return "offline";
      }
      if (!reachable) {
        log.info("checkConnection: backend still unreachable");
        return "offline";
      }
      log.info("checkConnection: backend reachable — re-reading and flushing");
      // The probe (a metadata listing) reached the backend, but the document
      // load is the real test: re-read, and if it *still* falls back to the
      // cache, the connection isn't usable yet — report offline rather than a
      // misleading "online" that the lingering offline state would contradict.
      await reload();
      if (reloadEndedOfflineRef.current) {
        log.info("checkConnection: probe ok but load still cached — offline");
        return "offline";
      }
      // Live read succeeded and cleared `offline`; push any edit that piled up
      // locally during the outage. The save is fire-and-forget — if the write
      // path is still flaky it re-flags offline on its own and the status card
      // follows, so we don't claim a sticky "back online".
      flushSaveRef.current();
      return "online";
    }, [reload]);

  // When connectivity returns, flush whatever edit piled up offline so it
  // syncs to the backend without the user lifting a finger. The browser's
  // `online` event is the trigger; a successful save clears the offline flag
  // (see `performSave`). Cloud `load()` failures during the outage left the
  // edits queued in the save queue, so this is all the reconnect needs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      log.info("connectivity restored — flushing queued save");
      // Cancel the gentle offline resume cooldown so the flush isn't blocked
      // by the cooldown guard and waits out the slow interval — connectivity
      // is back, so push now.
      scheduler.cancelTimer();
      flushSaveRef.current();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [scheduler]);

  // Push any debounced edit to the backend immediately — the "save now"
  // action on the cloud-sync glyph when there are unsaved changes.
  const saveNow = useCallback(() => {
    unlock("trustButVerify");
    flushSave();
  }, [flushSave]);

  const resolveConflict = useCallback(
    (keep: "local" | "remote") => {
      setConflict((current) => {
        if (!current) return null;
        log.info(`resolveConflict: keeping ${keep}`);
        if (keep === "local") {
          // Overwrite the remote: re-save this device's bytes basing the
          // write on the remote revision so the backend accepts it.
          revisionRef.current = current.remoteRevision;
          performSave(docRef.current, current.remoteRevision);
        } else {
          // Adopt the remote bytes as the new in-memory state and stamp
          // its revision so the next edit bases on it — no immediate
          // write-back, so we don't bounce the conflict. The adopted remote
          // is a fresh baseline, so abandon any queued save against the old
          // one.
          queue.reset();
          revisionRef.current = current.remoteRevision;
          setDoc(current.remote);
          // Adopting the remote document makes it the new baseline, so
          // the local edit history no longer applies.
          resetHistory.current(current.remote);
          setDirty(false);
          setStatus("saved");
          setStatusDetail(null);
        }
        return null;
      });
    },
    [performSave, queue, resetHistory],
  );

  return {
    doc,
    docRef,
    setDoc,
    scheduleSave,
    conflict,
    status,
    statusDetail,
    dirty,
    offline,
    loaded,
    reload,
    checkConnection,
    saveNow,
    resolveConflict,
  };
}
