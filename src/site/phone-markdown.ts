// The markdown What's new renders — CHANGELOG.md and the feature docs its
// Learn more links open — as the phone app carries it: without a word about
// the storage that build does not offer. That is Dropbox (`DROPBOX_BUILT` in
// `src/build-env.ts`), Google Drive (gone from every build, but still in the
// release history), and the local folder (`LOCAL_FOLDER_BUILT`).
// `vite.config.ts` applies it at build time as each `.md?raw` module loads, so
// the text never reaches that bundle; the website and the desktop app keep the
// markdown whole, and CHANGELOG.md and the fragments are never rewritten.
//
// BUILD-TIME ONLY: the app never imports this module.

import { withoutSourceLinks } from "./source-links.ts";

/** What the phone app does not offer, as its markdown may name it. */
export const NOT_ON_PHONE = /dropbox|google drive|local[ -]folder/i;

/** A markdown heading's level (`## …` is 2), or 0 for any other line. */
function headingLevel(line: string): number {
  const m = /^(#{1,6})\s/.exec(line);
  return m ? m[1]!.length : 0;
}

function indent(line: string): number {
  return /^\s*/.exec(line)![0].length;
}

/**
 * Markdown as the phone app shows it. Three cuts, in order:
 *
 * - a section whose heading names what the phone lacks goes whole, down to
 *   the next heading of the same or a higher level;
 * - a list item (with its continuation lines and nested items, across blank
 *   lines while they stay indented under it) or a paragraph that names it goes
 *   whole;
 * - a heading the first two cuts left with nothing under it goes too, so a
 *   release keeps no empty "Fixed" (one that was empty already, like
 *   "Unreleased" between releases, stays).
 *
 * So a doc keeps those backends in their own paragraphs, list items or
 * sections, and says everything else in words that are true without them.
 * Pure, so it is testable on any text.
 */
export function phoneMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  // Indices into `lines`, so a heading can be judged before and after.
  const kept: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const level = headingLevel(line);
    if (level > 0) {
      if (NOT_ON_PHONE.test(line)) {
        let end = i + 1;
        while (end < lines.length) {
          const l = headingLevel(lines[end]!);
          if (l > 0 && l <= level) break;
          end++;
        }
        i = end - 1;
      } else {
        kept.push(i);
      }
      continue;
    }
    if (line.trim() === "") {
      kept.push(i);
      continue;
    }
    const end = blockEnd(lines, i);
    if (!lines.slice(i, end).some((l) => NOT_ON_PHONE.test(l))) {
      for (let k = i; k < end; k++) kept.push(k);
    }
    i = end - 1;
  }
  const all = lines.map((_, k) => k);
  return kept
    .filter(
      (k, at) =>
        headingLevel(lines[k]!) === 0 ||
        hasText(lines, kept, at) ||
        !hasText(lines, all, k),
    )
    .map((k) => lines[k]!)
    .join("\n");
}

/**
 * Where the block starting at `start` ends (exclusive). A list item runs until
 * a heading or a line indented no deeper than its marker, through blank lines
 * when what follows them is still indented under it (a bullet the release
 * collator wrote from a fragment of several paragraphs); trailing blank lines
 * are left out. A paragraph runs until a blank line, a heading or a list item.
 */
function blockEnd(lines: string[], start: number): number {
  const item = /^(\s*)[-*+]\s/.exec(lines[start]!);
  let end = start + 1;
  if (!item) {
    while (end < lines.length) {
      const next = lines[end]!;
      if (next.trim() === "" || headingLevel(next) > 0) break;
      if (/^\s*[-*+]\s/.test(next)) break;
      end++;
    }
    return end;
  }
  const marker = item[1]!.length;
  let last = start;
  while (end < lines.length) {
    const next = lines[end]!;
    if (next.trim() === "") {
      end++;
      continue;
    }
    if (headingLevel(next) > 0 || indent(next) <= marker) break;
    last = end;
    end++;
  }
  return last + 1;
}

/** Whether the heading at `order[at]` has text under it before the next
 *  heading of the same or a higher level — a deeper heading with text of its
 *  own counts. */
function hasText(lines: string[], order: number[], at: number): boolean {
  const level = headingLevel(lines[order[at]!]!);
  for (let j = at + 1; j < order.length; j++) {
    const line = lines[order[j]!]!;
    const l = headingLevel(line);
    if (l > 0 && l <= level) return false;
    if (l === 0 && line.trim() !== "") return true;
  }
  return false;
}

/**
 * The markdown an app build inlines: without its source links in the phone
 * and desktop apps (`withoutSourceLinks`), and in the phone app without the
 * storage it lacks too. The website inlines the file as it is and never runs
 * this. The one pipeline `vite.config.ts` and the tests share.
 */
export function appMarkdown(markdown: string, isNative: boolean): string {
  const unlinked = withoutSourceLinks(markdown);
  return isNative ? phoneMarkdown(unlinked) : unlinked;
}
