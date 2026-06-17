import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useT } from "../../i18n";
import { loadSettings } from "../../settings/store.ts";
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
// The whole toast is a button: clicking (or pressing it) dismisses it
// immediately. A circular countdown ring at the far left fills clockwise
// over the toast's lifetime and the toast auto-dismisses the moment the
// ring completes a full circle — the same `durationMs` drives both the
// CSS animation and the dismiss timer.
//
// The variant kind (`info` / `success` / `warning` / `error`) colours the
// ring via CSS tokens (`--link` / `--accent` / `--meta` / `--danger`) so
// the active `data-theme` flows through automatically without a per-kind
// className.

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
    // The "disable toasts" setting suppresses the whole general stack.
    // Read it live so toggling it takes effect without a reload (the
    // upgrade hint is a separate surface and is never gated here). A
    // dropped toast returns the sentinel id 0, which `dismiss` ignores.
    if (loadSettings().disableToasts) return 0;
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

// Geometry of the countdown ring. A 16×16 viewBox with a radius-7 circle
// leaves room for the 2px stroke; the circumference is the dash length the
// arc animates against.
const RING_RADIUS = 7;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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

  // Ring colour keyed by kind, picked from CSS variables at render time so
  // it follows the active theme.
  const ringColor =
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
    >
      <button
        type="button"
        title={t("toast.dismiss")}
        onClick={() => onDismiss(toast.id)}
        className="pointer-events-auto flex w-full max-w-sm cursor-pointer items-center gap-3 overflow-hidden rounded-sm border border-line bg-surface py-2 pr-3 pl-2 text-left text-fg shadow-md transition-colors hover:bg-surface-2"
      >
        <ToastTimerRing durationMs={toast.durationMs} color={ringColor} />
        <span className="flex-1 text-sm">{toast.message}</span>
      </button>
    </div>
  );
}

// Circular countdown that fills clockwise from the top over `durationMs`.
// A faint full ring sits underneath as the track; the coloured arc on top
// animates its `stroke-dashoffset` from a hidden full circle to a drawn
// one (see `.toast-timer-arc` in `theme.css`). The `-rotate-90` starts the
// sweep at twelve o'clock. Reduce-motion zeroes the animation, leaving a
// static full ring.
function ToastTimerRing({
  durationMs,
  color,
}: {
  durationMs: number;
  color: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 -rotate-90"
      style={
        {
          "--toast-ring-circumference": RING_CIRCUMFERENCE,
          "--toast-ring-duration": `${durationMs}ms`,
        } as CSSProperties
      }
    >
      <circle
        cx="8"
        cy="8"
        r={RING_RADIUS}
        fill="none"
        stroke="var(--line)"
        strokeWidth="2"
        opacity="0.35"
      />
      <circle
        className="toast-timer-arc"
        cx="8"
        cy="8"
        r={RING_RADIUS}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
      />
    </svg>
  );
}
