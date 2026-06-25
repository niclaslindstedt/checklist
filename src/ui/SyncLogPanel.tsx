import { useEffect, useMemo, useState } from "react";

import type { TFunction } from "../i18n";
import {
  getLogs,
  subscribeToLogs,
  type LogEntry,
  type LogLevel,
} from "../dev/logger.ts";

// The logger scopes that make up the cloud-sync story. The sync log panel
// only surfaces these, so a reader sees the round-trip — auth, the per-file
// save, retries, the offline mirror — without the unrelated noise (seeding,
// migrations of unrelated data) that also flows through the shared buffer.
const SYNC_LOG_SCOPES: ReadonlySet<string> = new Set([
  "checklist",
  "dropbox",
  "gdrive",
  "folder",
  "folder-handle",
  "cache",
  "oauth",
  "directory",
  "crypto",
  "encrypt",
  "storage",
  "serialize",
  "migrate",
  "namespaces",
  "backend-pref",
]);

// The inline sync log (developer mode only). Reads the in-memory ring
// buffer directly (the same buffer the Logs settings tab shows) so a sync
// issue is legible here whether or not the capture toggle — which only
// governs persistence across reloads — is on. Subscribes only while
// expanded.
export function SyncLogPanel({ t }: { t: TFunction }) {
  const [version, setVersion] = useState(0);
  const [copyStatus, setCopyStatus] = useState<null | "copied" | "failed">(
    null,
  );

  useEffect(() => subscribeToLogs(() => setVersion((v) => v + 1)), []);

  // `version` ticks on every logger push / clear, forcing a re-read of the
  // ring buffer; the filter narrows it to the cloud-sync scopes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => getLogs(), [version]);
  const entries = useMemo(
    () => all.filter((e) => SYNC_LOG_SCOPES.has(e.scope)),
    [all],
  );
  // Render newest-first so the most recent round-trip is at the top, where a
  // reader looks first — no scrolling to the bottom to see what just happened.
  // The copied text stays chronological (oldest-first), the natural order to
  // read a pasted log top to bottom.
  const ordered = useMemo(() => entries.slice().reverse(), [entries]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(
        entries.map(formatLogLine).join("\n"),
      );
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    setTimeout(() => setCopyStatus(null), 2000);
  }

  if (entries.length === 0) {
    return (
      <p className="rounded border border-line bg-surface-2 px-2.5 py-2 text-xs text-muted">
        {t("sync.syncLogEmpty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleCopy}
          className="cursor-pointer rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
        >
          {copyStatus === "copied"
            ? t("sync.copied")
            : copyStatus === "failed"
              ? t("sync.copyFailed")
              : t("sync.copyLog")}
        </button>
      </div>
      <ul className="flex max-h-44 flex-col overflow-y-auto rounded border border-line bg-surface-2 font-mono text-xs">
        {ordered.map((entry, idx) => (
          <li
            key={`${entry.ts}-${idx}`}
            className={`flex flex-col gap-0.5 border-b border-l-2 border-line px-2.5 py-1.5 last:border-b-0 ${railClass(
              entry.level,
            )}`}
          >
            <span className="flex flex-wrap items-baseline gap-2">
              <span className="text-muted tabular-nums">
                {formatLogTime(entry.ts)}
              </span>
              <span className={levelClass(entry.level)}>
                {entry.level.toUpperCase()}
              </span>
              <span className="text-accent">[{entry.scope}]</span>
            </span>
            <span className="break-words whitespace-pre-wrap text-fg">
              {entry.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
      return "text-muted";
  }
}

function railClass(level: LogLevel): string {
  switch (level) {
    case "error":
      return "border-l-danger";
    case "warn":
      return "border-l-flag";
    case "info":
      return "border-l-accent";
  }
}
