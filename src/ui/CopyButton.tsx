import { useCallback, useMemo, useRef, useState } from "react";

import { unlock } from "../achievements/bus.ts";
import { activeCategories } from "../domain/checklists.ts";
import type { Checklist } from "../domain/types.ts";
import { useT } from "../i18n";
import { checklistBodyMarkdown } from "../storage/markdown/codec.ts";
import { FloatingPanel } from "./FloatingPanel.tsx";
import { CheckIcon, CopyIcon } from "./icons.tsx";
import { useToast } from "./toast/useToast.ts";

// Header affordance that puts the active checklist on the clipboard as plain
// task-list markdown — the `# Name` heading and every `- [ ]` / `- [x]` line,
// checked items still checked, without the persistence frontmatter or the
// `*(category)*` markers (see `checklistBodyMarkdown`). Sits left of the
// cloud-sync glyph and styled to match it. The glyph swaps to a tick for a
// beat after a successful copy so the action reads even if toasts are
// disabled.
//
// On a **categorised** list the button first opens a small dropdown — "All"
// plus one entry per category header — so the user can lift a single section
// out of a long list (the produce aisle out of the week's shopping) instead of
// the lot. Picking a category copies just the items nested under it, with the
// header's own line left out. A list with no categories has nothing to choose
// between, so the button stays a one-tap copy.

// Best-effort clipboard write: the async Clipboard API where available
// (PWA over https), falling back to a hidden-textarea `execCommand` for
// the odd insecure-context / older-engine case so the copy still lands.
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  checklist,
  includeArchived,
}: {
  checklist: Checklist;
  includeArchived: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const categories = useMemo(() => activeCategories(checklist), [checklist]);

  // `categoryId` undefined copies the whole list; a category id copies just
  // that section's children.
  const copy = useCallback(
    async (categoryId?: string) => {
      const ok = await writeClipboard(
        checklistBodyMarkdown(checklist, {
          includeArchived,
          categoryMarkers: false,
          ...(categoryId ? { categoryId } : {}),
        }),
      );
      if (!ok) {
        toast.push({ kind: "error", message: t("app.copyFailed") });
        return;
      }
      toast.push({ kind: "success", message: t("app.copied") });
      unlock("copyThat");
      if (categoryId) unlock("sectionCopy");
      setCopied(true);
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1500);
    },
    [checklist, includeArchived, t, toast],
  );

  const onClick = useCallback(() => {
    if (categories.length > 0) {
      setOpen((v) => !v);
      return;
    }
    void copy();
  }, [categories.length, copy]);

  const label = copied ? t("app.copied") : t("app.copyChecklist");
  const Icon = copied ? CheckIcon : CopyIcon;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        {...(categories.length > 0
          ? { "aria-haspopup": "menu" as const, "aria-expanded": open }
          : {})}
        className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border bg-transparent focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none ${
          copied
            ? "border-success/40 text-success"
            : "border-line text-muted hover:bg-fg/5 hover:text-fg"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </button>

      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={{
          width: { kind: "min", minPx: 180 },
          anchor: "right",
          coordinateSpace: "document",
        }}
        className="py-1"
      >
        <div
          role="menu"
          aria-label={t("app.copyScope")}
          className="outline-none"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void copy();
            }}
            className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm text-fg hover:bg-surface-3 hover:text-fg-bright"
          >
            <CopyIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="flex-1">{t("app.copyAll")}</span>
          </button>
          {/* A separator, then the list's categories in document order. */}
          <div className="my-1 border-t border-line" />
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void copy(category.id);
              }}
              className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm text-fg hover:bg-surface-3 hover:text-fg-bright"
            >
              {/* A spacer the width of the All entry's glyph, so every
                  label in the menu starts on the same column. */}
              <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">{category.title}</span>
            </button>
          ))}
        </div>
      </FloatingPanel>
    </>
  );
}
