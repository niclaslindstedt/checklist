import { describe, expect, it } from "vitest";

import {
  DEFAULT_NAMESPACE_GLYPH,
  GLYPH_PATHS,
  NAMESPACE_GLYPH_NAMES,
  isGlyphName,
  namespaceGlyphDataUri,
  namespaceGlyphSvg,
} from "../../src/ui/glyphs.ts";

describe("namespace glyphs", () => {
  it("offers every glyph it can draw, and no more", () => {
    expect(NAMESPACE_GLYPH_NAMES.length).toBeGreaterThan(0);
    for (const name of NAMESPACE_GLYPH_NAMES) {
      expect(GLYPH_PATHS[name]).toBeTruthy();
    }
  });

  it("recognises known glyph names and rejects unknown / missing ones", () => {
    expect(isGlyphName("home")).toBe(true);
    expect(isGlyphName("not-a-glyph")).toBe(false);
    expect(isGlyphName(undefined)).toBe(false);
  });

  it("embeds the chosen colour in the rendered SVG", () => {
    const svg = namespaceGlyphSvg("home", "#abcdef");
    expect(svg).toContain('stroke="#abcdef"');
    expect(svg).toContain(GLYPH_PATHS.home);
  });

  it("falls back to the default glyph for an unknown name", () => {
    const svg = namespaceGlyphSvg("ghost", "#000000");
    expect(svg).toContain(GLYPH_PATHS[DEFAULT_NAMESPACE_GLYPH]!);
  });

  it("encodes the SVG as an image/svg+xml data URI", () => {
    const uri = namespaceGlyphDataUri("home", "#abcdef");
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(uri)).toContain('stroke="#abcdef"');
  });
});
