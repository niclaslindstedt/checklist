// @vitest-environment jsdom
// Dropbox is the website's and the desktop app's alone (`DROPBOX_BUILT` in
// `src/build-env.ts`): the phone app offers no Dropbox — no Storage option,
// not even a disabled one, no key in its bundle, and no privacy text, page
// head or bundled doc that names it. The build flags are compile-time defines
// in a real build; here each case stubs them as globals and imports the
// modules afresh.
import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UseStorageBackend } from "../../src/storage/useStorageBackend.ts";

type Build = { native: boolean; shell: boolean };

const WEBSITE: Build = { native: false, shell: false };
const DESKTOP: Build = { native: false, shell: true };
const PHONE: Build = { native: true, shell: false };

function stubBuild(flags: Build) {
  vi.stubGlobal("__NATIVE__", flags.native);
  vi.stubGlobal("__SHELL_BUILD__", flags.shell);
  vi.resetModules();
}

// Only what the Storage tab reads; the verbs are inert.
function storageStub(
  overrides: Partial<UseStorageBackend> = {},
): UseStorageBackend {
  return {
    backend: "browser",
    dropboxConfigured: true,
    dropboxConnected: false,
    icloudAvailable: false,
    icloudConnected: false,
    folderAvailable: false,
    folderConnected: false,
    folderReconnectNeeded: false,
    encryption: "plaintext",
    selectBrowser: vi.fn(),
    selectICloud: vi.fn(),
    connectFolder: vi.fn(async () => {}),
    reconnectFolder: vi.fn(async () => {}),
    disconnectFolder: vi.fn(async () => {}),
    connectDropbox: vi.fn(),
    disconnectDropbox: vi.fn(),
    enableEncryption: vi.fn(async () => {}),
    disableEncryption: vi.fn(async () => {}),
    ...overrides,
  } as unknown as UseStorageBackend;
}

