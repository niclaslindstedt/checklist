import {
  defineConfig,
  minimal2023Preset as preset,
} from "@vite-pwa/assets-generator/config";

// Drives @vite-pwa/assets-generator. Source: public/favicon.svg.
// Output (committed): public/pwa-{64,192,512}.png,
// public/maskable-icon-512x512.png, and
// public/apple-touch-icon-180x180.png. The manifest in
// `vite.config.ts` references the same icon bytes.
//
// We override `apple` and `maskable` from `minimal2023Preset`: the
// preset's defaults bake a ~30% white border around the SVG, which iOS
// renders as a white frame on the home-screen tile and Android reveals
// under launcher masks. The SVG already paints `#0c0f13` edge-to-edge,
// so:
//   - apple: padding 0, dark background → full-bleed dark tile, iOS
//     just rounds the corners.
//   - maskable: padding 0.1, dark background → the checkmark sits
//     comfortably inside the W3C 80%-diameter safe zone while the dark
//     colour bleeds to all four edges so no Android mask reveals
//     launcher chrome.
//
// This is the icon *badge* colour, deliberately darker than the app's
// `theme_color` / `background_color` (`#1f2933` in `vite.config.ts`):
// the home-screen tile is meant to read near-black alongside the rest
// of a dark home screen, while the app's own surface stays lighter. It
// must stay in lockstep with the `<rect>` fill in `public/favicon.svg`
// and `FAVICON_BG` in `src/ui/glyphs.ts` — a mismatch shows up as a
// ring of the wrong colour in the padded `maskable` output.
const THEME_BACKGROUND = "#0c0f13";

export default defineConfig({
  preset: {
    ...preset,
    apple: {
      ...preset.apple,
      padding: 0,
      resizeOptions: { fit: "contain", background: THEME_BACKGROUND },
    },
    maskable: {
      ...preset.maskable,
      padding: 0.1,
      resizeOptions: { fit: "contain", background: THEME_BACKGROUND },
    },
  },
  images: ["public/favicon.svg"],
});
