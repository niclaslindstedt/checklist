import {
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { useT, type TFunction } from "../i18n";
import type {
  ConnectionProbeResult,
  SaveStatus,
} from "../app/use-checklist.ts";
import type { BackendId } from "../storage/backend-preference.ts";
import { useDevMode } from "../dev/useDevMode.ts";
import { DROPBOX_APP_FOLDER, dropboxWebUrl } from "../storage/dropbox/index.ts";
import {
  GDRIVE_APP_FOLDER_NAME,
  gdriveWebUrl,
} from "../storage/gdrive/index.ts";
import { namespaceCloudFolder } from "../storage/namespaces.ts";
import { Button } from "./form";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloudAlertIcon,
  CloudCheckIcon,
  CloudIcon,
  CloudOffIcon,
  CloseIcon,
  CloudUploadIcon,
  ExternalLinkIcon,
  FolderIcon,
  LockIcon,
  RefreshIcon,
  ScrollTextIcon,
  ShieldIcon,
  SpinnerIcon,
} from "./icons.tsx";
import { Modal } from "./Modal.tsx";
import { SyncLogPanel } from "./SyncLogPanel.tsx";

// Cloud-sync command centre, ported from the notes project's redesigned
// `SyncDetailsModal` (#118) and adapted to the checklist domain. The header
// sync glyph always opens it, whatever the state, so it's the one place that
// answers "what is sync doing right now". It lays out, top to bottom: the
// headline status and *why* a save failed (plus Reconnect / Save now / Try
// again, a compact Reload glyph, and — while offline — a Check connection
// re-probe); the backend, its at-rest encryption state, and the on-disk file
// location; and — in developer mode only — a sync log read straight from the
// in-memory ring buffer. The log is a developer diagnostic, so it's hidden
// for regular users (logging is a no-op for them too); a developer sees it
// whether or not capture is on (capture only governs persistence).

type Props = {
  open: boolean;
  backend: BackendId;
  namespace: string;
  providerName: string;
  status: SaveStatus;
  statusDetail: string | null;
  dirty: boolean;
  /** True when the backend is unreachable and we're on the on-device copy. */
  offline: boolean;
  onSaveNow: () => void;
  /** Re-read the document from the backend, replacing what's on screen. */
  onReload: () => void;
  // Re-issue OAuth for the active cloud backend. Resolves on success and
  // throws on failure so the inline button can spin while the popup /
  // redirect runs and surface the failure instead of swallowing it. Null
  // when the backend has no reconnect gesture (the local folder).
  onReconnect: (() => Promise<void>) | null;
  // Actively re-probe backend reachability — wired to the "Check connection"
  // button shown while offline. Resolves with what the probe found so the
  // button can report it; recovery (re-read + flush) happens engine-side.
  onCheckConnection: () => Promise<ConnectionProbeResult>;
  onClose: () => void;
};

type IconComponent = (props: { className?: string }) => ReactElement;

type Tone = "ok" | "busy" | "warn" | "err" | "flag" | "accent";

type ProviderView = {
  /** Human-readable path the user sees when browsing the backend. */
  path: string;
  /** Web UI URL for the backend, or null when it can't be opened in a tab. */
  url: string | null;
};

function providerView(backend: BackendId, namespace: string): ProviderView {
  const folder = namespaceCloudFolder(namespace);
  if (backend === "dropbox") {
    return {
      path: `Apps/${DROPBOX_APP_FOLDER}/${folder}`,
      url: dropboxWebUrl(namespace),
    };
  }
  if (backend === "gdrive") {
    return {
      path: `My Drive/${GDRIVE_APP_FOLDER_NAME}/${folder}`,
      // Drive home — the file id isn't threaded here, so the user scrolls
      // to the folder from My Drive.
      url: gdriveWebUrl(null),
    };
  }
  // Local folder: no web URL, and the OS path isn't exposed to the app.
  return { path: folder, url: null };
}

// The glyph that names the backend family in the Details grid: a cloud for the
// hosted backends, a folder for the picked directory.
function backendGlyph(backend: BackendId): ReactElement {
  const className = "h-3.5 w-3.5 shrink-0 text-muted";
  return backend === "folder" ? (
    <FolderIcon className={className} />
  ) : (
    <CloudIcon className={className} />
  );
}