async function storageOptions(
  flags: Build,
  overrides: Partial<UseStorageBackend> = {},
): Promise<string[]> {
  stubBuild(flags);
  const { StorageTab } = await import("../../src/ui/settings/tabs/storage.tsx");
  render(<StorageTab storage={storageStub(overrides)} />);
  return screen.getAllByRole("radio").map((r) => r.textContent ?? "");
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete (globalThis as { __native?: unknown }).__native;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("DROPBOX_BUILT", () => {
  it("is true on the website and the desktop app, false in the phone app", async () => {
    for (const [flags, built] of [
      [WEBSITE, true],
      [DESKTOP, true],
      [PHONE, false],
    ] as const) {
      stubBuild(flags);
      const { DROPBOX_BUILT } = await import("../../src/build-env.ts");
      expect(DROPBOX_BUILT).toBe(built);
    }
  });

  it("keeps the app key out of the phone build even when it is set", async () => {
    vi.stubEnv("VITE_DROPBOX_APP_KEY", "abc123");
    stubBuild(WEBSITE);
    const web = await import("../../src/storage/dropbox/index.ts");
    expect(web.isDropboxConfigured()).toBe(true);
    stubBuild(PHONE);
    const phone = await import("../../src/storage/dropbox/index.ts");
    expect(phone.DROPBOX_APP_KEY).toBe("");
    expect(phone.isDropboxConfigured()).toBe(false);
  });
});

describe("the Storage tab", () => {
  it("lists Dropbox on the website and the desktop app", async () => {
    for (const flags of [WEBSITE, DESKTOP]) {
      expect(await storageOptions(flags)).toContain("Dropbox");
      cleanup();
    }
  });

  it("keeps showing it disabled there when the build has no key", async () => {
    await storageOptions(WEBSITE, { dropboxConfigured: false });
    expect(screen.getByRole("radio", { name: "Dropbox" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("has no Dropbox option at all in the phone app", async () => {
    const options = await storageOptions(PHONE, { icloudAvailable: true });
    expect(options).toEqual(["This device", "iCloud", "Local folder"]);
    expect(document.body.textContent).not.toMatch(/dropbox/i);
  });
});

describe("a phone install that had Dropbox selected", () => {
  it("moves to this device, adopting the offline copy, and drops the tokens", async () => {
    localStorage.setItem("checklist:backend", "dropbox");
    localStorage.setItem("checklist:dropbox:token", "t");
    localStorage.setItem("checklist:dropbox:refresh", "r");
    localStorage.setItem(
      "checklist:cache:dropbox:default",
      JSON.stringify({ text: '{"lists":"default"}', revision: "1" }),
    );
    localStorage.setItem(
      "checklist:cache:dropbox:family",
      JSON.stringify({ text: '{"lists":"family"}' }),
    );
    // A namespace the device already holds is left as it is.
    localStorage.setItem(
      "checklist:cache:dropbox:work",
      JSON.stringify({ text: '{"lists":"cloud"}' }),
    );
    localStorage.setItem("checklist:v1:work", '{"lists":"device"}');

    stubBuild(PHONE);
    const pref = await import("../../src/storage/backend-preference.ts");
    expect(pref.getBackend()).toBe("browser");

    expect(localStorage.getItem("checklist:backend")).toBe("browser");
    expect(localStorage.getItem("checklist:v1")).toBe('{"lists":"default"}');
    expect(localStorage.getItem("checklist:v1:family")).toBe(
      '{"lists":"family"}',
    );
    expect(localStorage.getItem("checklist:v1:work")).toBe(
      '{"lists":"device"}',
    );
    expect(pref.getDropboxToken()).toBeNull();
    expect(pref.getDropboxRefreshToken()).toBeNull();
  });

  it("survives a corrupt offline copy", async () => {
    localStorage.setItem("checklist:backend", "dropbox");
    localStorage.setItem("checklist:cache:dropbox:default", "{not json");
    stubBuild(PHONE);
    const pref = await import("../../src/storage/backend-preference.ts");
    expect(pref.getBackend()).toBe("browser");
    expect(localStorage.getItem("checklist:v1")).toBeNull();
  });

  it("stays on Dropbox on the website", async () => {
    localStorage.setItem("checklist:backend", "dropbox");
    localStorage.setItem("checklist:dropbox:token", "t");
    stubBuild(WEBSITE);
    const pref = await import("../../src/storage/backend-preference.ts");
    expect(pref.getBackend()).toBe("dropbox");
    expect(pref.getDropboxToken()).toBe("t");
  });
});

describe("what the phone app says", () => {
  it("its privacy page names no Dropbox and names iCloud; the website's keeps Dropbox", async () => {
    stubBuild(PHONE);
    const phone = await import("../../src/ui/PrivacyPage.tsx");
    render(<phone.PrivacyPage />);
    expect(document.body.textContent).not.toMatch(/dropbox/i);
    expect(document.body.textContent).toMatch(/iCloud/);
    cleanup();

    stubBuild(WEBSITE);
    const web = await import("../../src/ui/PrivacyPage.tsx");
    render(<web.PrivacyPage />);
    expect(document.body.textContent).toMatch(/Dropbox/);
  });

  it("its page heads name no Dropbox", async () => {
    const { HOME_ROUTE, PRIVACY_ROUTE, routeHeadFor, resolveNoscriptBody } =
      await import("../../src/site/routes.ts");
    for (const route of [HOME_ROUTE, PRIVACY_ROUTE]) {
      const phone = routeHeadFor(route, true);
      expect(phone.description).not.toMatch(/dropbox/i);
      expect(resolveNoscriptBody(phone)).not.toMatch(/dropbox/i);
      expect(routeHeadFor(route, false)).toBe(route);
    }
  });

  it("its bundled feature docs name no Dropbox", async () => {
    stubBuild(PHONE);
    const { FEATURE_DOCS } =
      await import("../../src/ui/changelog/feature-docs.ts");
    expect(FEATURE_DOCS["cloud-sync"]).toBeUndefined();
    for (const doc of Object.values(FEATURE_DOCS)) {
      expect(`${doc.title}\n${doc.body}`, doc.slug).not.toMatch(/dropbox/i);
      // No doc in the phone app links a page it does not carry.
      for (const [, slug] of doc.body.matchAll(/\(feature:([a-z0-9-]+)\)/g)) {
        expect(FEATURE_DOCS[slug!], `${doc.slug} → ${slug}`).toBeDefined();
      }
    }

    stubBuild(DESKTOP);
    const desktop = await import("../../src/ui/changelog/feature-docs.ts");
    expect(desktop.FEATURE_DOCS["cloud-sync"]).toBeDefined();
  });
});
