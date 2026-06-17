import { describe, expect, it } from "vitest";

import {
  FEATURE_DOCS,
  parseFeatureDoc,
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
