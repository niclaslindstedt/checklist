import { useT } from "../i18n";
import { usePwaUpdate } from "../pwa/usePwaUpdate.ts";
import { Button } from "./form";
import { RestoreIcon } from "./icons.tsx";

// Soft "an update is ready" prompt, ported from budget and restyled after
// the notes app. The new service worker has already downloaded and is
// parked in the `waiting` state; pressing the Update button applies it
// (the `controlling` listener in `usePwaUpdate` reloads the page).
// Surfacing this rather than auto-refreshing is deliberate — a silent
// swap would discard an in-progress edit. While the update waits for
// unsaved edits to reach the backend (`applying`), the button disables
// and reads "Saving…" so a press over a debounced cloud save is visibly
// held rather than ignored. It pins above the safe-area
// inset at `z-[60]`, just under the general toast stack (`z-[70]`).
//
// The Update button carries the whole "apply it" affordance, so the
// message is a plain headline plus the incoming version (truncated so a
// long `0.1.0.42-pre+a1b2c3d` never wraps the toast onto two awkward
// lines); we don't spell out "reload to apply" anymore.
//
// On a wide screen the side menu is pinned as a permanent docked sidebar
// (`SideMenu`), which eats 16rem on one edge. Since this toast lives
// outside App's flex layout it would otherwise centre over the whole
// window and land visibly off-centre over the content; the
// `--app-content-{left,right}` insets App publishes (see `useSidebarInset`)
// pull its centring band in to match the content area. They default to 0,
// so on narrow screens and the sidebar-less privacy/home pages nothing
// shifts.
export function UpdateToast() {
  const t = useT();
  const { needRefresh, incomingVersion, applying, reload, dismiss } =
    usePwaUpdate();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-toast-stack
      className="fixed right-[calc(0.75rem+var(--app-content-right,0px))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[calc(0.75rem+var(--app-content-left,0px))] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2.5 text-fg shadow-md"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{t("pwa.updateReady")}</span>
        {incomingVersion && (
          <span className="truncate text-xs text-muted tabular-nums">
            {t("pwa.updateVersion", { version: incomingVersion })}
          </span>
        )}
      </div>
      <Button
        variant="primary"
        className="inline-flex shrink-0 items-center gap-1.5"
        onClick={reload}
        disabled={applying}
      >
        <RestoreIcon className="h-4 w-4" />
        {applying ? t("pwa.updateSaving") : t("pwa.updateAction")}
      </Button>
      <button
        type="button"
        aria-label={t("pwa.dismiss")}
        className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted hover:text-fg"
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}