type StatusView = {
  Icon: IconComponent;
  label: string;
  tone: Tone;
  detail?: string;
  spin?: boolean;
};

function statusView(
  status: SaveStatus,
  statusDetail: string | null,
  dirty: boolean,
  offline: boolean,
  providerName: string,
  t: TFunction,
): StatusView {
  // Offline takes precedence (see `SyncStatus`): explain that the user is on
  // a local copy that re-syncs on reconnect, rather than implying a sync.
  if (offline) {
    return {
      Icon: CloudOffIcon,
      label: t("sync.offlineHeading"),
      tone: "flag",
      detail: t("sync.offlineDetail", { name: providerName }),
    };
  }
  switch (status) {
    case "saving":
      return {
        Icon: SpinnerIcon,
        label: t("sync.syncingNow"),
        tone: "busy",
        spin: true,
      };
    case "error":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.failedHeading"),
        tone: "err",
        detail:
          statusDetail ??
          t("sync.failedDetailFallback", { name: providerName }),
      };
    case "throttled":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.throttledHeading"),
        tone: "flag",
        detail: t("sync.throttledDetail", { name: providerName }),
      };
    case "auth-error":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.reauthHeading"),
        tone: "warn",
        detail: t("sync.reauthDetail", { name: providerName }),
      };
    case "conflict":
      return {
        Icon: CloudAlertIcon,
        label: t("sync.conflictHeading"),
        tone: "warn",
        detail: t("sync.conflictDetail", { name: providerName }),
      };
    case "saved":
    case "idle":
      return dirty
        ? {
            Icon: CloudUploadIcon,
            label: t("sync.pendingHeading"),
            tone: "accent",
            detail: t("sync.pendingDetail", { name: providerName }),
          }
        : {
            Icon: CloudCheckIcon,
            label: t("sync.syncedTo", { name: providerName }),
            tone: "ok",
          };
  }
}

const TONE_BORDER: Record<Tone, string> = {
  ok: "border-success/40 bg-success/5",
  busy: "border-line bg-surface-2",
  warn: "border-pipe/50 bg-pipe/5",
  err: "border-danger/50 bg-danger/5",
  flag: "border-flag/50 bg-flag/5",
  accent: "border-accent bg-accent/10",
};

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-success",
  busy: "text-muted",
  warn: "text-pipe",
  err: "text-danger",
  flag: "text-flag",
  accent: "text-accent",
};

