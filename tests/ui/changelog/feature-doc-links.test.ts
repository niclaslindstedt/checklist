import { describe, expect, it } from "vitest";

import changelogMarkdown from "../../../CHANGELOG.md?raw";
import { FEATURE_DOCS } from "../../../src/ui/changelog/feature-docs.ts";

// Guards the "one doc per feature, one feature per doc" rule (AGENTS.md →
// "Feature docs and Learn more"): every changelog `[Learn more]` link
// resolves to a bundled doc, every bundled doc is reached by exactly one
// changelog bullet, and no doc cross-links a sibling that no longer
// exists. Without this, deleting a doc or pointing two bullets at the same
// slug slips through silently.

const FEATURE_LINK_RE = /feature:([a-z0-9-]+)/g;

function slugsIn(text: string): string[] {
  return [...text.matchAll(FEATURE_LINK_RE)].map((m) => m[1]!);
}

describe("feature-doc links", () => {
  it("every changelog Learn-more link resolves to a bundled doc", () => {
    for (const slug of slugsIn(changelogMarkdown)) {
      expect(
        FEATURE_DOCS[slug],
        `CHANGELOG links feature:${slug} but docs/features/${slug}.md is missing`,
      ).toBeDefined();
    }
  });

  it("links each bundled doc from exactly one changelog bullet", () => {
    const counts = new Map<string, number>();
    for (const slug of slugsIn(changelogMarkdown)) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }

    // No doc is shared across bullets.
    for (const [slug, count] of counts) {
      expect(
        count,
        `feature:${slug} is linked ${count}× — each doc backs exactly one bullet`,
      ).toBe(1);
    }

    // No bundled doc is orphaned (present but never linked).
    for (const slug of Object.keys(FEATURE_DOCS)) {
      expect(
        counts.get(slug),
        `docs/features/${slug}.md is never linked from CHANGELOG — delete it or link it`,
      ).toBe(1);
    }
  });

  it("every cross-link inside a doc points at another bundled doc", () => {
    for (const doc of Object.values(FEATURE_DOCS)) {
      for (const slug of slugsIn(doc.body)) {
        expect(
          FEATURE_DOCS[slug],
          `docs/features/${doc.slug}.md cross-links feature:${slug}, which has no doc`,
        ).toBeDefined();
      }
    }
  });
});
