import { useEffect, useId, type ReactNode } from "react";

import { useT } from "../i18n";
import { ArchiveIcon, ChecklistIcon, MenuIcon } from "./icons.tsx";

// The left navigation drawer. Collapsed to a single floating button on
// the left edge; pressing it slides the drawer in over a dimmed backdrop.
// The drawer lists the app's views (the active checklist and the archive)
// and highlights the current one. Selecting a view navigates and closes
// the drawer. Kept presentational — App owns the open/current state and
// passes it down, mirroring how ChecklistView is wired.

/** The top-level views the drawer switches between. */
export type View = "checklist" | "archive";

type Props = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  current: View;
  onNavigate: (view: View) => void;
  /** Archived-item count, shown as a badge beside the Archive entry. */
  archivedCount: number;
};

export function SideMenu({
  open,
  onToggle,
  onClose,
  current,
  onNavigate,
  archivedCount,
}: Props) {
  const t = useT();
  const drawerId = useId();

  // Dismiss on Escape while open (the backdrop handles pointer dismissal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Floating toggle, pinned to the left edge and vertically centred. */}
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? drawerId : undefined}
        aria-label={open ? t("nav.close") : t("nav.open")}
        className="fixed top-1/2 left-3 z-40 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-muted shadow-lg hover:text-fg-bright"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label={t("nav.close")}
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/50"
          />
          <nav
            id={drawerId}
            aria-label={t("nav.label")}
            className="relative flex w-64 max-w-[80%] flex-col border-r border-line bg-surface shadow-xl [padding-bottom:env(safe-area-inset-bottom)] [padding-top:env(safe-area-inset-top)]"
          >
            <p className="border-b border-line px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
              {t("nav.label")}
            </p>
            <NavItem
              icon={<ChecklistIcon className="h-5 w-5" />}
              label={t("nav.checklist")}
              active={current === "checklist"}
              onClick={() => onNavigate("checklist")}
            />
            <NavItem
              icon={<ArchiveIcon className="h-5 w-5" />}
              label={t("nav.archive")}
              active={current === "archive"}
              badge={archivedCount > 0 ? archivedCount : undefined}
              onClick={() => onNavigate("archive")}
            />
          </nav>
        </div>
      )}
    </>
  );
}

function NavItem({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm ${
        active
          ? "bg-surface-2 font-semibold text-fg-bright"
          : "text-fg hover:bg-surface-2 hover:text-fg-bright"
      }`}
    >
      <span className={active ? "text-accent" : "text-muted"}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}
