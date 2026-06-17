import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

import { DismissBackdrop } from "./DismissBackdrop.tsx";
import {
  type FloatingPlacement,
  useFloatingPosition,
} from "./hooks/useFloatingPosition.ts";
import { useEscapeKey } from "./hooks/useEscapeKey.ts";

type Props = {
  open: boolean;
  // Closes the panel.
  onClose: () => void;
  // Ref to the element the panel anchors against — the trigger button.
  triggerRef: RefObject<HTMLElement | null>;
  placement: FloatingPlacement;
  // Extra Tailwind classes appended to the panel root.
  className?: string;
  children: React.ReactNode;
};

// Portalled dropdown / popover shell, cloned from the budget project's
// `FloatingPanel` and pared to what the checklist needs: no active-row
// coordinator (the app has no swipeable sheet rows) and no inline scroll
// lock (the only caller, `SelectPicker`, opens inside the settings
// `Modal`, which already locks body scroll). Owns the float position,
// the escape + outside-click dismissal, and the portal mount. The caller
// renders its own trigger and panel contents.
export function FloatingPanel({
  open,
  onClose,
  triggerRef,
  placement,
  className = "",
  children,
}: Props) {
  const position = useFloatingPosition(triggerRef, open, placement);

  useEscapeKey(open, onClose);

  // When the panel closes after having held keyboard focus (the listbox
  // cursor lives inside the portal), return focus to the trigger so the
  // keyboard journey continues from where it started. Without this,
  // Esc / outside-click leaves focus orphaned on `<body>` and the next
  // Tab restarts from the page's first focusable. We only restore when
  // the active element fell back to `<body>` — a mouse user who never
  // moved focus shouldn't have their cursor yanked back to the trigger.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const trigger = triggerRef.current;
    if (!trigger) return;
    if (document.activeElement === document.body) {
      // `preventScroll` keeps the page where the user left it.
      trigger.focus({ preventScroll: true });
    }
  }, [open, triggerRef]);

  if (!open || !position) return null;

  // `fixed` rides the layout viewport; `absolute` rides the document so
  // the panel scrolls with the page.
  const positionClass =
    placement.coordinateSpace === "viewport" ? "fixed" : "absolute";

  // When the hook flips the panel to "above" (not enough room below),
  // `position.top` is the y-coordinate the panel's BOTTOM edge should
  // sit at. `translateY(-100%)` anchors the bottom there without us
  // needing to know the rendered panel height.
  const flipUp = position.placement === "above";

  // `kind: "max"` panels pin to their computed width; `kind: "min"`
  // panels may grow past `position.width` to fit content, bounded by the
  // room left to the viewport edge.
  const fixedWidth = placement.width.kind === "max";
  const maxWidth = fixedWidth ? position.width : position.maxWidth;

  return createPortal(
    <>
      <DismissBackdrop onDismiss={onClose} />
      <div
        className={`${positionClass} z-[60] flex flex-col overflow-y-auto rounded border border-line bg-surface-2 shadow-lg focus-within:border-accent ${className}`.trim()}
        style={{
          top: position.top,
          left: position.left,
          minWidth: position.width,
          maxWidth,
          maxHeight: position.maxHeight,
          transform: flipUp ? "translateY(-100%)" : undefined,
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
