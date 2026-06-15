---
name: tune-pwa-icons
description: "Use when the home-screen / launcher / browser-tab icon looks wrong on a real device — too small, off-center, transparent, clipped by iOS rounding, or eaten by an Android mask — or when adding checklist's PWA icons for the first time. Walks an edit / rebuild / inspect loop that uses the Read tool to look at the PNGs after every change, scored against Apple Human Interface Guidelines and the W3C maskable-icon spec. checklist manages its manifest and icons by hand (the manifest is inline in `vite.config.ts`; icon PNGs live in `public/`) — there is no icon-generation pipeline. Manual playbook — not part of the `maintenance` umbrella."
---

# Tuning the PWA icon set

checklist manages its PWA manifest and icons **by hand**. There is no
icon-generation pipeline: no `@vite-pwa/assets-generator`, no
`pwa-assets.config.ts`, no `make icons` target. The two sources of
truth are:

- **The manifest**, declared inline in `vite.config.ts` under
  `VitePWA({ manifest: { ... } })`. Today it sets `name`, `short_name`,
  `description`, `theme_color` (`#1f2933`), `background_color`
  (`#ffffff`), `display: "standalone"`, and `start_url: "."`. It does
  **not** yet declare an `icons` array.
- **The icon image files**, which belong in `public/`. Vite copies
  everything in `public/` verbatim into `dist/` at build time, and
  `vite-plugin-pwa` emits the resolved `dist/manifest.webmanifest`.
  Right now `public/` holds only `CNAME` — there are **no icon files
  yet**.

So "add the icons" is two coordinated edits: drop PNGs into `public/`,
and reference them from the manifest's `icons` array in
`vite.config.ts`. The cost of getting this wrong is fixed at deploy
time (the artwork ships once with the build and lands on user home
screens), so the skill exists to make "perfect" a few minutes of
iteration instead of guesswork.

Because the rasterised PNGs are authored by hand (or with whatever
external tool you like — a design app, an SVG-to-PNG one-off), the
browser-vs-rasterizer quirks an automated generator hides become your
responsibility:

- iOS paints transparent regions white on the home screen, which looks
  like a broken icon. The apple-touch / `purpose: "any"` icon needs an
  **opaque** background.
- An Android maskable icon is composited under an OS-chosen shape
  (circle, squircle, teardrop, …); content outside the safe zone gets
  clipped.

## When to invoke

Invoke this skill whenever the home-screen / launcher / browser-tab
icon looks wrong on a real device:

- Too small relative to surrounding icons (the canonical "tiny postage
  stamp on a white square" failure mode).
- Off-centre vertically or horizontally.
- Transparent / white background on iOS while the rest of the app
  brand expects the dark `theme_color`.
- Glyph clipped by iOS's rounded corners (~22.5% radius) because it
  extends to the bleeds.
- Maskable PNG looks fine in a square but loses critical content under
  an Android circle / squircle / teardrop mask.

Also invoke when:

- Adding checklist's icons for the first time (the manifest currently
  declares none).
- Adding or removing an icon size from the manifest `icons` array.
- Restyling the artwork (new colour, new glyph, new background).

Do **not** invoke for unrelated visual work (in-app DOM/CSS — that's
the `design` skill; the social-preview / Open Graph image, which is a
different asset).

## Pipeline

```
public/<icon>.png            (hand-authored, e.g. an SVG-to-PNG export)
   │
   ├─ public/pwa-192x192.png            ← manifest icon, purpose "any"
   ├─ public/pwa-512x512.png            ← manifest icon, purpose "any" (large)
   ├─ public/maskable-512x512.png       ← manifest icon, purpose "maskable"
   ├─ public/apple-touch-icon-180x180.png  ← <link rel="apple-touch-icon"> in index.html
   └─ public/favicon.ico (or favicon.svg)  ← browser tab / legacy
   │
   ▼ make build   (vite build → vite-plugin-pwa)
   │
   ├─► dist/<icon>.png                  ← files copied verbatim from public/
   └─► dist/manifest.webmanifest        ← icons array resolved from vite.config.ts
```

The manifest icons are referenced from the inline `manifest` object in
`vite.config.ts`. There is no generator config to edit and no drift
guard to satisfy — the icons array and the files in `public/` are the
whole story.

