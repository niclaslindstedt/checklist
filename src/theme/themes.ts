// Theme data: re-exported wholesale from the shared OSS framework. The preset
// vocabulary, the per-preset palettes, the font stacks, the shape presets, the
// `CustomTheme` shape and its seed / coercion helpers used to live here as a
// hand-maintained clone of the budget project's tables. They now have one
// canonical home in `@niclaslindstedt/oss-framework/theme`, which was seeded
// from this very module — so the surface is identical and the migration is a
// straight re-export. This shim keeps the existing `../theme/themes.ts` import
// paths (the settings store, the Appearance tab, the tests) working unchanged.
//
// What stays app-side: the settings *store* that persists the user's choice
// (`src/settings/`), the Appearance *UI* that reads this data
// (`src/ui/settings/tabs/appearance.tsx`), the CSS rules for the non-`custom`
// presets (`src/styles/palettes.css`), and the static `mono` webfont import in
// `src/app/main.tsx`. The framework owns the data and the projection; the app
// owns where the choice lives and how it is rendered.

export * from "@niclaslindstedt/oss-framework/theme";
