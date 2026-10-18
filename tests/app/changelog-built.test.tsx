// @vitest-environment jsdom
// What's new is the website's and the desktop app's alone (`CHANGELOG_BUILT`
// in `src/build-env.ts`): the phone app's version history is the App Store's
// What's New, so it has no entry in the About menu and neither the modal nor
// CHANGELOG.md nor a feature doc in its bundle. The first cases stub the build
// flags as globals and import the modules afresh; the last builds the phone
// app and the website for real and reads what they wrote.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Build = { native: boolean; shell: boolean };

const WEBSITE: Build = { native: false, shell: false };
const DESKTOP: Build = { native: false, shell: true };
const PHONE: Build = { native: true, shell: false };

function stubBuild(flags: Build) {
  vi.stubGlobal("__NATIVE__", flags.native);
  vi.stubGlobal("__SHELL_BUILD__", flags.shell);
  vi.resetModules();
}

beforeEach(() => {
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The About menu's rows, opened, for one build.
async function aboutMenu(flags: Build): Promise<HTMLElement[]> {
  stubBuild(flags);
  const { SideMenu } = await import("../../src/ui/SideMenu.tsx");
  const { ModalBusProvider } =
    await import("../../src/ui/ModalBusProvider.tsx");
  const { NavContext } = await import("../../src/ui/nav-context.ts");
  const { ChecklistContext } =
    await import("../../src/ui/checklist-context.ts");
  const { RenameChecklistContext } =
    await import("../../src/ui/rename-checklist.ts");
  const { makeChecklistValue, makeNavValue } =
    await import("../ui/context-harness.tsx");
  const noop = () => {};
  render(
    <ModalBusProvider>
      <NavContext.Provider value={makeNavValue({ open: true })}>
        <ChecklistContext.Provider value={makeChecklistValue()}>
          <RenameChecklistContext.Provider
            value={{ requestRename: noop, pendingId: null, clearRename: noop }}
          >
            <SideMenu
              namespaces={[{ slug: "default", name: "Default" }]}
              activeNamespace="default"
              onSwitchNamespace={noop}
              onRemoveNamespace={async () => {}}
            />
          </RenameChecklistContext.Provider>
        </ChecklistContext.Provider>
      </NavContext.Provider>
    </ModalBusProvider>,
  );
  fireEvent.click(screen.getByRole("menuitem", { name: "About" }));
  return screen.getAllByRole("menuitem");
}

describe("CHANGELOG_BUILT", () => {
  it("is the website's and the desktop app's, not the phone app's", async () => {
    for (const [flags, built] of [
      [WEBSITE, true],
      [DESKTOP, true],
      [PHONE, false],
    ] as const) {
      stubBuild(flags);
      const { CHANGELOG_BUILT } = await import("../../src/build-env.ts");
      expect(CHANGELOG_BUILT).toBe(built);
    }
  });

  it("leaves What's new out of the phone app's About menu, and keeps its build label", async () => {
    const rows = await aboutMenu(PHONE);
    const labels = rows.map((row) => row.textContent ?? "");
    expect(labels.some((l) => l.includes("What's new"))).toBe(false);
    const privacy = screen.getByRole("menuitem", { name: /Privacy policy/ });
    // The build label rides on the privacy row: the phone app has neither the
    // source row nor What's new to carry it.
    expect(privacy.textContent).not.toBe("Privacy policy");
  });

  it("keeps What's new in the website's and the desktop app's About menu", async () => {
    for (const flags of [WEBSITE, DESKTOP]) {
      await aboutMenu(flags);
      expect(screen.getByRole("menuitem", { name: /What's new/ })).toBeTruthy();
      cleanup();
    }
  });
});

// The heading of the latest release in CHANGELOG.md — text only What's new
// carries into a bundle.
function latestReleaseHeading(): string {
  const heading = /^## \[\d+\.\d+\.\d+\]/m.exec(
    readFileSync("CHANGELOG.md", "utf8"),
  );
  if (!heading) throw new Error("CHANGELOG.md has no released version");
  return heading[0];
}

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

// Builds the app for real, with the env the build scripts set, and returns
// the paths of the files that carry `needle`. NODE_ENV and the test runner's
// own variables are dropped, so it is the build CI ships.
function filesCarrying(env: Record<string, string>, needle: string): string[] {
  const out = mkdtempSync(join(tmpdir(), "changelog-built-"));
  try {
    const base = Object.fromEntries(
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
      { env: { ...base, ...env }, stdio: "pipe" },
    );
    return [...files(out)]
      .filter((path) => readFileSync(path).includes(needle))
      .map((path) => path.slice(out.length + 1));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

describe("the real builds", () => {
  const heading = latestReleaseHeading();

  it("leave the version history out of the phone app", () => {
    expect(filesCarrying({ VITE_NATIVE: "1" }, heading)).toEqual([]);
  }, 120_000);

  it("keep it in the website", () => {
    expect(filesCarrying({}, heading)).not.toEqual([]);
  }, 120_000);
});
