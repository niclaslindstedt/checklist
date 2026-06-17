// Tiny inline SVG icon set. Budget pulls icons from `lucide-react`; the
// checklist needs only a couple, so we inline them rather than add a
// dependency. Each takes a `className` so callers control size and
// colour through Tailwind utilities (icons paint with `currentColor`).
//
// This is the barrel: the glyphs live in themed sibling files under
// `icons/` (status, nav, action) so a new glyph lands in a small family
// file rather than this shared hub. Existing call sites import from
// `./icons.tsx`; they keep working through these re-exports.
//
// Pure re-export module — no component is defined here, so there is no
// Fast Refresh boundary to protect and the `export *` form (which lets a
// new glyph land with no edit to this file) can't be verified by the rule.
/* eslint-disable react-refresh/only-export-components */

export * from "./icons/status.tsx";
export * from "./icons/nav.tsx";
export * from "./icons/action.tsx";
