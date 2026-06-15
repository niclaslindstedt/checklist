import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useT } from "../../i18n";
import {
  ToastContext,
  type ToastContextValue,
  type ToastInput,
  type ToastKind,
} from "./useToast";

// General-purpose toast notifications, ported from budget. Mounted by
// `LanguageRoot` alongside `UpdateToast` so `useToast()` is available on
// every route. The viewport pins to the bottom-right, above the
// safe-area inset, at `z-[70]` so the stack stays legible over the
// update prompt (`z-[60]`).
//
// The variant kind (`info` / `success` / `warning` / `error`) is shown
// by a 2px left stripe coloured via CSS tokens (`--link` / `--accent` /
// `--meta` / `--danger`) so the active `data-theme` flows through
// automatically without a per-kind className.

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
  durationMs: number;
};

const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((input: ToastInput): number => {
    const id = nextId.current++;
    const kind = input.kind ?? "info";
    const durationMs =
      input.durationMs ??
      (kind === "error" ? ERROR_DURATION_MS : DEFAULT_DURATION_MS);
    setToasts((current) => {
      const next = [
        ...current,
        { id, kind, message: input.message, durationMs },
      ];
      // Cap the visible stack so a flurry of events doesn't pile up
      // beyond what the user can read; oldest entries drop off.
      return next.length > MAX_VISIBLE
        ? next.slice(next.length - MAX_VISIBLE)
        : next;
    });
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ push, dismiss }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const t = useT();
  if (toasts.length === 0) return null;
  return (
    <div
      role="region"
      aria-label={t("toast.region")}
      data-toast-stack
      className="pointer-events-none fixed right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[70] flex flex-col-reverse gap-2"
    >
      {toasts.map((toast) => (
        <ToastItemView key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItemView({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const t = useT();
  useEffect(() => {
    const handle = window.setTimeout(
      () => onDismiss(toast.id),
      toast.durationMs,
    );
    return () => window.clearTimeout(handle);
  }, [toast.id, toast.durationMs, onDismiss]);

  // Stripe colour keyed by kind, picked from CSS variables at render
  // time so it follows the active theme.
  const stripeVar =
    toast.kind === "success"
      ? "var(--accent)"
      : toast.kind === "warning"
        ? "var(--meta)"
        : toast.kind === "error"
          ? "var(--danger)"
          : "var(--link)";

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      aria-live={toast.kind === "error" ? "assertive" : "polite"}
      className="pointer-events-auto flex max-w-sm items-start gap-3 overflow-hidden rounded-sm border border-line bg-surface pr-2 text-fg shadow-md"
    >
      <span
        aria-hidden
        className="self-stretch"
        style={{ width: "2px", background: stripeVar }}
      />
      <span className="flex-1 py-2 pr-1 text-sm">{toast.message}</span>
      <button
        type="button"
        aria-label={t("toast.dismiss")}
        className="-mr-1 cursor-pointer px-1 py-2 text-muted hover:text-fg"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  );
}
