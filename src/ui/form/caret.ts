// Caret helper for the row editor's native text fields.

/** Focus an input/textarea and drop the caret at the very end of its text. */
export function focusAtEnd(
  el: HTMLInputElement | HTMLTextAreaElement | null,
): void {
  if (!el) return;
  // `preventScroll` so focusing the field doesn't trigger the browser's own
  // scroll-into-view: for a field near a clipped edge that scroll moves the
  // whole page (the visual viewport / layout viewport), jerking even the
  // pinned header, not just the list. The editor reveals the row itself by
  // scrolling only the list container (see `ChecklistRowEditor`), so the
  // browser's page-level scroll is pure jank we don't want.
  el.focus({ preventScroll: true });
  const end = el.value.length;
  el.setSelectionRange?.(end, end);
}
