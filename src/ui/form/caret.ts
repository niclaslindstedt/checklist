// Caret helpers for the contenteditable fields (see `ContentEditable`).

/** Focus an element and drop the caret at the very end of its text. */
export function focusAtEnd(el: HTMLElement | null): void {
  if (!el) return;
  el.focus();
  const selection = window.getSelection?.();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
