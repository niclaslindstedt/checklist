import { useState, type FormEvent } from "react";

import { useT } from "../i18n";
import { OfflineUnavailableError } from "../storage/cache/index.ts";
import { Button, ClearableInput } from "./form/index.ts";
import { ShieldIcon } from "./icons.tsx";
import { Modal } from "./Modal.tsx";

// Full-screen gate shown when at-rest encryption is on but no passphrase
// is held this session (a fresh load, after a reload). The user can't see
// or edit their lists until they supply the passphrase that decrypts the
// stored bytes. The analog of the budget project's login screen, where
// the account password doubles as the encryption key — pared to a single
// passphrase prompt since the checklist has no accounts.

type Props = {
  open: boolean;
  /** Resolves on success; rejects with a message on the wrong passphrase. */
  onUnlock: (password: string) => Promise<void>;
};

export function UnlockGate({ open, onUnlock }: Props) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onUnlock(password);
      setPassword("");
    } catch (err) {
      // Distinguish "can't reach your cloud and there's no offline copy yet"
      // from a genuinely wrong passphrase, so the gate stops blaming the
      // passphrase when the real problem is the network.
      setError(
        err instanceof OfflineUnavailableError
          ? t("settings.storage.unlockOffline")
          : t("settings.storage.unlockWrong"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => {}} labelledBy="unlock-title" centered>
      <form onSubmit={submit} className="flex flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-3 px-4 py-3">
          <ShieldIcon className="h-5 w-5 text-accent" />
          <h2
            id="unlock-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            {t("settings.storage.unlockTitle")}
          </h2>
        </header>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <p className="text-sm text-muted">
            {t("settings.storage.unlockHint")}
          </p>
          <ClearableInput
            type="password"
            value={password}
            onValueChange={setPassword}
            placeholder={t("settings.storage.passphrase")}
            aria-label={t("settings.storage.passphrase")}
            wrapperClassName="rounded border border-line bg-surface-2 px-2 py-1.5"
          />
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <Button type="submit" variant="primary" disabled={!password || busy}>
            {t("settings.storage.unlock")}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
