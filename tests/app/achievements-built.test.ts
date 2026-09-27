// Achievements are the website's alone (`ACHIEVEMENTS_BUILT` in
// `src/build-env.ts`): the phone app and the desktop app carry no catalog and
// no strings for it. The build flags are compile-time defines in a real build;
// here each case stubs them as globals and imports the modules afresh.
import { afterEach, describe, expect, it, vi } from "vitest";

async function buildFor(flags: { native: boolean; shell: boolean }) {
  vi.stubGlobal("__NATIVE__", flags.native);
  vi.stubGlobal("__SHELL_BUILD__", flags.shell);
  vi.resetModules();
  const { ACHIEVEMENTS_BUILT } = await import("../../src/build-env.ts");
  const { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } =
    await import("../../src/achievements/catalog.ts");
  const { en } = await import("../../src/i18n/locales/en/index.ts");
  const { sv } = await import("../../src/i18n/locales/sv/index.ts");
  return { ACHIEVEMENTS_BUILT, ACHIEVEMENTS, ACHIEVEMENT_BY_ID, en, sv };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ACHIEVEMENTS_BUILT", () => {
  it("gives the website the whole catalog and its strings", async () => {
    const web = await buildFor({ native: false, shell: false });
    expect(web.ACHIEVEMENTS_BUILT).toBe(true);
    expect(web.ACHIEVEMENTS.length).toBeGreaterThan(0);
    expect(web.en.achievements.button.open).toBe("Achievements");
    expect(web.sv.achievements.button.open).toBe("Bedrifter");
  });

  for (const [name, flags] of [
    ["the phone app", { native: true, shell: false }],
    ["the desktop app", { native: false, shell: true }],
  ] as const) {
    it(`gives ${name} no achievements and no strings for them`, async () => {
      const app = await buildFor(flags);
      expect(app.ACHIEVEMENTS_BUILT).toBe(false);
      expect(app.ACHIEVEMENTS).toEqual([]);
      expect(app.ACHIEVEMENT_BY_ID.size).toBe(0);
      expect(app.en.achievements).toEqual({});
      expect(app.sv.achievements).toEqual({});
    });
  }
});
