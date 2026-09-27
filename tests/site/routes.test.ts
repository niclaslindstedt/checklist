import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ROUTES, renderHead, resolveNoscriptBody } from "../../src/site/routes";
import { DEFAULT_OG_IMAGE } from "../../src/site/siteConfig";

// The build splices these renderers into index.html and the route aliases
// (home/, privacy/ — see vite.config.ts). There is no SEO, by owner decision:
// what is pinned here is that every page asks not to be indexed, and that the
// title, description and share card a link preview reads are there.

describe("noindex", () => {
  it("index.html, which every route alias is built from, carries it", () => {
    const html = readFileSync(
      fileURLToPath(new URL("../../index.html", import.meta.url)),
      "utf8",
    );
    expect(html).toContain('<meta name="robots" content="noindex" />');
  });
});

describe("per-route head", () => {
  for (const route of ROUTES) {
    describe(route.path, () => {
      const head = renderHead(route);

      it("has a title and a description", () => {
        expect(head).toContain("<title>");
        expect(head).toContain('<meta name="description"');
      });

      it("references an og:image that resolves to a shipped asset", () => {
        expect(head).toContain("og:image");
        const asset = fileURLToPath(
          new URL(`../../public${DEFAULT_OG_IMAGE}`, new URL(import.meta.url)),
        );
        expect(existsSync(asset)).toBe(true);
      });
    });
  }
});

describe("noscript fallback", () => {
  for (const route of ROUTES) {
    it(`${route.path} has an <h1> and ≥ 20 words of prose`, () => {
      const body = resolveNoscriptBody(route);
      expect(body).toMatch(/<h1[^>]*>[^<]+<\/h1>/);
      const words = body
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter(Boolean);
      expect(words.length).toBeGreaterThanOrEqual(20);
    });
  }
});
