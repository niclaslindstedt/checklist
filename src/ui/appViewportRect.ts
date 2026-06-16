import type { CSSProperties } from "react";

// Pins a `position: fixed` full-screen overlay to the *visual* viewport
// rather than the layout viewport. `useViewportHeight` mirrors the live
// visual-viewport rect into these CSS variables (and `#app` already rides
// the same rect); the fallbacks reproduce a plain `inset: 0` before the
// script runs and on browsers without `window.visualViewport`. Shared by
// the modal backdrop (`Modal`) and the side-menu drawer so every layer
// stays aligned with what's actually on screen on iOS, where a bare
// `inset: 0` drifts when the layout viewport diverges from the visual one.
export const APP_VIEWPORT_RECT: CSSProperties = {
  top: "var(--app-top, 0px)",
  left: "var(--app-left, 0px)",
  width: "var(--app-width, 100%)",
  height: "var(--app-height, 100svh)",
};
