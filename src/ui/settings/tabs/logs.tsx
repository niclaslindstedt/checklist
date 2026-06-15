import { useEffect, useMemo, useRef, useState } from "react";

import {
  clearLogs,
  getLogs,
  subscribeToLogs,
  type LogEntry,
  type LogLevel,
} from "../../../dev/logger.ts";
import { Field, Section } from "../shared.tsx";

type LogFilter = "all" | LogLevel;

// Live view of the in-app log buffer, shown when developer mode is on.
// Cloned from the budget project's Logs tab; the native select replaces
// budget's portalled picker.
export function LogsTab() {
  // `version` bumps whenever the logger pushes or clears, forcing a
  // re-read of `getLogs()`.
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [copyStatus, setCopyStatus] = useState<null | "copied" | "failed">(
    null,
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  // Only auto-scroll new entries into view if the user is already pinned
  // to the bottom, so reading earlier entries while logs stream stays sane.
  const stickToBottomRef = useRef(true);

  useEffect(() => subscribeToLogs(() => setVersion((v) => v + 1)), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allEntries = useMemo(() => getLogs(), [version]);
  const entries = useMemo(
    () =>
      filter === "all"
        ? allEntries
        : allEntries.filter((e) => e.level === filter),
    [allEntries, filter],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 16;
  }

  async function handleCopy() {
    const text = entries.map(formatLogLine).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    setTimeout(() => setCopyStatus(null), 2000);
  }

  return (
    <Section title="Logs">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Field label="Filter">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as LogFilter)}
            aria-label="Filter logs by level"
            className="field-input cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
          >
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warn">Warnings</option>
            <option value="error">Errors</option>
          </select>
        </Field>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={entries.length === 0}
            className="cursor-pointer rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={clearLogs}
            disabled={allEntries.length === 0}
            className="cursor-pointer rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">
        {entries.length === 0
          ? "No entries."
          : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}.`}
        {copyStatus === "copied" && (
          <>
            {" — "}
            <span className="text-success">Copied to clipboard.</span>
          </>
        )}
        {copyStatus === "failed" && (
          <>
            {" — "}
            <span className="text-danger">Copy failed.</span>
          </>
        )}
      </p>
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="max-h-[334px] overflow-y-auto rounded border border-line bg-surface font-mono text-xs"
      >
        {entries.length === 0 ? (
          <p className="px-2 py-3 text-muted">No entries.</p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry, idx) => (
              <li
                key={`${entry.ts}-${idx}`}
                className="flex flex-wrap items-baseline gap-2 border-b border-line px-2 py-1 last:border-b-0"
              >
                <span className="text-muted tabular-nums">
                  {formatLogTime(entry.ts)}
                </span>
                <span className={levelClass(entry.level)}>
                  {entry.level.toUpperCase()}
                </span>
                <span className="text-path">[{entry.scope}]</span>
                <span className="break-words whitespace-pre-wrap text-fg">
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function formatLogTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatLogLine(entry: LogEntry): string {
  return `${formatLogTime(entry.ts)} [${entry.scope}] ${entry.level.toUpperCase()} ${entry.message}`;
}

function levelClass(level: LogLevel): string {
  switch (level) {
    case "error":
      return "text-danger";
    case "warn":
      return "text-flag";
    case "info":
      return "text-meta";
  }
}