## Adding icons to checklist (first-time setup)

The manifest currently has **no** `icons` array and `public/` has
**no** icon files. To wire icons up:

1. **Author the PNGs** at the recommended sizes and drop them in
   `public/`. At minimum:
   - `public/pwa-192x192.png` and `public/pwa-512x512.png`
     (`purpose: "any"`).
   - `public/maskable-512x512.png` (`purpose: "maskable"`, with the
     safe-zone rules below).
   - `public/apple-touch-icon-180x180.png` for iOS home-screen.
   - A favicon (`public/favicon.svg` used directly by browsers, or
     `public/favicon.ico` for legacy).

2. **Add the `icons` array** to the manifest in `vite.config.ts`,
   alongside the existing `theme_color` / `background_color` keys:

   ```ts
   VitePWA({
     registerType: "autoUpdate",
     manifest: {
       name: "checklist",
       short_name: "checklist",
       // …existing keys…
       icons: [
         {
           src: "pwa-192x192.png",
           sizes: "192x192",
           type: "image/png",
           purpose: "any",
         },
         {
           src: "pwa-512x512.png",
           sizes: "512x512",
           type: "image/png",
           purpose: "any",
         },
         {
           src: "maskable-512x512.png",
           sizes: "512x512",
           type: "image/png",
           purpose: "maskable",
         },
       ],
     },
   });
   ```

   `src` is resolved relative to the manifest, which lives at the site
   root, so a bare filename matches the file copied out of `public/`.
   Keep `purpose: "any"` and `purpose: "maskable"` as **separate**
   entries (see the maskable section).

3. **Reference the apple-touch icon and favicon from `index.html`.**
   `vite-plugin-pwa` writes the manifest and registers the service
   worker, but the `apple-touch-icon` and `icon` `<link>` tags are
   plain HTML the plugin does not inject for you:

   ```html
   <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
   <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
   ```

4. **Rebuild and verify** (see the loop and Verification below).

## The iteration loop

The Read tool renders PNGs inline, which is the whole reason this
skill is fast: you can see every iteration without leaving the
session. The loop is short and is meant to be repeated.

1. **Read the current PNGs first.** Look at the apple-touch and
   maskable outputs before you change anything — the "wrong" you're
   fixing might be subtler than expected, or already fine on one of the
   two paths.

   ```
   Read public/apple-touch-icon-180x180.png
   Read public/maskable-512x512.png
   Read public/pwa-192x192.png
   ```

2. **Edit the artwork.** Re-export the PNG(s) into `public/` (or edit
   the source SVG and re-export). Make one targeted change at a time
   (canvas fill, glyph size, glyph position); a change that touches
   several things at once makes it hard to diagnose which one regressed
   something.

3. **Re-read the outputs.** Inspect each one against the quality
   criteria in this skill. Compare apple-touch and maskable side by
   side — if they share source artwork, a change that improves one will
   move the other.

4. **Adjust and repeat.** Usually 2–4 iterations from a clean starting
   template is enough. If you're past 6 iterations on the same artwork,
   the design probably wants restructuring (simplify the glyph, drop a
   problematic detail at small sizes) rather than another nudge.

5. **Rebuild and check the manifest** (see Verification). The build is
   the only step that proves the manifest references resolve and the
   files copy through.

## Apple touch icon — what good looks like

Apple's [Human Interface Guidelines for app icons][hig-app-icons] plus
the legacy `apple-touch-icon` web rules: iOS uses the PNG you provide
at 180×180 verbatim for home-screen install, rounds the corners
(~22.5% radius "squircle"), and paints **no** background behind alpha.
That gives you these rules:

[hig-app-icons]: https://developer.apple.com/design/human-interface-guidelines/app-icons

| Rule                                                                                  | Why                                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Opaque, full-bleed background.** Fill the canvas edge-to-edge with a solid colour.  | iOS paints transparent regions white. checklist's dark `theme_color` (`#1f2933`) needs an explicit background fill or the icon looks like a broken tile.                |
| **Foreground fills 60–80% of the canvas.** Centered.                                  | Below 60% reads as a postage stamp; above 80% gets nibbled by the corner rounding. The surrounding icons on a stock home screen sit in this band.                       |
| **No drop shadows, gloss, or system chrome.** iOS adds rounded corners; that's all.   | Pre-iOS-7 advice (round corners yourself, add gloss) is now wrong — modern iOS double-rounds and double-glosses if you do.                                              |
| **No transparency in the foreground glyph.** Use solid fills, not strokes-on-nothing. | iOS antialiasing on the rounded mask makes semi-transparent edges look fuzzy at common scales.                                                                          |
| **Avoid text other than a single logo glyph or wordmark.**                            | Body text becomes unreadable at the 60×60 scale iOS shows in Spotlight and notifications.                                                                               |

