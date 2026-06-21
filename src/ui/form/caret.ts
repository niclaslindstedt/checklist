// Caret helper for the row editor's native text fields.

/** Focus an input/textarea and drop the caret at the very end of its text. */
export function focusAtEnd(
  el: HTMLInputElement | HTMLTextAreaElement | null,
): void {
  if (!el) return;
  el.focus();
  const end = el.value.length;
  el.setSelectionRange?.(end, end);
}
