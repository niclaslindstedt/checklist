import type { CSSProperties } from "react";

// Pins a `position: fixed` full-screen overlay over the same band as the
// app shell. Vertically it tracks the *visual* viewport
// (`--app-top`/`--app-height`, mirrored live by `useViewportHeight`) so the
// modal backdrop and side-menu drawer follow the keyboard with `#app`;
// horizontally it stays on the *layout* viewport (`left: 0; width: 100%`),
// matching `#app` so no layer can be pushed a sub-pixel past the viewport
// edge and turn into a sideways pan on iOS. The fallbacks reproduce a plain
// `inset: 0` before the script runs and without `window.visualViewport`.
export const APP_VIEWPORT_RECT: CSSProperties = {
  top: "var(--app-top, 0px)",
  left: 0,
  width: "100%",
  height: "var(--app-height, 100svh)",
};