Colour coherence: the icon's opaque background should match the
manifest `theme_color` (`#1f2933`) so the install transition (browser
tab → home-screen tile → splash screen, which `vite-plugin-pwa`
derives from `background_color` `#ffffff`) stays visually continuous.
If a future redesign retones the app, retone the icon background in the
same change.

If you author from an SVG before exporting, a workable starting point
for the apple-touch / `purpose: "any"` icon is a full-canvas opaque
rect under a single centred glyph:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#1f2933" />
  <text
    x="32"
    y="48"
    text-anchor="middle"
    font-family="ui-sans-serif, system-ui, sans-serif"
    font-weight="700"
    font-size="48"
    fill="#ffffff"
  >✓</text>
</svg>
```

Notes on this template:

- `y="48"` is the **baseline**, not the centre. For a ~48-unit glyph
  on a 64-unit canvas, the baseline that visually centres a cap-height
  mark sits at roughly `32 + 0.35 × 48 ≈ 48`. If your SVG-to-PNG tool
  ignores `dominant-baseline`, calibrate `y` empirically from the
  exported PNG over one or two cycles.
- Keep the glyph in the 60–80% band: too large kisses the iOS
  rounded-corner radius, too small reads as a postage stamp.
- The colours match checklist's `theme_color` / `background_color`;
  retone both literals if the app's palette moves.

## Maskable icon — what good looks like

Android (and Chromium on every OS) supports manifest icons declared
with `"purpose": "maskable"` per the
[W3C maskable icon spec][maskable-spec]. The launcher composites the
icon under a shape the OEM / theme picks at runtime (circle, squircle,
teardrop, rounded square, …), so the icon must survive **any** of
those masks.

[maskable-spec]: https://w3c.github.io/manifest/#icon-masks

| Rule                                                                                                                | Why                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Safe zone = centered circle of radius 40% of canvas** (80% diameter).                                             | Every standard Android adaptive-icon mask leaves this zone untouched. Critical content must live entirely inside it.                      |
| **Background bleeds to the edges.**                                                                                 | The OS may pad inward by up to 20%. A square that doesn't reach the edges shows an unintended ring of launcher background around it.       |
| **One PNG per declared purpose.** `purpose: "any"` and `purpose: "maskable"` are different icons even at same size. | A `purpose: "any maskable"` shared icon either has to be ugly when uncropped (too much background) or risks corner clipping when cropped. |
| **Don't ship rounded corners in the source.** The OS mask is the rounding.                                          | Doubled rounding looks like a smaller icon inside the icon.                                                                               |

Reuse the same edge-to-edge opaque background as the apple-touch icon,
and pull the glyph in so it fits inside the 40%-radius safe zone. The
maskable file is a **separate** PNG (`maskable-512x512.png`) referenced
by a separate `icons` entry — don't try to share one file across both
purposes.

When adding visual content that needs to survive masking, draw the
inner safe-zone circle on a scratch copy of the source SVG and verify
each glyph centroid sits inside it before exporting:

```svg
<!-- Drop this temporarily into the source SVG to visualise the
     maskable safe zone. Remove before exporting the real PNG. -->
<circle cx="32" cy="32" r="25.6" fill="none"
        stroke="#ff00ff" stroke-width="0.5" />
