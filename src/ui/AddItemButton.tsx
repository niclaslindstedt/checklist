import { useT } from "../i18n";

// The "add item" affordance. On small viewports it's a circular floating
// action button centred at the bottom of the screen — thumb-reachable and
// hard to miss. From the `sm` breakpoint up it relaxes into a normal,
// clearly-styled accent button pinned under the list. Either way, tapping
// it opens the inline draft row (see `AddItemForm`) rather than adding an
// item directly, so the user types straight into the spot the item lands.

export function AddItemButton({ onActivate }: { onActivate: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label={t("app.addItem")}
      className="
        fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 z-20
        flex h-14 w-14 -translate-x-1/2 items-center justify-center gap-0
        rounded-full bg-accent text-3xl leading-none font-bold text-page-bg
        shadow-lg transition-transform active:scale-95
        sm:static sm:mx-auto sm:mt-3 sm:h-auto sm:w-auto sm:translate-x-0
        sm:gap-2 sm:rounded-md sm:bg-accent/10 sm:px-4 sm:py-2 sm:text-base
        sm:text-accent sm:shadow-none sm:hover:bg-accent/20
      "
    >
      <span aria-hidden className="-mt-0.5 sm:mt-0">
        +
      </span>
      <span className="hidden sm:inline">{t("app.addItem")}</span>
    </button>
  );
}
