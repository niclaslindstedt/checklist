import { useT } from "../i18n";
import { usePwaUpdate } from "../pwa/usePwaUpdate.ts";

// Soft "a new build is ready, click to reload" prompt, ported from
// budget. Mounted by `LanguageRoot` so it renders on every route. The
// service-worker registration and update polling live in the
// `usePwaUpdate` store (`src/pwa/usePwaUpdate.ts`); this component is
// just the completion CTA. It pins above the safe-area inset at
// `z-[60]`, just under the general toast stack (`z-[70]`).
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
  const { needRefresh, incomingVersion, reload, dismiss } = usePwaUpdate();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-toast-stack
      className="fixed right-[calc(0.75rem+var(--app-content-right,0px))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[calc(0.75rem+var(--app-content-left,0px))] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2 text-fg shadow-md"
    >
      <span className="flex-1 text-sm">
        {incomingVersion
          ? t("pwa.updateReady", { version: incomingVersion })
          : t("pwa.updateReadyGeneric")}
      </span>
      <button
        type="button"
        className="cursor-pointer text-sm text-link hover:underline"
        onClick={reload}
      >
        {t("pwa.reload")}
      </button>
      <button
        type="button"
        aria-label={t("pwa.dismiss")}
        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm text-muted hover:text-fg"
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}
