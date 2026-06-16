import { useEffect, useRef, type ReactNode } from "react";

import { useT } from "../i18n";
import { APP_VIEWPORT_RECT } from "./appViewportRect.ts";

// Minimal accessible modal: a dimmed backdrop with a centered card.
// Closes on Escape and backdrop click, locks body scroll while open,
// and moves focus into the card on open / restores it on close. Cloned
// in spirit from the budget project's `Modal`, pared to what the
// settings dialog needs (no portal — the app has a single root and no
// competing stacking contexts).

type Props = {
  open: boolean;
  onClose: () => void;
  // id of the heading element that names the dialog (aria-labelledby).
  labelledBy: string;
  children: ReactNode;
};

export function Modal({ open, onClose, labelledBy, children }: Props) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  // The dimming backdrop is a real <button> so dismiss-on-click carries
  // an interactive role (and a label) without piling event handlers onto
  // a non-interactive element; the dialog itself is a plain focusable
  // container layered above it.
  return (
    <div
      className="fixed z-50 flex items-stretch justify-center sm:items-center sm:p-4"
      style={APP_VIEWPORT_RECT}
    >
      <button
        type="button"
        aria-label={t("common.close")}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50"
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col overflow-hidden bg-surface text-fg shadow-xl outline-none sm:h-[min(90svh,42rem)] sm:max-w-3xl sm:rounded-lg sm:border sm:border-line"
      >
        {/* iOS PWA safe-area: the full-screen mobile layout reaches the top
            of the viewport, so reserve room for the status bar / Dynamic
            Island above the header. Coloured to match the modal headers
            (bg-surface-3) so it reads as an extension of the header bar.
            Centered desktop cards clear the inset already, so it's hidden
            from sm: up. */}
        <div
          aria-hidden="true"
          className="h-[env(safe-area-inset-top)] shrink-0 bg-surface-3 sm:hidden"
        />
        {children}
      </div>
    </div>
  );
}
