// The long-form feature docs under `docs/features/*.md`, inlined by Vite
// at build time so the changelog modal can open one in place when a
// "Learn more" link is followed. The app is a static bundle with no
// backend, so the docs can't be fetched at runtime — `import.meta.glob`
// with `?raw` pulls every doc into the bundle here, mirroring how
// `data.ts` inlines `CHANGELOG.md`.
//
// A changelog bullet links to a doc with `[Learn more](feature:<slug>)`,
// where `<slug>` is the doc's filename stem; the collator
// (`scripts/release/collate-changelog.mjs`) emits that link from a
// fragment's `doc:` front-matter. Feature docs are English-only, like the
// rendered CHANGELOG body — they are reference prose, not chrome.

export interface FeatureDoc {
  // Filename stem (`docs/features/<slug>.md`) — also the `feature:<slug>`
  // link target authored in changelog fragments / CHANGELOG.md.
  slug: string;
  // First `# ` heading in the file, used as the modal's doc-view title.
  title: string;
  // Everything after that heading — the markdown the modal renders.
  body: string;
}

// Split a doc into its title (the leading `# ` heading) and body. The
// heading is consumed so the modal renders it once in the header chrome
// rather than repeating it atop the scrolling body. Falls back to the
// slug when a doc has no leading heading. Pure and DOM-free, so the
// parsing is unit-testable without the glob.
export function parseFeatureDoc(slug: string, md: string): FeatureDoc {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let start = 0;
  while (start < lines.length && lines[start]!.trim() === "") start++;
  let title = slug;
  const h1 = /^#\s+(.*)$/.exec(lines[start] ?? "");
  if (h1) {
    title = h1[1]!.trim();
    start++;
  }
  return { slug, title, body: lines.slice(start).join("\n").trim() };
}

// Eagerly inline every `docs/features/*.md` as a raw string. The path is
// relative to this file: `src/ui/changelog/` → repo root is three levels
// up, then `docs/features/`.
//
// Except the achievements page in the phone and desktop apps, which carry
// no achievements (`ACHIEVEMENTS_BUILT` in `src/build-env.ts`): it describes
// a feature those builds don't have, so its glob is the one in the dropped
// branch and its text is not in those bundles at all. The condition tests
// the raw defines, which are literals before the bundler decides what to
// import. The released bullet that links it stays — it is the record of
// what shipped — and loses its Learn more (`withoutMissingFeatureLinks`).
const rawDocs =
  __NATIVE__ || __SHELL_BUILD__
    ? import.meta.glob<string>(
        [
          "../../../docs/features/*.md",
          "!../../../docs/features/achievements.md",
        ],
        { query: "?raw", import: "default", eager: true },
      )
    : import.meta.glob<string>("../../../docs/features/*.md", {
        query: "?raw",
        import: "default",
        eager: true,
      });

function buildFeatureDocs(): Record<string, FeatureDoc> {
  const out: Record<string, FeatureDoc> = {};
  for (const [path, md] of Object.entries(rawDocs)) {
    const slug = path.replace(/^.*\/([^/]+)\.md$/, "$1");
    out[slug] = parseFeatureDoc(slug, md);
  }
  return out;
}

export const FEATURE_DOCS: Record<string, FeatureDoc> = buildFeatureDocs();

// Drop every `[label](feature:<slug>)` link whose doc this build doesn't
// carry, with the space before it, so a changelog bullet never offers a
// "Learn more" that opens nothing (the achievements page in the phone and
// desktop apps). Pure, so it is testable against any doc set.
export function withoutMissingFeatureLinks(
  text: string,
  docs: Record<string, unknown> = FEATURE_DOCS,
): string {
  return text.replace(
    /\s*\[[^\]]+\]\(feature:([a-z0-9-]+)\)/g,
    (link, slug: string) => (slug in docs ? link : ""),
  );
}
