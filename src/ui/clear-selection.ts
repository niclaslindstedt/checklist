// Drop whatever the platform's press-and-hold text selection grabbed.
//
// The root `user-select: none` in theme.css keeps a hold on a touch device
// from starting a selection at all, but a selection made *before* the hold
// (a stray drag, a leftover range from a committed editor) survives into the
// gesture, and Chrome then paints its handles and paste bar over the menu the
// hold just opened. Every long-press opener calls this as it fires so the
// menu comes up on a clean page.
//
// A focused input / textarea keeps its selection: that one is the user's
// caret, not a stray highlight, and clearing it would fight the editor.
export function clearNativeSelection(): void {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed) return;
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  )
    return;
  selection.removeAllRanges();
}
