// Links back to the source — the repository, its issues and releases — and
// the website's own address are the website's alone (`IS_WEBSITE` in
// `src/build-env.ts`): the phone app and the desktop app carry none of them.
// The build flags are compile-time defines in a real build; here each case
// stubs them as globals and imports the modules afresh.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderHead, ROUTES } from "../../src/site/routes.ts";
import {
  SOURCE_MARK,
  withoutSourceLinks,
} from "../../src/site/source-links.ts";

async function buildFor(flags: { native: boolean; shell: boolean }) {
  vi.stubGlobal("__NATIVE__", flags.native);
  vi.stubGlobal("__SHELL_BUILD__", flags.shell);
  vi.resetModules();
  const { IS_WEBSITE } = await import("../../src/build-env.ts");
  const { renderStaticRoute } = await import("../../src/app/prerender.tsx");
  return { IS_WEBSITE, renderStaticRoute };
}

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IS_WEBSITE", () => {
  it("gives the website its source links and its address", async () => {
    const web = await buildFor({ native: false, shell: false });
    expect(web.IS_WEBSITE).toBe(true);
    const privacy = web.renderStaticRoute("privacy");
    expect(privacy).toContain("github.com/niclaslindstedt/checklist/issues");
    expect(privacy).toContain("checklist.niclaslindstedt.se");
    expect(web.renderStaticRoute("home")).toContain(
      "https://github.com/niclaslindstedt/checklist",
    );
  });

  for (const [name, flags] of [
    ["the phone app", { native: true, shell: false }],
    ["the desktop app", { native: false, shell: true }],
  ] as const) {
    it(`gives ${name} neither, and a support address instead`, async () => {
      const app = await buildFor(flags);
      expect(app.IS_WEBSITE).toBe(false);
      const privacy = app.renderStaticRoute("privacy");
      expect(privacy).not.toContain(SOURCE_MARK);
      expect(privacy).toContain("mailto:support@agilator.se");
      // The showcase is not built into the apps: its route renders the
      // privacy page, the only standalone page they carry.
      expect(app.renderStaticRoute("home")).not.toContain(SOURCE_MARK);
    });
  }
});

describe("renderHead", () => {
  it("leaves the social cards, and the address they carry, to the website", () => {
    for (const route of ROUTES) {
      const head = renderHead(route, { social: false });
      expect(head).toContain("<title>");
      expect(head).not.toContain("og:url");
      expect(head).not.toContain(SOURCE_MARK);
    }
  });
});

describe("withoutSourceLinks", () => {
  it("keeps a marked link's label and drops the link", () => {
    expect(
      withoutSourceLinks(
        "Get it from the [releases page](https://github.com/niclaslindstedt/checklist/releases).",
      ),
    ).toBe("Get it from the releases page.");
  });

  it("leaves other links alone", () => {
    const md =
      "See [the docs](https://example.com/) or [notes](feature:notes).";
    expect(withoutSourceLinks(md)).toBe(md);
  });

  it("drops a line that names the address outright", () => {
    expect(
      withoutSourceLinks(
        "### Changed\n\n- **New home at checklist.niclaslindstedt.se** — moved.\n- **One menu** — kept.",
      ),
    ).toBe("### Changed\n\n- **One menu** — kept.");
  });

  it("drops a link whose label spells the address", () => {
    expect(
      withoutSourceLinks(
        "- Fixed ([github.com/niclaslindstedt/checklist](https://github.com/niclaslindstedt/checklist/pull/1))",
      ),
    ).toBe("");
  });

  it("leaves nothing of the mark in the changelog or the feature docs", () => {
    expect(withoutSourceLinks(read("../../CHANGELOG.md"))).not.toContain(
      SOURCE_MARK,
    );
    expect(
      withoutSourceLinks(read("../../docs/features/desktop-app.md")),
    ).not.toContain(SOURCE_MARK);
  });
});
