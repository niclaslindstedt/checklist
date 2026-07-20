// Window-event names the composer listens for. Kept in a tiny standalone
// module so both the view that reacts to them (`ChecklistView`, in `ui/`) and
// the app-level hook that dispatches them (`use-widget-deep-link`, in `app/`)
// share one string without `ui/` having to import from `app/`.

/**
 * Fired when a "quick add" deep link (`checklist://add?list=<id>`) from a
 * widget or Control Center wants the active list's composer opened and
 * focused. The active list has already been switched by the dispatcher.
 */
export const FOCUS_COMPOSER_EVENT = "checklist:focus-composer";
