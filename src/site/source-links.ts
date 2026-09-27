// What the phone and desktop apps may not carry: any link back to where the
// app comes from — the source repository, its issues and releases — or the
// website's own address. All of it spells the owner's handle, so that one
// string is the mark: `vite.config.ts` strips it from the markdown the app
// inlines (CHANGELOG.md, the feature docs) in those builds, and
// `scripts/website-only.mjs` refuses a bundle that still carries it. The
// website keeps everything (`IS_WEBSITE` in `src/build-env.ts`).

export const SOURCE_MARK = "niclaslindstedt";

const MD_LINK = /\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g;

/**
 * The markdown with every link to a marked URL reduced to its label, then
 * every line that still carries the mark (a bare address, or a label that
 * spells it) dropped whole. A changelog bullet is one line, so a bullet about
 * the website's address leaves with its line. Pure, so it is testable.
 */
export function withoutSourceLinks(markdown: string): string {
  return markdown
    .replace(MD_LINK, (link, label: string, href: string) =>
      href.includes(SOURCE_MARK) ? label : link,
    )
    .split("\n")
    .filter((line) => !line.includes(SOURCE_MARK))
    .join("\n");
}
