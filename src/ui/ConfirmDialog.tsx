import { useEffect, useState, type ReactNode } from "react";

import { useT } from "../i18n";
import { Button } from "./form/index.ts";
import {
  AlertTriangleIcon,
  CloseIcon,
  HelpCircleIcon,
  SpinnerIcon,
} from "./icons.tsx";
import { Modal } from "./Modal.tsx";

// A small generic confirmation dialog — the in-app replacement for the
// browser's `window.confirm`. Title + optional description + a Confirm
// and a Cancel button, rendered as a compact centered card. Cloned in
// spirit from the budget project's `ConfirmDialog`, pared to a single
// confirm action and made dependency-free (icons come from the inline
// `icons.tsx` set rather than `lucide-react`).
//
// Tapping Confirm paints a spinner inside the button before running
// `onConfirm`: a heavy handler (deleting a namespace and its whole
// checklist) can otherwise block paint long enough that the tap feels
// lost, so a two-frame defer lets the browser show the spinner first.
// The dialog blocks further dismissal while the confirm is in flight so
// the user can't double-fire it.

type Tone = "default" | "danger";

type Props = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  // Defaults to the shared `common.cancel` string.
  cancelLabel?: string;
  // `danger` paints the confirm button red and swaps the neutral
  // question-mark title glyph for a warning triangle.
  tone?: Tone;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  onConfirm,
  onCancel,
}: Props) {
  const t = useT();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) setPending(false);
  }, [open]);

  const runConfirm = () => {
    if (pending) return;
    setPending(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => void onConfirm());
    });
  };

  const handleCancel = () => {
    if (pending) return;
    onCancel();
  };

  const danger = tone === "danger";

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      labelledBy="confirm-dialog-title"
      role="alertdialog"
      centered
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-3 px-4 py-3">
        <h2
          id="confirm-dialog-title"
          className="flex min-w-0 items-center gap-2 text-sm font-bold tracking-wide text-fg-bright"
        >
          <span
            className={`shrink-0 ${danger ? "text-danger" : "text-accent"}`}
          >
            {danger ? (
              <AlertTriangleIcon className="h-4 w-4" />
            ) : (
              <HelpCircleIcon className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0 truncate">{title}</span>
        </h2>
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          aria-label={t("common.close")}
          className="-mr-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {description && <div className="text-sm text-fg">{description}</div>}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
        <Button
          type="button"
          variant="secondary"
          onClick={handleCancel}
          disabled={pending}
        >
          {cancelLabel ?? t("common.cancel")}
        </Button>
        <Button
          type="button"
          variant={danger ? "danger" : "primary"}
          onClick={runConfirm}
          disabled={pending}
          aria-busy={pending || undefined}
          className="inline-flex items-center gap-2"
        >
          <span>{confirmLabel}</span>
          {pending && <SpinnerIcon className="h-4 w-4 animate-spin" />}
        </Button>
      </footer>
    </Modal>
  );
}
