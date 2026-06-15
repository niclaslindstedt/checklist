import { describe, expect, it } from "vitest";

import { parseChangelog } from "../../../src/ui/changelog/parse.ts";

describe("parseChangelog", () => {
  it("parses releases, dates, and typed sections", () => {
    const md = [
      "# Changelog",
      "",
      "## [0.2.0] - 2026-06-15",
      "",
      "### Added",
      "- Header menu with privacy, changelog, and donate links",
      "- Privacy policy at /privacy",
      "",
      "### Fixed",
      "- Settings cogwheel no longer overlaps the count",
      "",
      "## [0.1.0] - 2026-05-01",
      "",
      "### Added",
      "- First release",
    ].join("\n");

    const releases = parseChangelog(md);

    expect(releases.map((r) => r.version)).toEqual(["0.2.0", "0.1.0"]);
    expect(releases[0]!.date).toBe("2026-06-15");
    expect(releases[0]!.sections).toEqual([
      {
        type: "Added",
        items: [
          "Header menu with privacy, changelog, and donate links",
          "Privacy policy at /privacy",
        ],
      },
      {
        type: "Fixed",
        items: ["Settings cogwheel no longer overlaps the count"],
      },
    ]);
  });

  it("drops the empty Unreleased stub", () => {
    const md = ["# Changelog", "", "## [Unreleased]", ""].join("\n");
    expect(parseChangelog(md)).toEqual([]);
  });

  it("keeps an Unreleased section that has entries", () => {
    const md = ["## [Unreleased]", "", "### Added", "- Something pending"].join(
      "\n",
    );

    const releases = parseChangelog(md);
    expect(releases).toHaveLength(1);
    expect(releases[0]!.version).toBe("Unreleased");
    expect(releases[0]!.date).toBeNull();
  });

  it("folds wrapped continuation lines into the preceding bullet", () => {
    const md = [
      "## [1.0.0] - 2026-01-01",
      "",
      "### Changed",
      "- A long entry that wraps",
      "  onto a second line",
    ].join("\n");

    const releases = parseChangelog(md);
    expect(releases[0]!.sections[0]!.items).toEqual([
      "A long entry that wraps\nonto a second line",
    ]);
  });
});
