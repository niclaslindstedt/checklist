import { useEffect, useState } from "react";

import { useT } from "../../i18n";
import { ArrowLeftIcon, CloseIcon } from "../icons.tsx";
import {
  renderInlineMarkdown,
  renderMarkdown,
} from "../markdown/renderMarkdown.tsx";
import { Modal } from "../Modal.tsx";
import { CHANGELOG } from "./data.ts";
import { FEATURE_DOCS } from "./feature-docs.ts";
import type { ChangelogEntryType } from "./parse.ts";

// "What's new" dialog reached from the header menu. Lists every shipped
// release parsed from CHANGELOG.md, newest first, rendering each bullet's
// inline markdown. A bullet carrying a `[Learn more](feature:<slug>)` link
// drills into the matching feature doc (`docs/features/<slug>.md`,
// inlined via `./feature-docs.ts`) in place, with a back button.

// One accent per Keep-a-Changelog kind, reusing the theme's semantic
// colour slots.
const TYPE_COLOR: Record<ChangelogEntryType, string> = {
  Added: "text-positive",
  Changed: "text-accent",
  Fixed: "text-success",
  Removed: "text-negative",
  Security: "text-danger",
  Deprecated: "text-muted",
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ChangelogModal({ open, onClose }: Props) {
  const t = useT();
  // When set to a known slug the modal shows that feature doc in place of
  // the release list; the header grows a back button that clears it. A
  // slug with no bundled doc is ignored, so the link is inert rather than
  // a dead end.
  const [docSlug, setDocSlug] = useState<string | null>(null);

  // Drop back to the release list whenever the modal reopens, so a later
  // open doesn't inherit the previous session's drill-down.
  useEffect(() => {
    if (open) setDocSlug(null);
  }, [open]);

  const openFeature = (slug: string) => {
    if (FEATURE_DOCS[slug]) setDocSlug(slug);
  };

  const activeDoc = docSlug ? FEATURE_DOCS[docSlug] : undefined;

  if (activeDoc) {
    return (
      <Modal open={open} onClose={onClose} labelledBy="changelog-title">
        <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-3 px-2 py-3">
          <button
            type="button"
            onClick={() => setDocSlug(null)}
            aria-label={t("common.back")}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <h2
            id="changelog-title"
            className="flex-1 truncate text-sm font-bold tracking-wide text-fg-bright"
          >
            {activeDoc.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="-mr-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 text-sm leading-relaxed text-fg">
          {renderMarkdown(activeDoc.body, { onOpenFeature: openFeature })}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="changelog-title">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-3 px-4 py-3">
        <h2
          id="changelog-title"
          className="text-sm font-bold tracking-wide text-fg-bright"
        >
          {t("changelog.heading")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="-mr-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 text-sm">
        {CHANGELOG.length === 0 ? (
          <p className="py-8 text-center text-muted">{t("changelog.empty")}</p>
        ) : (
          <div className="flex flex-col gap-6">
            {CHANGELOG.map((release) => (
              <section key={release.version} className="flex flex-col gap-2">
                <h3 className="flex items-baseline gap-2 border-b border-line pb-1">
                  <span className="font-bold text-fg-bright">
                    {release.version}
                  </span>
                  {release.date && (
                    <span className="text-xs text-muted tabular-nums">
                      {release.date}
                    </span>
                  )}
                </h3>
                {release.sections.map((section) => (
                  <div key={section.type} className="flex flex-col gap-1">
                    <p
                      className={`text-xs font-bold tracking-wide ${TYPE_COLOR[section.type]}`}
                    >
                      {section.type}
                    </p>
                    <ul className="ml-4 list-disc space-y-1 text-fg">
                      {section.items.map((item, i) => (
                        <li key={i}>
                          {renderInlineMarkdown(item, {
                            onOpenFeature: openFeature,
                          })}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
