import { useT } from "../i18n";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "./icons.tsx";

// The keyboard nav bar: a floating pill that rides just above the soft
// keyboard while a checklist item is being edited. It mirrors the layout of
// iOS's own form-assistant bar — a previous/next pair on the left, a "done"
// affordance on the right — but its buttons drive the *checklist*: the up and
// down chevrons commit the current edit and jump editing to the item above or
// below, and the check commits and dismisses the keyboard.
//
// The bar lives in-flow at the bottom of the visual-viewport-pinned app shell
// (`ChecklistView`), so it sits above the keyboard without any fixed/viewport
// math of its own — only on touch layouts, where a soft keyboard exists
// (`sm:hidden`).
//
// Each button keeps the press *inside* the editor: `onMouseDown` preventDefault
// stops the tap from blurring (and so committing/closing) the focused input.
// That keeps the open editor — and this bar — mounted through the click, so the
// handler runs `commit()` itself and then re-opens the neighbour, rather than
// racing a blur that would have torn the bar down before the click landed.

export function EditNavBar({
  canPrev,
  canNext,
  onPrev,
  onNext,
  onDone,
}: {
  /** A previous item exists to jump editing up to. */
  canPrev: boolean;
  /** A next item exists to jump editing down to. */
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="mt-2 flex justify-center sm:hidden">
      <div className="flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-1 shadow-lg">
        <button
          type="button"
          disabled={!canPrev}
          onMouseDown={keepFocus}
          onClick={onPrev}
          aria-label={t("app.editPrev")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-fg disabled:opacity-30"
        >
          <ChevronUpIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          disabled={!canNext}
          onMouseDown={keepFocus}
          onClick={onNext}
          aria-label={t("app.editNext")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-fg disabled:opacity-30"
        >
          <ChevronDownIcon className="h-5 w-5" />
        </button>
        <div className="mx-1 h-5 w-px bg-line" aria-hidden />
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={onDone}
          aria-label={t("app.editDone")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-fg-bright hover:text-accent"
        >
          <CheckIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
