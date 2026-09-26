// The side menu's Donate entry is the website's alone (`DONATE_URL` in
// `src/build-env.ts`). The build flags are compile-time defines in a real
// build; here each case stubs them as globals and imports the module afresh.
import { afterEach, describe, expect, it, vi } from "vitest";

async function donateUrlFor(
  flags: { native: boolean; shell: boolean },
  configured: string,
): Promise<string | undefined> {
  vi.stubGlobal("__NATIVE__", flags.native);
  vi.stubGlobal("__SHELL_BUILD__", flags.shell);
  vi.stubEnv("VITE_DONATE_URL", configured);
  vi.resetModules();
  return (await import("../../src/build-env.ts")).DONATE_URL;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("DONATE_URL", () => {
  it("links the website to the configured target", async () => {
    expect(
      await donateUrlFor(
        { native: false, shell: false },
        " https://donate.example ",
      ),
    ).toBe("https://donate.example");
  });

  it("hides the website's entry when the target is blank", async () => {
    expect(
      await donateUrlFor({ native: false, shell: false }, "  "),
    ).toBeUndefined();
  });

  it("gives the phone app no Donate entry, whatever the build env says", async () => {
    expect(
      await donateUrlFor(
        { native: true, shell: false },
        "https://donate.example",
      ),
    ).toBeUndefined();
  });

  it("gives the desktop app no Donate entry either", async () => {
    expect(
      await donateUrlFor(
        { native: false, shell: true },
        "https://donate.example",
      ),
    ).toBeUndefined();
  });
});