export function SyncDetailsModal({
  open,
  backend,
  namespace,
  providerName,
  status,
  statusDetail,
  dirty,
  offline,
  onSaveNow,
  onReload,
  onReconnect,
  onCheckConnection,
  onClose,
}: Props) {
  const t = useT();
  const titleId = useId();
  // The sync log is a developer diagnostic — only surfaced in developer
  // mode (logging is a no-op for everyone else).
  const { devMode } = useDevMode();
  const [reconnectPending, setReconnectPending] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  // Live state of the "Check connection" probe so the user sees what's
  // happening — a spinner while it reaches the backend, then the outcome.
  const [checkPending, setCheckPending] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [checkTone, setCheckTone] = useState<Tone>("busy");
  const [logOpen, setLogOpen] = useState(false);

  // Reset the inline reconnect state whenever the modal closes or the
  // session leaves the auth-error state, so a stale spinner / error never
  // greets a later open.
  useEffect(() => {
    if (!open) {
      setReconnectPending(false);
      setReconnectError(null);
    }
  }, [open]);
  useEffect(() => {
    if (status !== "auth-error") setReconnectError(null);
  }, [status]);
  // Drop the connection-check result once the modal closes or we're no
  // longer offline (a successful check, or sync recovering on its own), so a
  // stale "still offline" line never lingers behind a now-synced state.
  useEffect(() => {
    if (!open || !offline) {
      setCheckPending(false);
      setCheckMessage(null);
    }
  }, [open, offline]);

  const view = providerView(backend, namespace);
  // The "Open in …" link names the destination service itself — Dropbox,
  // Google Drive — not the at-rest encryption state. `providerName` is the
  // adapter label, which the encryption wrapper suffixes with " (encrypted)";
  // strip that so the button reads "Open in Dropbox", not
  // "Open in Dropbox (encrypted)".
  const baseProviderName = providerName.replace(/\s*\(encrypted\)$/, "");
  // The encryption state is read off that same label suffix, so the Details
  // grid shows On / Off without threading a separate flag through.
  const encrypted = /\s*\(encrypted\)$/.test(providerName);
  const state = statusView(
    status,
    statusDetail,
    dirty,
    offline,
    baseProviderName,
    t,
  );
  const busy = status === "saving";
  const showReconnect = status === "auth-error" && onReconnect !== null;

  const handleReconnect = async () => {
    if (!onReconnect || reconnectPending) return;
    setReconnectPending(true);
    setReconnectError(null);
    try {
      await onReconnect();
    } catch (err) {
      setReconnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconnectPending(false);
    }
  };

  const handleCheckConnection = async () => {
    if (checkPending) return;
    setCheckPending(true);
    // Show progress straight away so the button never looks inert.
    setCheckTone("busy");
    setCheckMessage(t("sync.checkPinging", { name: baseProviderName }));
    try {
      const result = await onCheckConnection();
      if (result === "online") {
        // No sticky "back online" line: when the connection truly holds the
        // status card flips to Synced (and this whole offline block unmounts),
        // which is the feedback. Keeping a success message would survive and
        // contradict the card if the queued save then re-flags offline on a
        // flaky write — the "says offline but reads back online" bug.
        setCheckMessage(null);
      } else if (result === "auth-error") {
        setCheckTone("warn");
        setCheckMessage(t("sync.checkAuthExpired", { name: baseProviderName }));
      } else {
        setCheckTone("flag");
        setCheckMessage(
          t("sync.checkStillOffline", { name: baseProviderName }),
        );
      }
    } catch (err) {
      setCheckTone("err");
      setCheckMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckPending(false);
    }
  };

  const showSaveNow =
    !busy &&
    !showReconnect &&
    (status === "error" || (dirty && status !== "conflict"));
  const saveLabel = status === "error" ? t("sync.tryAgain") : t("sync.saveNow");

  const reconnectLabel =
    reconnectError !== null
      ? t("sync.tryAgain")
      : t("sync.reconnect", { name: providerName });
  const ReconnectIcon: IconComponent = reconnectPending
    ? SpinnerIcon
    : RefreshIcon;
  const CheckIcon: IconComponent = checkPending ? SpinnerIcon : RefreshIcon;

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} centered>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-3 px-4 py-3">
        <h2
          id={titleId}
          className="flex items-center gap-2 text-sm font-bold tracking-wide text-fg-bright"
        >
          <CloudIcon className="h-4 w-4" />
          {t("sync.cloudSync")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="-mr-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4">
        {/* Headline status — what sync is doing and, on failure, why. */}
        <section className="flex flex-col gap-2">
          <SectionLabel>{t("sync.status")}</SectionLabel>
          {/* The status card and a reload glyph share a row — reload is a
              compact icon here (whatever the state) rather than a full-width
              button below, to save vertical space. */}
          <div className="flex items-stretch gap-2">
            <div
              className={`flex flex-1 items-start gap-2 rounded border px-2.5 py-2 ${TONE_BORDER[state.tone]}`}
            >
              <state.Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_TEXT[state.tone]} ${
                  state.spin ? "animate-spin" : ""
                }`}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={`text-sm font-bold ${TONE_TEXT[state.tone]}`}>
                  {state.label}
                </span>
                {state.detail && (
                  <p className="text-xs break-words whitespace-pre-wrap text-fg">
                    {state.detail}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onReload}
              title={t("sync.reloadFromBackend")}
              aria-label={t("sync.reloadFromBackend")}
              className="inline-flex w-10 shrink-0 cursor-pointer items-center justify-center rounded border border-line bg-surface-2 text-muted hover:border-accent hover:text-accent"
            >
              <RefreshIcon className="h-4 w-4" />
            </button>
          </div>

          {(showReconnect || showSaveNow) && (
            <div className="flex flex-wrap items-center gap-2">
              {showReconnect && (
                <button
                  type="button"
                  onClick={handleReconnect}
                  disabled={reconnectPending}
                  aria-busy={reconnectPending || undefined}
                  className={`inline-flex items-center justify-center gap-1.5 rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-70 ${
                    reconnectPending ? "" : "cursor-pointer"
                  }`}
                >
                  <ReconnectIcon
                    className={`h-3.5 w-3.5 ${reconnectPending ? "animate-spin" : ""}`}
                  />
                  {reconnectLabel}
                </button>
              )}

              {showSaveNow && (
                <button
                  type="button"
                  onClick={onSaveNow}
                  className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
                >
                  <CloudUploadIcon className="h-3.5 w-3.5" />
                  {saveLabel}
                </button>
              )}
            </div>
          )}

          {reconnectError && (
            <p className="text-xs break-words text-danger">{reconnectError}</p>
          )}

          {/* While offline, an active re-probe with live status, so the user
              can confirm connectivity rather than wait for the next save. */}
          {offline && (
            <>
              <button
                type="button"
                onClick={handleCheckConnection}
                disabled={checkPending}
                aria-busy={checkPending || undefined}
                className={`inline-flex items-center justify-center gap-1.5 self-start rounded border border-flag bg-flag/10 px-3 py-1.5 text-sm font-bold text-flag hover:bg-flag/20 disabled:cursor-not-allowed disabled:opacity-70 ${
                  checkPending ? "" : "cursor-pointer"
                }`}
              >
                <CheckIcon
                  className={`h-3.5 w-3.5 ${checkPending ? "animate-spin" : ""}`}
                />
                {t("sync.checkConnection")}
              </button>
              {checkMessage && (
                <p
                  className={`text-xs break-words ${TONE_TEXT[checkTone]}`}
                  role="status"
                  aria-live="polite"
                >
                  {checkMessage}
                </p>
              )}
            </>
          )}
        </section>

        {/* Backend + encryption side by side, then the file location. */}
        <section className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Detail label={t("sync.backend")} icon={backendGlyph(backend)}>
              <span className="truncate text-sm text-fg-bright">
                {baseProviderName}
              </span>
            </Detail>
            <Detail
              label={t("sync.encryptionLabel")}
              icon={
                encrypted ? (
                  <LockIcon className="h-3.5 w-3.5 shrink-0 text-accent" />
                ) : (
                  <ShieldIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                )
              }
            >
              <span
                className={`text-sm font-bold ${encrypted ? "text-accent" : "text-muted"}`}
              >
                {encrypted ? t("sync.encryptionOn") : t("sync.encryptionOff")}
              </span>
            </Detail>
          </div>

          <div className="flex flex-col gap-1">
            <SectionLabel>{t("sync.fileLocation")}</SectionLabel>
            <span className="rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-xs break-all text-fg">
              {view.path}
            </span>
          </div>
        </section>

        {/* Developer-only sync log. In developer mode the in-memory buffer
            is live whether or not capture (persistence) is on; for regular
            users logging is disabled, so this section is hidden. */}
        {devMode && (
          <section className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setLogOpen((v) => !v)}
              aria-expanded={logOpen}
              className="flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2.5 py-1.5 text-left hover:border-accent"
            >
              <ScrollTextIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
              <span className="flex-1 text-xs font-bold text-fg">
                {logOpen ? t("sync.hideSyncLog") : t("sync.viewSyncLog")}
              </span>
              {logOpen ? (
                <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted" />
              ) : (
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
              )}
            </button>
            {logOpen && <SyncLogPanel t={t} />}
          </section>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
        {view.url && (
          <a
            href={view.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            {t("sync.openIn", { name: baseProviderName })}
          </a>
        )}
      </footer>
    </Modal>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-bold tracking-wide text-muted uppercase">
      {children}
    </span>
  );
}

function Detail({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded border border-line bg-surface-2 px-2.5 py-2">
      <span className="text-[0.65rem] font-bold tracking-wide text-muted uppercase">
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-1.5">
        {icon}
        {children}
      </div>
    </div>
  );
}
