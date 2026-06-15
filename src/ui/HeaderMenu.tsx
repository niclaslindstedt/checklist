import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { BUILD_LABEL } from "../build-env.ts";
import { useT } from "../i18n";
import {
  CodeIcon,
  CogIcon,
  HeartIcon,
  MenuIcon,
  ShieldIcon,
  SparklesIcon,
} from "./icons.tsx";

// Single burger menu in the top-right of the header. Houses Settings
// (which used to be its own cogwheel) plus the project links: privacy
// policy, "what's new", view source — with the build label as its meta —
// and an optional donate link. Mirrors budget's HeaderMenu, dropped to a
// plain self-anchored dropdown since the checklist has no competing
// stacking contexts to clamp against.

const SOURCE_URL = "https://github.com/niclaslindstedt/checklist";

type Props = {
  onOpenSettings: () => void;
  onOpenChangelog: () => void;
};

export function HeaderMenu({ onOpenSettings, onOpenChangelog }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Build-time env (string | undefined). A blank value disables the
  // donate entry entirely rather than linking nowhere.
  const donateUrl = import.meta.env.VITE_DONATE_URL?.trim();
  // BASE_URL carries the trailing slash, so this is `/privacy`,
  // `/preview/privacy`, … depending on the deploy slot.
  const privacyUrl = `${import.meta.env.BASE_URL}privacy`;

  // Dismiss on outside pointer-down or Escape while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(handler: () => void) {
    setOpen(false);
    handler();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("menu.open")}
        className={`-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded ${
          open
            ? "bg-surface-2 text-fg-bright"
            : "text-muted hover:bg-surface-2 hover:text-fg-bright"
        }`}
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-40 mt-2 flex w-60 flex-col overflow-hidden rounded-md border border-line bg-surface shadow-xl"
        >
          <MenuSection>
            <MenuItem
              icon={<CogIcon className="h-4 w-4" />}
              label={t("menu.settings")}
              onClick={() => pick(onOpenSettings)}
            />
            <MenuItem
              icon={<SparklesIcon className="h-4 w-4" />}
              label={t("menu.changelog")}
              onClick={() => pick(onOpenChangelog)}
            />
          </MenuSection>

          <MenuSection>
            <MenuLink
              icon={<ShieldIcon className="h-4 w-4" />}
              label={t("menu.privacy")}
              href={privacyUrl}
            />
            <MenuLink
              icon={<CodeIcon className="h-4 w-4" />}
              label={t("menu.source")}
              href={SOURCE_URL}
              external
              meta={BUILD_LABEL}
            />
            {donateUrl && (
              <MenuLink
                icon={<HeartIcon className="h-4 w-4 text-danger" />}
                label={t("menu.donate")}
                href={donateUrl}
                external
              />
            )}
          </MenuSection>
        </div>
      )}
    </div>
  );
}

// Separator between groups; the first section drops its top border so it
// sits flush with the panel's top edge.
function MenuSection({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-line first:border-t-0">{children}</div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
    >
      <span className="text-muted">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function MenuLink({
  icon,
  label,
  href,
  external,
  meta,
}: {
  icon: ReactNode;
  label: string;
  href: string;
  external?: boolean;
  meta?: string;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer noopener" : undefined}
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
    >
      <span className="text-muted">{icon}</span>
      <span>{label}</span>
      {meta && (
        <span className="ml-auto text-xs text-muted tabular-nums">{meta}</span>
      )}
    </a>
  );
}
