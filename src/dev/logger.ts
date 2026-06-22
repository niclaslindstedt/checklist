// In-app logger. Logging is a developer-only diagnostic: a call only
// records when developer mode is on *or* "Capture logs" is enabled —
// with both off (a regular user) the logger is a no-op, since no surface
// (the Logs settings tab, the sync-details log panel) is reachable to
// read it. When active, every call pushes an entry into a bounded
// in-memory ring buffer; when "Capture logs" is enabled in the Developer
// settings tab, the buffer is also mirrored to localStorage so a reload
// preserves the history. The Logs settings tab reads from the same buffer
// and subscribes to updates so entries appear live. Cloned from the
// budget project's `utils/logger.ts`.
//
// Deliberately writes to NO console sink — the local-first app runs in a
// browser tab where the user can't always reach devtools (notably on
// mobile). All diagnostics flow through the in-app surface instead.
//
// Usage:
//
//   import { createLogger } from "../dev/logger.ts";
//   const log = createLogger("storage");
//   log.info("load start");
//   log.warn("nearing quota");
//   log.error("save failed", err);

const CAPTURE_LOGS_KEY = "checklist:dev:captureLogs";
const LOGS_KEY = "checklist:dev:logs";
// The canonical home for this key is `useDevMode`, which imports it from
// here — the logger needs it to decide, at first import, whether logging
// is active before any React has rendered. Defined here (the lower-level
// module) to keep a single source of truth without a circular import.
export const DEV_MODE_KEY = "checklist:dev:mode";
const MAX_LOG_ENTRIES = 500;

export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  ts: number;
  level: LogLevel;
  scope: string;
  message: string;
};

export type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

// In-memory ring buffer. Written to whenever logging is active (developer
// mode or capture on) — the cost is one push + a possible shift, bounded
// at MAX_LOG_ENTRIES. The localStorage mirror is the part gated by the
// capture flag specifically.
const buffer: LogEntry[] = [];
const subscribers = new Set<() => void>();
let captureEnabled = readCaptureFlag();
// Mirrors the developer-mode flag. Capture being on always implies dev
// mode is on too (`useDevMode` forces capture off when dev mode goes off),
// but we track both so the predicate reads plainly.
let devModeEnabled = readDevModeFlag();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Debounce localStorage writes so a burst of logs doesn't thrash the
// disk. A quarter-second is short enough not to be noticeable.
const SAVE_DEBOUNCE_MS = 250;

function safeReadLocal(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteLocal(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    // Quota or access errors shouldn't break the app; best-effort sink.
  }
}

function safeRemoveLocal(key: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    // Same as above.
  }
}

function readCaptureFlag(): boolean {
  return safeReadLocal(CAPTURE_LOGS_KEY) === "true";
}

function readDevModeFlag(): boolean {
  return safeReadLocal(DEV_MODE_KEY) === "true";
}

// Logging only records for developers: when capture is on, or when
// developer mode is enabled. With both off there's no surface that can
// ever show the buffer, so a push is a no-op.
function loggingActive(): boolean {
  return captureEnabled || devModeEnabled;
}

function isLogEntry(v: unknown): v is LogEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.ts === "number" &&
    (e.level === "info" || e.level === "warn" || e.level === "error") &&
    typeof e.scope === "string" &&
    typeof e.message === "string"
  );
}

// Render an Error for the log buffer. Leads with `name: message` and
// appends the stack when available — some engines (Safari/iOS) format
// `err.stack` as bare frames with no leading message line, so naively
// falling back to `err.stack` would swallow the message.
function describeError(err: Error): string {
  const head = err.message ? `${err.name}: ${err.message}` : err.name;
  if (!err.stack) return head;
  return err.stack.startsWith(err.name) ? err.stack : `${head}\n${err.stack}`;
}

// Serializer for log payloads. Handles Errors, cycles, bigints, and
// functions — anything JSON can't round-trip on its own.
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    const out = JSON.stringify(value, (_key, v: unknown) => {
      if (v instanceof Error) return describeError(v);
      if (typeof v === "object" && v !== null) {
        if (seen.has(v as object)) return "[Circular]";
        seen.add(v as object);
      }
      if (typeof v === "bigint") return v.toString();
      if (typeof v === "function") {
        return `[function ${(v as { name?: string }).name || "anonymous"}]`;
      }
      if (typeof v === "undefined") return "undefined";
      return v;
    });
    return out ?? "undefined";
  } catch {
    return String(value);
  }
}

function formatMessage(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return describeError(a);
      return safeStringify(a);
    })
    .join(" ");
}

function scheduleSave(): void {
  if (!captureEnabled) return;
  if (saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushToStorage();
  }, SAVE_DEBOUNCE_MS);
}

function flushToStorage(): void {
  if (!captureEnabled) return;
  safeWriteLocal(LOGS_KEY, JSON.stringify(buffer));
}

function notify(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      // Subscriber errors must not break the logger.
    }
  }
}

function push(level: LogLevel, scope: string, args: unknown[]): void {
  if (!loggingActive()) return;
  const entry: LogEntry = {
    ts: Date.now(),
    level,
    scope,
    message: formatMessage(args),
  };
  buffer.push(entry);
  if (buffer.length > MAX_LOG_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_LOG_ENTRIES);
  }
  scheduleSave();
  notify();
}

export function createLogger(scope: string): Logger {
  return {
    info(...args) {
      push("info", scope, args);
    },
    warn(...args) {
      push("warn", scope, args);
    },
    error(...args) {
      push("error", scope, args);
    },
  };
}

export function setCaptureEnabled(enabled: boolean): void {
  if (captureEnabled === enabled) return;
  captureEnabled = enabled;
  if (enabled) {
    safeWriteLocal(CAPTURE_LOGS_KEY, "true");
    // Persist whatever's currently in the buffer so the user gets the
    // recent history (typically empty on first enable; a no-op if so).
    flushToStorage();
  } else {
    safeRemoveLocal(CAPTURE_LOGS_KEY);
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    // Leave LOGS_KEY in place — re-enabling restores the previous list;
    // use clearLogs() to wipe explicitly.
  }
}

export function isCaptureEnabled(): boolean {
  return captureEnabled;
}

// Tell the logger whether developer mode is on. Called by `useDevMode`
// whenever the flag flips (and from another tab's storage event), so a
// developer sees live logs without also turning capture on, while a
// regular user pays nothing for logging.
export function setDevModeEnabled(enabled: boolean): void {
  devModeEnabled = enabled;
}

export function getLogs(): LogEntry[] {
  return buffer.slice();
}

export function clearLogs(): void {
  buffer.length = 0;
  safeRemoveLocal(LOGS_KEY);
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  notify();
}

export function subscribeToLogs(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

// Side-effect on first import: rehydrate the ring buffer from
// localStorage. Best-effort — a corrupt entry is dropped rather than
// failing the whole load.
(function rehydrate(): void {
  const raw = safeReadLocal(LOGS_KEY);
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  for (const item of parsed) {
    if (isLogEntry(item)) buffer.push(item);
  }
  if (buffer.length > MAX_LOG_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_LOG_ENTRIES);
  }
})();
