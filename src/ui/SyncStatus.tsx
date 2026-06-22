import type { ReactElement } from "react";

import { useT, type TFunction } from "../i18n";
import type { SaveStatus } from "../app/use-checklist.ts";
import {
  CloudAlertIcon,
  CloudCheckIcon,
  CloudOffIcon,
  CloudUploadIcon,
  SpinnerIcon,
} from "./icons.tsx";

// Single header affordance for cloud-backed sessions, ported from the
// budget/notes projects' `SyncStatus`. One glyph that morphs with state:
// cloud-upload (accent ring) when there are unsaved edits to push, a
// spinner while a save is in flight, green cloud-check when the remote is
// in sync, and a coloured cloud-alert for conflict / auth / throttle /
// generic errors. Whatever the state — including mid-save — tapping it
// opens the sync-details modal, the command centre where the status is
// spelled out and Save now / Reconnect / Reload / Check connection live.
// A single, predictable way in: the glyph never does double-duty as a
// save button (that was the "why won't it tap?" trap) and is never
// disabled.

type Props = {
  providerName: string;
  status: SaveStatus;
  dirty: boolean;
  /** True when the backend is unreachable and we're on the on-device copy. */
  offline: boolean;
  onOpenDetails: () => void;
};

type IconComponent = (props: { className?: string }) => ReactElement;

type View = {
  Icon: IconComponent;
  label: string;
  tone: "ok" | "busy" | "warn" | "err" | "accent" | "flag";
  spin?: boolean;
};

function viewFor(
  status: SaveStatus,
  dirty: boolean,
  offline: boolean,
  providerName: string,
  t: TFunction,
): View {
  // Offline takes precedence: a stale local copy must never read as
  // "synced". The other states (conflict, auth-error) need a live backend
  // response to arise, so they can't co-occur with being offline.
  if (offline) {
    return {
      Icon: CloudOffIcon,
      label: t("sync.offline"),
      tone: "flag",
    };
  }
  switch (status) {
    case "saving":
      return {
        Icon: SpinnerIcon,
        label: t("sync.saving"),
        tone: "busy",
        spin: true,
      };
    case "error":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.failed"),
        tone: "err",
      };
    case "throttled":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.throttled"),
        tone: "flag",
      };
    case "auth-error":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.reauthRequired"),
        tone: "warn",
      };
    case "conflict":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.syncConflict"),
        tone: "warn",
      };
    case "saved":
    case "idle":
      return dirty
        ? {
            Icon: CloudUploadIcon,
            label: t("sync.saveUnsaved"),
            tone: "accent",
          }
        : {
            Icon: CloudCheckIcon,
            label: t("sync.syncedTo", { name: providerName }),
            tone: "ok",
          };
  }
}

const TONE_CLASS: Record<View["tone"], string> = {
  ok: "border-success/40 text-success hover:bg-success/10",
  busy: "border-line text-muted hover:bg-surface-2",
  warn: "border-pipe/50 text-pipe hover:bg-pipe/10",
  err: "border-danger/50 text-danger hover:bg-danger/10",
  accent: "border-accent bg-accent/15 text-accent hover:bg-accent/25",
  flag: "border-flag/50 text-flag hover:bg-flag/10",
};

export function SyncStatus({
  providerName,
  status,
  dirty,
  offline,
  onOpenDetails,
}: Props) {
  const t = useT();
  const view = viewFor(status, dirty, offline, providerName, t);
  const busy = status === "saving";
  return (
    <button
      type="button"
      onClick={onOpenDetails}
      title={view.label}
      aria-label={view.label}
      aria-busy={busy || undefined}
      className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border bg-transparent focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none ${TONE_CLASS[view.tone]}`}
    >
      <view.Icon
        className={`h-[18px] w-[18px] ${view.spin ? "animate-spin" : ""}`}
      />
    </button>
  );
}