```

## Common pitfalls

In roughly descending order of likelihood:

1. **Transparent background on the apple-touch icon.** iOS paints
   white. Always export with a full-canvas opaque fill matching
   `theme_color`.
2. **Glyph centred by `dominant-baseline` that the exporter ignored.**
   Many SVG-to-PNG tools drop `dominant-baseline="central"`, landing
   the glyph in the top half. Use an explicit baseline `y` calibrated
   against the exported PNG.
3. **Maskable content outside the 80%-diameter safe zone.** Fine in a
   square preview, clipped under an Android circle. Check against the
   safe-zone circle before exporting.
4. **Sharing one PNG across `purpose: "any"` and `"maskable"`.** Use
   two files and two `icons` entries; a shared icon compromises both.
5. **Editing the manifest but forgetting the file (or vice versa).**
   A manifest `src` with no matching file in `public/` produces a 404
   on install; a file in `public/` with no manifest entry is dead
   weight. They must move together.
6. **Forgetting the `apple-touch-icon` `<link>` in `index.html`.**
   `vite-plugin-pwa` writes the manifest and registers the SW, but the
   apple-touch and favicon `<link>` tags are plain HTML you add by
   hand.
7. **Not rebuilding before judging.** The PNGs in `public/` are the
   source, but only `make build` proves the manifest references resolve
   and the files land in `dist/`.

## Could a generator be added later?

This skill assumes hand-authored icons because that is checklist's
current reality. If the icon set grows or the artwork starts churning,
a maintainer **could** later adopt `@vite-pwa/assets-generator` with a
`pwa-assets.config.ts` to derive every size from one source SVG. That
is **not** set up today — there is no generator dependency, no config
file, and no `make icons` target. Treat it as an optional future
direction, not a step in this skill.

## Quality criteria checklist

Before declaring the icon set "done", walk this list against the
current files:

- [ ] `apple-touch-icon-180x180.png` has an opaque background that
      matches the manifest `theme_color` (`#1f2933`).
- [ ] The foreground glyph in apple-touch sits between roughly
      `(15%, 15%)` and `(85%, 85%)` of the canvas — visible margin on
      all four sides, no kissing the edges.
- [ ] The glyph is centred to within a few percent — eyeball it
      against a horizontal and vertical halfway line.
- [ ] `maskable-512x512.png` keeps every foreground pixel within the
      inner 80%-diameter circle, and its background bleeds to all four
      edges.
- [ ] `pwa-192x192.png` is still legible at thumbnail size — the glyph
      is recognisable, not a blob.
- [ ] The favicon resolves (an `<link rel="icon">` in `index.html`
      points at a file that exists in `public/`).
- [ ] `make build` succeeds and `dist/manifest.webmanifest` lists every
      icon, with the matching PNGs present in `dist/`.

## Verification

1. The PNGs in `public/` match the intended design (read them inline).
2. `make build` succeeds.
3. Inspect the built manifest and confirm the icons resolved:

   ```sh
   cat dist/manifest.webmanifest      # icons array present, purposes correct
   ls dist/*.png                      # the referenced PNGs copied through
   ```

   Every `src` in the manifest's `icons` array must have a matching
   file in `dist/`.
4. `make lint`, `make test`, `make build` are all green.
5. The quality-criteria checklist above clears.
6. (Manual) on a real iPhone, the home-screen tile of the deployed
   build (checklist.niclaslindstedt.se) looks correct — dark
   background, prominent centred glyph, no kissing of the rounded
   corners. Apple's simulator and Chromium DevTools don't always
   replicate the rounding visually; the real device is ground truth.
7. Whether an icon/manifest change needs a changelog entry depends on
   user visibility — adding the first home-screen icon is a
   user-visible `Added`; a pixel nudge to existing artwork usually is
   not. Run the `write-changeset` skill to decide between a
   `.changes/unreleased/` fragment and `no-changelog`.

## Skill self-improvement

After a run:

1. If a new exporter quirk bit the run (a tool that drops `font-family`
   or `dominant-baseline`, a colour-profile shift on export), add it to
   **Common pitfalls** with the smallest reproducer you have.
2. If the chosen glyph / size / baseline calibration moved, update the
   template in **Apple touch icon — what good looks like** so the next
   contributor starts from current truth.
3. If a new icon size or purpose was added to the manifest, extend the
   **Pipeline** diagram and add a row to the **Quality criteria
   checklist**.
4. If the manifest `theme_color` / `background_color` were retoned,
   update both colour literals in the template and call out the link so
   retones travel atomically with the artwork.
5. If a maintainer ever does adopt a generator, rewrite the
   hand-authoring sections around it and update the **Could a generator
   be added later?** note.
6. Commit the skill edit alongside the icon/manifest edit so the next
   loop starts from current truth.
