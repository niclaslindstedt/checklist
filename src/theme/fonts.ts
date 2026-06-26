// On-demand webfont loading: re-exported from the shared framework. The lazy
// loaders for the non-default families (Inter / Source Serif 4 / OpenDyslexic)
// live once in `@niclaslindstedt/oss-framework/theme`; their dynamic
// `@fontsource/*` CSS imports resolve in this app's bundle at build time, and
// the matching packages are app dependencies. The default `mono` family
// (JetBrains Mono) is still imported statically in `src/app/main.tsx` so it
// precaches for offline first paint. This shim keeps the existing
// `../theme/fonts.ts` import paths working unchanged.

export {
  loadFontFamily,
  loadAllFontFamilies,
} from "@niclaslindstedt/oss-framework/theme";
