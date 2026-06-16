import { useState, type FormEvent } from "react";

import { useT } from "../../../i18n";
import type { BackendId } from "../../../storage/backend-preference.ts";
import type { UseStorageBackend } from "../../../storage/useStorageBackend.ts";
import { Button, ClearableInput } from "../../form/index.ts";
import { ShieldIcon } from "../../icons.tsx";
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
  onEnable: (password: string) => Promise<void>;
  onDisable: () => Promise<void>;
}) {
  const t = useT();
  const on = encryption === "encrypted";
  const [setting, setSetting] = useState(false);
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitEnable = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (pass.length < 4) {
      setError(t("settings.storage.passphraseTooShort"));
      return;
    }
    if (pass !== confirm) {
      setError(t("settings.storage.passphraseMismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onEnable(pass);
      setSetting(false);
      setPass("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDisable();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
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
            wrapperClassName="rounded border border-line bg-surface-2 px-2 py-1.5"
          />
          <ClearableInput
            type="password"
            value={confirm}
            onValueChange={setConfirm}
            placeholder={t("settings.storage.passphraseConfirm")}
            aria-label={t("settings.storage.passphraseConfirm")}
            wrapperClassName="rounded border border-line bg-surface-2 px-2 py-1.5"
          />
          <p className="text-xs text-danger">
            {t("settings.storage.passphraseWarning")}
          </p>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {t("settings.storage.enableEncryption")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSetting(false);
                setError(null);
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
          {t("settings.storage.disableEncryption")}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </Section>
  );
}
