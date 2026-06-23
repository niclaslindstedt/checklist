// Resolve the single "row being edited" id as rows report their editors
// opening (`active: true`) and closing (`active: false`). A close only clears
// the id when it matches the row reporting it.
//
// When editing moves straight from one row to the next — tapping another item
// with the keyboard up — the incoming row's editor mounts and claims the id
// first, then the outgoing row's editor commits and closes a beat later (its
// focused field only blurs once the new field has taken focus). A close that
// blindly nulled the id would undo the incoming row's claim, flashing the add
// button back over the keyboard. Keying the close on the reporting id makes
// that trailing close a no-op.
export function resolveActiveEditor(
  current: string | null,
  id: string,
  active: boolean,
): string | null {
  if (active) return id;
  return current === id ? null : current;
}
