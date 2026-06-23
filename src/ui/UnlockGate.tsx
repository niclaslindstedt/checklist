import { useState, type FormEvent } from "react";

import { useT } from "../i18n";
import { OfflineUnavailableError } from "../storage/cache/index.ts";
import type { EncryptionProgress } from "../storage/useStorageBackend.ts";
import { CipherGlyph } from "./CipherGlyph.tsx";
import { UNLOCK_STEP_MESSAGE_KEY } from "./encryption-progress.ts";
import { Button, ClearableInput } from "./form/index.ts";
import { ShieldIcon } from "./icons.tsx";

// Full-screen gate shown when at-rest encryption is on but no passphrase
// is held this session (a fresh load, after a reload). The user can't see
// or edit their lists until they supply the passphrase that decrypts the
// stored bytes. The analog of the budget project's login screen, where
// the account password doubles as the encryption key — pared to a single
// passphrase prompt since the checklist has no accounts.
//
// Unlike the app's other dialogs, this isn't a `Modal`: there's nothing to
// reveal behind it (the encrypted lists must not render until unlocked), so
// it paints a solid page background and floats a lone centered card on it,
// with no dimmed backdrop and no header/footer chrome.

type Props = {
  open: boolean;
  /** Resolves on success; rejects with a message on the wrong passphrase. */
  onUnlock: (
    password: string,
    onProgress?: EncryptionProgress,
  ) => Promise<void>;
};

export function UnlockGate({ open, onUnlock }: Props) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The phase line the unlock flow reports while it checks the passphrase and
  // decrypts the document, named in unlock-specific terms (see
  // UNLOCK_STEP_MESSAGE_KEY) so the gate hints at what's happening instead of
  // sitting blank.
  const [step, setStep] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    setStep(null);
    const onProgress: EncryptionProgress = (s) =>
      setStep(t(UNLOCK_STEP_MESSAGE_KEY[s]));
    try {
      await onUnlock(password, onProgress);
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
      setStep(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-page-bg px-4">
      <form
        onSubmit={submit}
        aria-labelledby="unlock-title"
        className="flex w-full max-w-sm flex-col gap-3 rounded-[var(--radius)] border border-line bg-surface p-5"
      >
        <div className="flex items-center gap-2 text-accent">
          <ShieldIcon className="h-6 w-6" />
          <h1 id="unlock-title" className="text-base font-bold text-fg-bright">
            {t("settings.storage.unlockTitle")}
          </h1>
        </div>
        <p className="text-sm text-muted">{t("settings.storage.unlockHint")}</p>
        <ClearableInput
          type="password"
          value={password}
          onValueChange={setPassword}
          placeholder={t("settings.storage.passphrase")}
          aria-label={t("settings.storage.passphrase")}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          wrapperClassName="rounded-[var(--radius)] border border-line bg-surface-2 px-2 py-1.5 focus-within:border-accent"
        />
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={!password || busy}
          className="w-full"
        >
          {t("settings.storage.unlock")}
        </Button>
        {busy && step && (
          <div
            role="status"
            aria-label={t("settings.storage.unlockStatusAria")}
            className="flex items-center gap-2 rounded-[var(--radius)] border border-line bg-surface-2 px-2.5 py-1.5"
          >
            <CipherGlyph className="shrink-0 text-xs text-accent" />
            <span className="truncate text-xs text-muted">{step}</span>
          </div>
        )}
      </form>
    </div>
  );
}
