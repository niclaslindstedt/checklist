// @vitest-environment jsdom
// The phone app's privacy page is true of the phone app alone: it names no
// website, no web host, no GitHub, no browser, no PWA and no localStorage, and
// says the only network traffic is the iCloud sync the reader turns on. The
// website's copy still says where it is served from, and the desktop app's is
// unchanged. No build's copy says "no account". The build flags are
// compile-time defines in a real build; here each case stubs them as globals
// and imports the page afresh — and one real phone build checks the wording
// left the bundle and the page head rather than riding along as dead code.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

type Build = { native: boolean; shell: boolean };

const WEBSITE: Build = { native: false, shell: false };
const DESKTOP: Build = { native: false, shell: true };
const PHONE: Build = { native: true, shell: false };

/** The page's text as a build with these flags renders it. */
async function privacyText({ native, shell }: Build): Promise<string> {
  vi.stubGlobal("__NATIVE__", native);
  vi.stubGlobal("__SHELL_BUILD__", shell);
  vi.resetModules();
  const { PrivacyPage } = await import("../../src/ui/PrivacyPage.tsx");
  const { container } = render(<PrivacyPage />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

/** What names another edition of the app, or where it is served from. */
const OTHER_EDITION =
  /website|web site|static site|on the web|github|browser|\bPWA\b|installed app|localStorage|niclaslindstedt/i;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the phone app's privacy page", () => {
  it("names no other edition, no web host and no Dropbox", async () => {
    const text = await privacyText(PHONE);
    expect(text).not.toMatch(OTHER_EDITION);
    expect(text).not.toMatch(/Dropbox|local folder/i);
    expect(text).not.toMatch(/no account/i);
  });

  it("says the app sends nothing but the sync the reader turns on", async () => {
    const text = await privacyText(PHONE);
    expect(text).toMatch(/come inside the download/);
    expect(text).toMatch(/sends nothing when it starts/);
    expect(text).toMatch(/only network traffic is the sync you turn on/);
    expect(text).toMatch(/iCloud, through your own Apple Account/);
    expect(text).toMatch(/Deleting the app erases it/);
    expect(text).toMatch(/Server logs ?There are none/);
  });

  it("still links to the full policy", async () => {
    await privacyText(PHONE);
    const link = document.querySelector<HTMLAnchorElement>(
      'a[href="https://apps.agilator.se/checklist/privacy/"]',
    );
    expect(link).not.toBeNull();
  });
});

describe("the other builds' privacy page", () => {
  it("on the website still says where it is served from", async () => {
    const text = await privacyText(WEBSITE);
    expect(text).toContain("served as a static site at");
    expect(text).toContain("checklist.niclaslindstedt.se");
    expect(text).toMatch(/The website is served by GitHub Pages/);
    expect(text).toMatch(/localStorage/);
    expect(text).toMatch(/Dropbox/);
  });

  it("in the desktop app still describes the browser and the website's host", async () => {
    const text = await privacyText(DESKTOP);
    expect(text).toMatch(/It runs entirely on your device\./);
    expect(text).toMatch(/Clearing your browser's site data/);
    expect(text).toMatch(/The website is served by GitHub Pages/);
    expect(text).toMatch(/Dropbox/);
    expect(text).not.toContain("niclaslindstedt");
  });

  it("says no account in no build", async () => {
    for (const build of [WEBSITE, DESKTOP]) {
      const text = await privacyText(build);
      expect(text).not.toMatch(/no account/i);
      expect(text).toMatch(/nothing to sign up for/);
      cleanup();
    }
  });
});

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

describe("the real phone build", () => {
  it("carries no other edition's wording in its pages or its bundle", () => {
    const out = mkdtempSync(join(tmpdir(), "privacy-page-"));
    try {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            key !== "NODE_ENV" &&
            !key.startsWith("VITEST") &&
            !key.startsWith("VITE_"),
        ),
      );
      execFileSync(
        process.execPath,
        [
          join("node_modules", "vite", "bin", "vite.js"),
          "build",
          "--outDir",
          out,
          "--emptyOutDir",
          "--logLevel",
          "error",
        ],
        { env: { ...env, VITE_NATIVE: "1" }, stdio: "pipe" },
      );
      const carrying = [...files(out)]
        .filter((path) => /\.(?:html|js)$/.test(path))
        .filter((path) =>
          /github pages|static site|the website|no account/i.test(
            readFileSync(path, "utf8"),
          ),
        )
        .map((path) => path.slice(out.length + 1));
      expect(carrying).toEqual([]);

      for (const page of ["index.html", join("privacy", "index.html")]) {
        const html = readFileSync(join(out, page), "utf8");
        expect(html).not.toMatch(/<!--|og:|twitter:|\bPWA\b|browser/i);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
