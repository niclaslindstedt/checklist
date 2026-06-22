// Coordinates the app's two pointer drags with the document-level touch
// gestures that would otherwise misread them.
//
// Reordering items inside a checklist (`useListReorder`) and filing a checklist
// into a folder / namespace (`useTouchChecklistDrag`) are both pointer drags
// that travel down the screen. Pull-to-refresh (`usePullToRefresh`) watches the
// same downward travel at the document level, so without coordination a drag
// would arm a refresh at the same time. Each drag source reports `true` on
// pick-up and `false` on drop through this context; the app root holds the
// boolean and folds it into the pull-to-refresh `enabled` gate — the same way
// the floating menu-button drag already does.
//
// The default no-op lets a drag source mount outside the provider (e.g. a
// component rendered in isolation by a test).

import { createContext, useContext } from "react";

export const ReportDragActivityContext = createContext<
  (active: boolean) => void
>(() => {});

/** Report whether a pointer drag is currently in progress. */
export function useReportDragActivity(): (active: boolean) => void {
  return useContext(ReportDragActivityContext);
}
