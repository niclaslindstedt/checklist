import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  HOME_ROUTE,
  PRIVACY_ROUTE,
  ROUTES,
  renderHeadSeo,
  renderLlmsTxt,
  renderRobotsTxt,
  renderSitemap,
  resolveNoscriptBody,
} from "../../src/seo/routes";
import {
  DEFAULT_OG_IMAGE,
  NONCANONICAL_PATHS,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "../../src/seo/siteConfig";

// The build splices these renderers into index.html, privacy/index.html,
// and the discovery files (see vite.config.ts). The assertions below mirror
// the structural SEO invariants from OSS_SPEC §11.3 so a regression in the
// copy or the graph fails here instead of silently shipping.

describe("per-route head SEO", () => {
  for (const route of ROUTES) {
    describe(route.path, () => {
      const head = renderHeadSeo(route);

      it("title is non-empty and ≤ 70 chars (§11.3.2)", () => {
        expect(route.title.length).toBeGreaterThan(0);
        expect(route.title.length).toBeLessThanOrEqual(70);
      });

      it("description is non-empty and ≤ 160 chars (§11.3.2)", () => {
        expect(route.description.length).toBeGreaterThan(0);
        expect(route.description.length).toBeLessThanOrEqual(160);
      });

      it("emits an absolute canonical on the canonical host (§11.3.2)", () => {
        expect(head).toContain(
          `<link rel="canonical" href="${absoluteUrl(route.path)}" />`,
        );
        expect(absoluteUrl(route.path).startsWith(`${SITE_URL}/`)).toBe(true);
      });

      it("references an og:image that resolves to a shipped asset", () => {
        expect(head).toContain("og:image");
        const asset = fileURLToPath(
          new URL(`../../public${DEFAULT_OG_IMAGE}`, new URL(import.meta.url)),
        );
        expect(existsSync(asset)).toBe(true);
      });

      it("every JSON-LD block parses and carries an @type (§11.3.3)", () => {
        const raws = [
          ...head.matchAll(
            /<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g,
          ),
        ]
          .map((m) => m[1])
          .filter((s): s is string => Boolean(s));
        expect(raws.length).toBe(route.jsonLd.length);
        expect(raws.length).toBeGreaterThan(0);
        for (const raw of raws) {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          expect(parsed["@type"]).toBeTruthy();
        }
      });
    });
  }
});

describe("noscript fallback (§11.3.1)", () => {
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

describe("discovery files (§11.3.6)", () => {
  it("sitemap lists every route with a sitemap entry", () => {
    const xml = renderSitemap(ROUTES);
    expect(xml).toContain(absoluteUrl(HOME_ROUTE.path));
    expect(xml).toContain(absoluteUrl(PRIVACY_ROUTE.path));
  });

  it("robots.txt advertises the sitemap and avoids a global Disallow", () => {
    const txt = renderRobotsTxt();
    expect(txt).toMatch(/^Sitemap:\s*https:\/\//m);
    expect(txt).not.toMatch(/^Disallow:\s*\/\s*$/m);
    for (const p of NONCANONICAL_PATHS) {
      expect(txt).toContain(`Disallow: ${p}`);
    }
  });

  it("llms.txt opens with the site-title heading", () => {
    const txt = renderLlmsTxt(ROUTES);
    expect(txt.startsWith(`# ${SITE_NAME}`)).toBe(true);
  });
});
