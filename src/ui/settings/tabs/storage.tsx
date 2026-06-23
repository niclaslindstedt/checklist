import { useState, type FormEvent, type ReactNode } from "react";

import { useT } from "../../../i18n";
import type { BackendId } from "../../../storage/backend-preference.ts";
import type {
  EncryptionProgress,
  UseStorageBackend,
} from "../../../storage/useStorageBackend.ts";
import { CipherGlyph } from "../../CipherGlyph.tsx";
import { STEP_MESSAGE_KEY } from "../../encryption-progress.ts";
import { Button, ClearableInput } from "../../form/index.ts";
import { ShieldIcon, SpinnerIcon } from "../../icons.tsx";
import {
  EncryptionLogModal,
  type EncryptionLogEntry,
} from "../EncryptionLogModal.tsx";
import { Section } from "../shared.tsx";

// Storage settings: pick the backend that persists the document (this
// device / Dropbox / Google Drive) and toggle at-rest encryption.
// Modelled on the budget project's storage tab, pared to the checklist's
// account-less, single-document model.

type Props = {
  storage: UseStorageBackend;
};

export function StorageTab({ storage }: Props) {
  const t = useT();
  const {
    backend,
    dropboxConfigured,
    gdriveConfigured,
    dropboxConnected,
    gdriveConnected,
    folderAvailable,
    folderConnected,
    folderReconnectNeeded,
    encryption,
    selectBrowser,
    connectFolder,
    reconnectFolder,
    disconnectFolder,
    connectDropbox,
    disconnectDropbox,
    connectGdrive,
    disconnectGdrive,
    enableEncryption,
    disableEncryption,
  } = storage;

  const [gdriveError, setGdriveError] = useState<string | null>(null);

  const backendOptions: {
    value: BackendId;
    label: string;
    disabled?: boolean;
  }[] = [
    { value: "browser", label: t("settings.storage.backendBrowser") },
    {
      value: "folder",
      label: t("settings.storage.backendFolder"),
      disabled: !folderAvailable,
    },
    {
      value: "dropbox",
      label: t("settings.storage.backendDropbox"),
      disabled: !dropboxConfigured,
    },
    {
      value: "gdrive",
      label: t("settings.storage.backendGoogleDrive"),
      disabled: !gdriveConfigured,
    },
  ];

  const onPickBackend = (next: BackendId) => {
    setGdriveError(null);
    if (next === backend) return;
    if (next === "browser") selectBrowser();
    else if (next === "folder") void connectFolder();
    else if (next === "dropbox") connectDropbox();
    else void connectGdriveWithCapture();
  };

  const connectGdriveWithCapture = async () => {
    setGdriveError(null);
    try {
      await connectGdrive();
    } catch (err) {
      setGdriveError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <Section title={t("settings.storage.backendTitle")}>
        <p className="text-xs text-muted">
          {t("settings.storage.backendBlurb")}
        </p>
        <div
          role="radiogroup"
          aria-label={t("settings.storage.backendTitle")}
          className="flex flex-wrap gap-2"
        >
          {backendOptions.map((opt) => {
            const active = opt.value === backend;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={opt.disabled}
                onClick={() => onPickBackend(opt.value)}
                className={`cursor-pointer rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? "border-accent bg-accent/15 font-bold text-accent"
                    : "border-line bg-surface-2 text-fg hover:bg-surface-3"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {backend === "browser" && (
          <p className="text-xs text-muted">
            {t("settings.storage.browserHint")}
          </p>
        )}

        {backend === "folder" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">
              {folderReconnectNeeded
                ? t("settings.storage.folderReconnectHint")
                : folderConnected
                  ? t("settings.storage.folderConnected")
                  : t("settings.storage.folderUnconnected")}
            </p>
            <div className="flex items-center gap-2">
              {folderReconnectNeeded ? (
                <Button
                  variant="primary"
                  onClick={() => void reconnectFolder()}
                >
                  {t("settings.storage.folderReconnect")}
                </Button>
              ) : folderConnected ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => void disconnectFolder()}
                  >
                    {t("settings.storage.disconnect")}
                  </Button>
                  <span className="text-xs text-success">
                    {t("settings.storage.connected")}
                  </span>
                </>
              ) : (
                <Button variant="primary" onClick={() => void connectFolder()}>
                  {t("settings.storage.folderChoose")}
                </Button>
              )}
            </div>
          </div>
        )}

        {backend === "dropbox" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">
              {dropboxConnected
                ? t("settings.storage.dropboxConnected")
                : t("settings.storage.dropboxUnconnected")}
            </p>
            {dropboxConnected ? (
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={disconnectDropbox}>
                  {t("settings.storage.disconnect")}
                </Button>
                <span className="text-xs text-success">
                  {t("settings.storage.connected")}
                </span>
              </div>
            ) : (
              <Button variant="primary" onClick={connectDropbox}>
                {t("settings.storage.connect")}
              </Button>
            )}
          </div>
        )}

        {backend === "gdrive" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">
              {gdriveConnected
                ? t("settings.storage.gdriveConnected")
                : t("settings.storage.gdriveUnconnected")}
            </p>
            {gdriveConnected ? (
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={disconnectGdrive}>
                  {t("settings.storage.disconnect")}
                </Button>
                <span className="text-xs text-success">
                  {t("settings.storage.connected")}
                </span>
              </div>
            ) : (
              <Button
                variant="primary"
                onClick={() => void connectGdriveWithCapture()}
              >
                {t("settings.storage.connect")}
              </Button>
            )}
            {gdriveError && (
              <p
                role="alert"
                className="rounded border border-danger/50 px-2 py-1.5 text-xs break-words text-danger"
              >
                {gdriveError}
              </p>
            )}
          </div>
        )}
      </Section>

      <EncryptionSection
        encryption={encryption}
        onEnable={enableEncryption}
        onDisable={disableEncryption}
      />
    </>
  );
}

function EncryptionSection({
  encryption,
  onEnable,
  onDisable,
}: {
  encryption: "encrypted" | "plaintext";
  onEnable: (
    password: string,
    onProgress?: EncryptionProgress,
  ) => Promise<void>;
  onDisable: (onProgress?: EncryptionProgress) => Promise<void>;
}) {
  const t = useT();
  const on = encryption === "encrypted";
  const [setting, setSetting] = useState(false);
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  // Synchronous passphrase validation (too short / mismatch) shown inline under
  // the form. The asynchronous flow's own failures live in the status bar.
  const [validationError, setValidationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The single line the status bar flashes while the flow runs. Each phase
  // overwrites it, so the bar reads as a fast-moving ticker rather than a list.
  const [current, setCurrent] = useState<EncryptionLogEntry | null>(null);
  // Every phase plus any terminating error, kept so the log modal can replay
  // the whole operation once the user taps a failed status bar.
  const [log, setLog] = useState<EncryptionLogEntry[]>([]);
  const [failed, setFailed] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  // Drive one turn-on / turn-off attempt: reset the status state, feed each
  // reported phase into the ticker + the running log, and on a thrown failure
  // park a red, tappable status bar instead. Resolves to whether it succeeded.
  const runFlow = async (
    op: (onProgress: EncryptionProgress) => Promise<void>,
  ): Promise<boolean> => {
    setBusy(true);
    setFailed(false);
    setCurrent(null);
    setLog([]);
    const onProgress: EncryptionProgress = (step) => {
      const entry: EncryptionLogEntry = {
        text: t(STEP_MESSAGE_KEY[step]),
        ts: Date.now(),
        level: "info",
      };
      setCurrent(entry);
      setLog((prev) => [...prev, entry]);
    };
    try {
      await op(onProgress);
      // Done — drop the ticker so the heading's "on / off" is all that's left.
      setCurrent(null);
      setLog([]);
      return true;
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setLog((prev) => [...prev, { text, ts: Date.now(), level: "error" }]);
      setCurrent(null);
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitEnable = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (pass.length < 4) {
      setValidationError(t("settings.storage.passphraseTooShort"));
      return;
    }
    if (pass !== confirm) {
      setValidationError(t("settings.storage.passphraseMismatch"));
      return;
    }
    setValidationError(null);
    const ok = await runFlow((onProgress) => onEnable(pass, onProgress));
    if (ok) {
      setSetting(false);
      setPass("");
      setConfirm("");
    }
  };

  const disable = async () => {
    if (busy) return;
    await runFlow((onProgress) => onDisable(onProgress));
  };

  return (
    <Section title={t("settings.storage.encryptionTitle")}>
      <div className="flex items-start gap-3">
        <ShieldIcon
          className={`mt-0.5 h-5 w-5 ${on ? "text-success" : "text-muted"}`}
        />
        <div className="flex-1">
          <h3 className="text-sm font-bold text-fg-bright">
            {on
              ? t("settings.storage.encryptionOn")
              : t("settings.storage.encryptionOff")}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {t("settings.storage.encryptionHint")}
          </p>
        </div>
      </div>

      {!on && !setting && (
        <Button variant="primary" onClick={() => setSetting(true)}>
          {t("settings.storage.enableEncryption")}
        </Button>
      )}

      {!on && setting && (
        <form onSubmit={submitEnable} className="flex flex-col gap-2">
          <ClearableInput
            type="password"
            value={pass}
            onValueChange={setPass}
            placeholder={t("settings.storage.passphrase")}
            aria-label={t("settings.storage.passphrase")}
            disabled={busy}
            wrapperClassName="rounded border border-line bg-surface-2 px-2 py-1.5"
          />
          <ClearableInput
            type="password"
            value={confirm}
            onValueChange={setConfirm}
            placeholder={t("settings.storage.passphraseConfirm")}
            aria-label={t("settings.storage.passphraseConfirm")}
            disabled={busy}
            wrapperClassName="rounded border border-line bg-surface-2 px-2 py-1.5"
          />
          <p className="text-xs text-danger">
            {t("settings.storage.passphraseWarning")}
          </p>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              <ButtonLabel busy={busy}>
                {t("settings.storage.enableEncryption")}
              </ButtonLabel>
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setSetting(false);
                setValidationError(null);
                setFailed(false);
                setPass("");
                setConfirm("");
              }}
            >
              {t("settings.storage.cancel")}
            </Button>
          </div>
        </form>
      )}

      {on && (
        <Button variant="danger" onClick={() => void disable()} disabled={busy}>
          <ButtonLabel busy={busy}>
            {t("settings.storage.disableEncryption")}
          </ButtonLabel>
        </Button>
      )}

      {busy && current && (
        <div
          role="status"
          aria-label={t("settings.storage.encryptionStatusAria")}
          className="flex items-center gap-2 rounded-[var(--radius)] border border-line bg-surface-2 px-2.5 py-1.5"
        >
          <CipherGlyph className="shrink-0 text-xs text-accent" />
          <span className="truncate text-xs text-muted">{current.text}</span>
        </div>
      )}

      {!busy && failed && (
        <button
          type="button"
          onClick={() => setLogOpen(true)}
          className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-danger/50 bg-danger/10 px-2.5 py-1.5 text-left hover:bg-danger/20"
        >
          <span className="truncate text-xs text-danger">
            {t("settings.storage.encryptionFailed")}
          </span>
        </button>
      )}

      {validationError && (
        <p role="alert" className="text-xs text-danger">
          {validationError}
        </p>
      )}

      <EncryptionLogModal
        open={logOpen}
        entries={log}
        onClose={() => setLogOpen(false)}
      />
    </Section>
  );
}

// A button label that swaps in a leading spinner while a flow runs, so the
// turn-on / turn-off button itself shows it's working — not just the status bar.
function ButtonLabel({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  if (!busy) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
      {children}
    </span>
  );
}
