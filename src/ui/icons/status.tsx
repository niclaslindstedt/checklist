// Sync / cloud status glyphs plus the spinner and refresh affordances.
// The cloud variants share one arc so they read as a family the way
// budget's lucide cloud-* icons do.

import type { ReactNode } from "react";

import type { IconProps } from "./shared.ts";

// Indeterminate spinner: a 270° arc that callers spin with
// `animate-spin`. The gap makes the rotation legible.
export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
      focusable={false}
      className={className}
    >
      <path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" />
    </svg>
  );
}

// The cloud arc (`M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24`)
// is lifted from lucide's `cloud-*` set; each variant overlays a different
// glyph on top of it.
const CLOUD_ARC = "M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24";

function CloudBase({
  className,
  children,
}: IconProps & { children?: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      className={className}
    >
      {children}
    </svg>
  );
}

/** Cloud with a check — the backend is in sync. */
export function CloudCheckIcon({ className }: IconProps) {
  return (
    <CloudBase className={className}>
      <path d={CLOUD_ARC} />
      <path d="m9 15 2 2 4-4" />
    </CloudBase>
  );
}

/** Cloud with an up-arrow — unsaved local edits the user can push. */
export function CloudUploadIcon({ className }: IconProps) {
  return (
    <CloudBase className={className}>
      <path d="M12 13v8" />
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="m8 17 4-4 4 4" />
    </CloudBase>
  );
}

/** Cloud with an exclamation — sync is in a warning / error state. */
export function CloudAlertIcon({ className }: IconProps) {
  return (
    <CloudBase className={className}>
      <path d="M12 12v4" />
      <path d="M12 20h.01" />
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    </CloudBase>
  );
}

/** A plain cloud — the cloud-sync details modal's title glyph. */
export function CloudIcon({ className }: IconProps) {
  return (
    <CloudBase className={className}>
      <path d={CLOUD_ARC} />
    </CloudBase>
  );
}

/** Struck-through cloud — offline / disconnected. */
export function CloudOffIcon({ className }: IconProps) {
  return (
    <CloudBase className={className}>
      <path d="m2 2 20 20" />
      <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
      <path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" />
    </CloudBase>
  );
}

/** A circular pair of arrows — retry a failed save / reconnect. */
export function RefreshIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      className={className}
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
