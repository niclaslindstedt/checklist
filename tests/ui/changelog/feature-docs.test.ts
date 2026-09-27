import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FEATURE_DOCS,
  parseFeatureDoc,
  withoutMissingFeatureLinks,
} from "../../../src/ui/changelog/feature-docs.ts";

describe("parseFeatureDoc", () => {
  it("splits the leading heading off as the title and keeps the body", () => {
    const doc = parseFeatureDoc(
      "namespaces",
      "# Namespaces\n\nKeep separate checklists in named groups.\n",
    );
    expect(doc.slug).toBe("namespaces");
    expect(doc.title).toBe("Namespaces");
    expect(doc.body).toBe("Keep separate checklists in named groups.");
  });

  it("skips blank lines before the heading", () => {
    const doc = parseFeatureDoc("x", "\n\n# Title\nbody");
    expect(doc.title).toBe("Title");
    expect(doc.body).toBe("body");
  });

  it("falls back to the slug when there is no leading heading", () => {
    const doc = parseFeatureDoc("archive", "Some prose without a heading.");
    expect(doc.title).toBe("archive");
    expect(doc.body).toBe("Some prose without a heading.");
  });
});

describe("FEATURE_DOCS", () => {
  it("bundles every docs/features/*.md by slug with a title and body", () => {
    const slugs = Object.keys(FEATURE_DOCS);
    expect(slugs.length).toBeGreaterThan(0);
    for (const [slug, doc] of Object.entries(FEATURE_DOCS)) {
      expect(doc.slug).toBe(slug);
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.body.length).toBeGreaterThan(0);
      // The leading `# ` heading is consumed into `title`, never left at
      // the head of the rendered body.
      expect(doc.body.startsWith("# ")).toBe(false);
    }
  });

  it("includes the checklist core doc the changelog links to", () => {
    expect(FEATURE_DOCS.checklist).toBeDefined();
    expect(FEATURE_DOCS.checklist!.title.length).toBeGreaterThan(0);
  });
});

describe("withoutMissingFeatureLinks", () => {
  const docs = { notes: {} };

  it("keeps a Learn more whose doc the build carries", () => {
    const bullet = "**Notes** — Markdown. [Learn more](feature:notes)";
    expect(withoutMissingFeatureLinks(bullet, docs)).toBe(bullet);
  });

  it("drops a Learn more whose doc the build lacks, and the space before it", () => {
    expect(
      withoutMissingFeatureLinks(
        "**Achievements** — Trophies. [Learn more](feature:achievements)",
        docs,
      ),
    ).toBe("**Achievements** — Trophies.");
  });
});

// The achievements page is the website's alone (`ACHIEVEMENTS_BUILT`): the
// phone and desktop builds carry no achievements, so no page about them.
describe("FEATURE_DOCS per build", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function docsFor(native: boolean, shell: boolean) {
    vi.stubGlobal("__NATIVE__", native);
    vi.stubGlobal("__SHELL_BUILD__", shell);
    vi.resetModules();
    return (await import("../../../src/ui/changelog/feature-docs.ts"))
      .FEATURE_DOCS;
  }

  it("gives the website the achievements page", async () => {
    expect((await docsFor(false, false)).achievements).toBeDefined();
  });

  it("gives the phone and desktop apps every page but that one", async () => {
    for (const [native, shell] of [
      [true, false],
      [false, true],
    ] as const) {
      const docs = await docsFor(native, shell);
      expect(docs.achievements).toBeUndefined();
      expect(docs.notes).toBeDefined();
    }
  });
});
