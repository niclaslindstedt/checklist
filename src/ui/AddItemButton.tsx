import { useT } from "../i18n";

// The "add item" affordance. On small viewports it's a circular floating
// action button centred at the bottom of the screen — thumb-reachable and
// hard to miss. From the `sm` breakpoint up it relaxes into a normal,
// clearly-styled accent button pinned under the list. Either way, tapping
// it opens the inline draft row (see `AddItemForm`) rather than adding an
// item directly, so the user types straight into the spot the item lands.
//
// The horizontal centre is anchored to the *visual* viewport
// (`--app-left` + half `--app-width`, the rect `useViewportHeight` tracks)
// rather than `left: 50%`: a bare 50% centres on the layout viewport, which
// iOS lets drift from what's on screen, leaving the button off to one side.
// The vars fall back to `calc(0px + 100% / 2)` — i.e. plain 50% — wherever
// the two viewports coincide (every non-iOS browser, pre-script render).

export function AddItemButton({ onActivate }: { onActivate: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label={t("app.addItem")}
      className="
        fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-20
        left-[calc(var(--app-left,0px)+var(--app-width,100%)/2)]
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
