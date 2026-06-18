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
// budget project's `SyncStatus`. One glyph that morphs with state:
// cloud-upload (accent ring) when there are unsaved edits to push, a
// spinner while a save is in flight, green cloud-check when the remote
// is in sync, and a coloured cloud-alert for conflict / auth / throttle
// / generic errors. Tapping the upload glyph saves now; every other
// state opens the storage settings. Errors take precedence over the
// dirty upload glyph because if the round-trip is failing, "save now"
// can't make progress until the user sees and acts on it.

type Props = {
  providerName: string;
  status: SaveStatus;
  dirty: boolean;
  /** True when the backend is unreachable and we're on the on-device copy. */
  offline: boolean;
  onSave: () => void;
  onOpenDetails: () => void;
};

type IconComponent = (props: { className?: string }) => ReactElement;

type View = {
  Icon: IconComponent;
  label: string;
  tone: "ok" | "busy" | "warn" | "err" | "accent" | "flag";
  spin?: boolean;
  action: "save" | "open";
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
      action: "open",
    };
  }
  switch (status) {
    case "saving":
      return {
        Icon: SpinnerIcon,
        label: t("sync.saving"),
        tone: "busy",
        spin: true,
        action: "open",
      };
    case "error":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.failed"),
        tone: "err",
        action: "open",
      };
    case "throttled":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.throttled"),
        tone: "flag",
        action: "open",
      };
    case "auth-error":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.reauthRequired"),
        tone: "warn",
        action: "open",
      };
    case "conflict":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.syncConflict"),
        tone: "warn",
        action: "open",
      };
    case "saved":
    case "idle":
      return dirty
        ? {
            Icon: CloudUploadIcon,
            label: t("sync.saveUnsaved"),
            tone: "accent",
            action: "save",
          }
        : {
            Icon: CloudCheckIcon,
            label: t("sync.syncedTo", { name: providerName }),
            tone: "ok",
            action: "open",
          };
  }
}

const TONE_CLASS: Record<View["tone"], string> = {
  ok: "border-success/40 text-success hover:bg-success/10",
  busy: "border-line text-muted",
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
  onSave,
  onOpenDetails,
}: Props) {
  const t = useT();
  const view = viewFor(status, dirty, offline, providerName, t);
  const busy = status === "saving";
  const onClick = view.action === "save" ? onSave : onOpenDetails;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={view.label}
      aria-label={view.label}
      aria-busy={busy || undefined}
      className={`inline-flex h-9 w-9 items-center justify-center rounded border bg-transparent focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none ${
        busy ? "cursor-not-allowed" : "cursor-pointer"
      } ${TONE_CLASS[view.tone]}`}
    >
      <view.Icon
        className={`h-[18px] w-[18px] ${view.spin ? "animate-spin" : ""}`}
      />
    </button>
  );
}
