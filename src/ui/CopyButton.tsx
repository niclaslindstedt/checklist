import { useCallback, useRef, useState } from "react";

import type { Checklist } from "../domain/types.ts";
import { useT } from "../i18n";
import { checklistBodyMarkdown } from "../storage/markdown/codec.ts";
import { CheckIcon, CopyIcon } from "./icons.tsx";
import { useToast } from "./toast/useToast.ts";

// Header affordance that puts the whole active checklist on the clipboard
// as plain task-list markdown — the `# Name` heading and every `- [ ]` /
// `- [x]` line, checked items still checked, without the persistence
// frontmatter (see `checklistBodyMarkdown`). Sits left of the cloud-sync
// glyph and styled to match it. The glyph swaps to a tick for a beat after
// a successful copy so the action reads even if toasts are disabled.

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

export function CopyButton({ checklist }: { checklist: Checklist }) {
  const t = useT();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const onClick = useCallback(async () => {
    const ok = await writeClipboard(checklistBodyMarkdown(checklist));
    if (!ok) {
      toast.push({ kind: "error", message: t("app.copyFailed") });
      return;
    }
    toast.push({ kind: "success", message: t("app.copied") });
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1500);
  }, [checklist, t, toast]);

  const label = copied ? t("app.copied") : t("app.copyChecklist");
  const Icon = copied ? CheckIcon : CopyIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border bg-transparent focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none ${
        copied
          ? "border-success/40 text-success"
          : "border-line text-muted hover:bg-fg/5 hover:text-fg"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}
