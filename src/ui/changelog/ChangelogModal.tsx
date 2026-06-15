import { useT } from "../../i18n";
import { CloseIcon } from "../icons.tsx";
import { Modal } from "../Modal.tsx";
import { CHANGELOG } from "./data.ts";
import type { ChangelogEntryType } from "./parse.ts";

// "What's new" dialog reached from the header menu. Lists every shipped
// release parsed from CHANGELOG.md, newest first. A lighter take on
// budget's ChangelogModal — no per-release "what's new since" filtering
// or feature-doc drill-down, just the history rendered plainly.

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
                        <li key={i}>{item}</li>
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
