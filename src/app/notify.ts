// A one-way channel for the app hooks to raise a user-visible toast when
// something happens that the user wouldn't otherwise see the result of —
// a delete, an archive, a restore, an undo. The edit verbs and the
// checklist-collection verbs take this as a dependency rather than
// reaching for `useToast` directly, so they stay testable without a
// `ToastProvider` mounted (the default is a no-op) and the storage /
// domain layers keep their hands off the UI. App supplies the real
// implementation, wiring it to the shared toast stack.

import type { ToastKind } from "../ui/toast/useToast.ts";

export type Notify = (message: string, kind?: ToastKind) => void;

/** The no-op default for callers (and tests) that don't wire a toast sink. */
export const noopNotify: Notify = () => {};
