import { describe, expect, it } from "vitest";

import changelogMarkdown from "../../../CHANGELOG.md?raw";
import { FEATURE_DOCS } from "../../../src/ui/changelog/feature-docs.ts";

// Guards the "one doc per feature, one feature per doc" rule (AGENTS.md →
// "Feature docs and Learn more"): every changelog `[Learn more]` link
// resolves to a bundled doc, every bundled doc is reached by exactly one
// changelog bullet, and no doc cross-links a sibling that no longer
// exists. Without this, deleting a doc or pointing two bullets at the same
// slug slips through silently.
//
// CHANGELOG.md is generated from the changeset fragments at release time
// (the `## [Unreleased]` stub stays empty between releases), so a doc
// shipped in the same PR as its feature isn't linked from CHANGELOG.md yet
// — its link lives in the pending fragment's `doc:` front-matter, which the
// collator turns into the `[Learn more]` bullet on release. The "linked"
// set is therefore CHANGELOG links **plus** pending-fragment `doc:` slugs;
// after release the fragment is consumed and the link moves into
// CHANGELOG, so a doc is still linked exactly once across the two sources.

const FEATURE_LINK_RE = /feature:([a-z0-9-]+)/g;

function slugsIn(text: string): string[] {
  return [...text.matchAll(FEATURE_LINK_RE)].map((m) => m[1]!);
}

// Pending changeset fragments, inlined the same way `feature-docs.ts`
// inlines the docs themselves (the test runs under Vite, so no fs access).
const fragmentRaws = import.meta.glob<string>(
  "../../../.changes/unreleased/*.md",
  { query: "?raw", import: "default", eager: true },
);

/** The `doc:` slug declared by each pending fragment that carries one. */
function fragmentDocSlugs(): string[] {
  const out: string[] = [];
  for (const raw of Object.values(fragmentRaws)) {
    const m = /^doc:\s*([a-z0-9-]+)\s*$/m.exec(raw);
    if (m) out.push(m[1]!);
  }
  return out;
}

describe("feature-doc links", () => {
  it("every changelog / fragment Learn-more link resolves to a bundled doc", () => {
    for (const slug of slugsIn(changelogMarkdown)) {
      expect(
        FEATURE_DOCS[slug],
        `CHANGELOG links feature:${slug} but docs/features/${slug}.md is missing`,
      ).toBeDefined();
    }
    for (const slug of fragmentDocSlugs()) {
      expect(
        FEATURE_DOCS[slug],
        `a fragment declares doc:${slug} but docs/features/${slug}.md is missing`,
      ).toBeDefined();
    }
  });

  it("links each bundled doc from exactly one changelog bullet or pending fragment", () => {
    const counts = new Map<string, number>();
    const bump = (slug: string) =>
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    for (const slug of slugsIn(changelogMarkdown)) bump(slug);
    for (const slug of fragmentDocSlugs()) bump(slug);

    // No doc is shared across bullets — counting CHANGELOG and the pending
    // fragments together, since a freshly-shipped doc is linked from its
    // fragment until release moves the link into CHANGELOG.
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
        `docs/features/${slug}.md is never linked from CHANGELOG or a pending fragment — delete it or link it`,
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
