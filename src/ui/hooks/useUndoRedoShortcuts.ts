import { useEffect } from "react";

// Global Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z / Ctrl+Y (redo),
// adapted from the budget project's keyboard handler. Bails out when
// focus is inside an editable element so the browser's native
// field-level undo keeps working while the user is typing in the
// add-item box.
//
// `enabled` (default true) gates the whole listener so the call site can
// silence the shortcuts while the side menu owns the screen — an open
// drawer's own controls take over, and a stray Cmd/Ctrl+Z shouldn't
// reach through it to mutate the list behind the menu.
export function useUndoRedoShortcuts(params: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  enabled?: boolean;
}): void {
  const { canUndo, canRedo, onUndo, onRedo, enabled = true } = params;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (isUndo && canUndo) {
        e.preventDefault();
        onUndo();
      } else if (isRedo && canRedo) {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, canUndo, canRedo, onUndo, onRedo]);
}
