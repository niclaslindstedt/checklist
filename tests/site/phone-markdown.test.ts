import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { appMarkdown, phoneMarkdown } from "../../src/site/phone-markdown.ts";
import { parseChangelog } from "../../src/ui/changelog/parse.ts";

// The phone app's What's new names no storage it does not offer — Dropbox,
// Google Drive, a local folder — while the website's keeps the whole history.
// The text is cut at build time (`appMarkdown`, which `vite.config.ts` applies
// to every inlined `.md?raw`), never in CHANGELOG.md or the fragments.

const NOT_ON_PHONE = /dropbox|google drive|local[ -]folder/i;

describe("phoneMarkdown", () => {
  it("drops a section whose heading names Dropbox, down to the next peer heading", () => {
    const md = [
      "# Doc",
      "",
      "Intro.",
      "",
      "## Dropbox",
      "",
      "All about it.",
      "",
      "### Details",
      "",
      "More.",
      "",
      "## Templates",
      "",
      "Kept.",
    ].join("\n");
    const out = phoneMarkdown(md);
    expect(out).not.toMatch(/dropbox|All about it|Details|More\./i);
    expect(out).toContain("## Templates");
    expect(out).toContain("Kept.");
  });

  it("drops a list item with its continuation and nested items, and a paragraph", () => {
    const md = [
      "Kept paragraph.",
      "",
      "A paragraph naming",
      "a local folder on its second line.",
      "",
      "- kept item",
      "- an item about Google Drive",
      "  continued here",
      "  - nested under it",
      "- another kept item",
    ].join("\n");
    const out = phoneMarkdown(md);
    expect(out).toContain("Kept paragraph.");
    expect(out).toContain("- kept item");
    expect(out).toContain("- another kept item");
    expect(out).not.toMatch(/second line|continued|nested|drive/i);
  });

  it("drops the later paragraphs of a bullet the collator wrote from a multi-paragraph fragment", () => {
    const md = [
      "### Removed",
      "",
      "- **Google Drive sync** — Gone. This",
      "  device and Dropbox remain.",
      "  ",
      "  If you had Drive connected, your lists stay in your Drive.",
      "- **Kept** — Still here.",
    ].join("\n");
    const out = phoneMarkdown(md);
    expect(out).not.toMatch(/drive/i);
    expect(out).toContain("- **Kept** — Still here.");
  });

  it("drops a heading the cuts left empty, and keeps one that was empty already", () => {
    const md = [
      "## [Unreleased]",
      "",
      "## [1.0.0] - 2026-01-01",
      "",
      "### Fixed",
      "",
      "- A Dropbox fix.",
      "",
      "### Added",
      "",
      "- A feature.",
      "",
      "## [0.9.0] - 2025-12-01",
      "",
      "### Fixed",
      "",
      "- Only about Dropbox.",
    ].join("\n");
    const out = phoneMarkdown(md);
    expect(out).toContain("## [Unreleased]");
    expect(out).toContain("## [1.0.0] - 2026-01-01");
    expect(out).toContain("### Added");
    expect(out).not.toContain("### Fixed");
    expect(out).not.toContain("0.9.0");
  });

  it("leaves markdown that names none of them as it is", () => {
    const md = "# Title\n\nA folder in the side menu.\n\n- item\n";
    expect(phoneMarkdown(md)).toBe(md);
  });
});

// The next release, written by the release's own collator from every waiting
// fragment into a copy of CHANGELOG.md — the file What's new will inline once
// the release lands. Right after a release nothing waits, and the collator
// refuses to write an empty release, so there is no next release to check.
function nextReleaseChangelog(): string | null {
  const waiting = readdirSync(".changes/unreleased").filter((f) =>
    f.endsWith(".md"),
  );
  if (waiting.length === 0) return null;
  const dir = mkdtempSync(join(tmpdir(), "phone-whats-new-"));
  try {
    cpSync(".changes", join(dir, ".changes"), { recursive: true });
    writeFileSync(
      join(dir, "CHANGELOG.md"),
      readFileSync("CHANGELOG.md", "utf8"),
    );
    execFileSync(
      process.execPath,
      [join(process.cwd(), "scripts/release/collate-changelog.mjs"), "99.0.0"],
      { cwd: dir, stdio: "pipe" },
    );
    return readFileSync(join(dir, "CHANGELOG.md"), "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function whatsNewText(md: string): string {
  return parseChangelog(md)
    .flatMap((release) => release.sections.flatMap((s) => s.items))
    .join("\n");
}

describe("What's new in the phone app", () => {
  const released = readFileSync("CHANGELOG.md", "utf8");
  const next = nextReleaseChangelog();
  const changelogs = next === null ? [released] : [released, next];

  it("has history that names what the phone lacks, so the cut is tested", () => {
    expect(released).toMatch(/Dropbox in the desktop app/);
    expect(released).toMatch(/Google Drive sync/);
    if (next !== null) expect(next).toContain("## [99.0.0]");
  });

  it("names none of it, today or after the next release", () => {
    for (const md of changelogs) {
      const phone = appMarkdown(md, true);
      expect(phone).not.toMatch(NOT_ON_PHONE);
      expect(phone).not.toMatch(/\bdrive\b/i);
      expect(whatsNewText(phone)).not.toMatch(NOT_ON_PHONE);
      // No release is left with an empty section heading.
      for (const release of parseChangelog(phone)) {
        for (const section of release.sections) {
          expect(section.items.length, release.version).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps the rest of a release", () => {
    const phone = whatsNewText(appMarkdown(next ?? released, true));
    expect(phone).toMatch(/Phone app storage/);
  });

  it("is untouched on the desktop app and the website", () => {
    for (const md of changelogs) {
      expect(whatsNewText(appMarkdown(md, false))).toMatch(/Dropbox/);
      expect(whatsNewText(md)).toMatch(/Dropbox/);
      expect(whatsNewText(md)).toMatch(/Google Drive/);
    }
  });
});
