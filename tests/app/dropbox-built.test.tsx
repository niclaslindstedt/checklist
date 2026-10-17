// @vitest-environment jsdom
// Dropbox and the local folder are the website's and the desktop app's alone
// (`DROPBOX_BUILT`, `LOCAL_FOLDER_BUILT` in `src/build-env.ts`): the phone app
// offers neither — no Storage option, not even a disabled one, no Dropbox key
// in its bundle, and no privacy text, page head or bundled doc that names
// them. The build flags are compile-time defines in a real build; here each
// case stubs them as globals and imports the modules afresh.
import { readFileSync } from "node:fs";

import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appMarkdown } from "../../src/site/phone-markdown.ts";
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

  it("and LOCAL_FOLDER_BUILT likewise", async () => {
    for (const [flags, built] of [
      [WEBSITE, true],
      [DESKTOP, true],
      [PHONE, false],
    ] as const) {
      stubBuild(flags);
      const { LOCAL_FOLDER_BUILT } = await import("../../src/build-env.ts");
      expect(LOCAL_FOLDER_BUILT).toBe(built);
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

  it("lists the local folder on the website and the desktop app, disabled without a directory picker", async () => {
    for (const flags of [WEBSITE, DESKTOP]) {
      await storageOptions(flags);
      expect(
        screen.getByRole("radio", { name: "Local folder" }),
      ).toHaveProperty("disabled", true);
      cleanup();
      await storageOptions(flags, { folderAvailable: true });
      expect(
        screen.getByRole("radio", { name: "Local folder" }),
      ).toHaveProperty("disabled", false);
      cleanup();
    }
  });

  it("has neither Dropbox nor a local folder in the phone app", async () => {
    const options = await storageOptions(PHONE, { icloudAvailable: true });
    expect(options).toEqual(["This device", "iCloud"]);
    expect(document.body.textContent).not.toMatch(/dropbox|folder/i);
  });

  it("shows no folder panel in the phone app, whatever the backend says", async () => {
    await storageOptions(PHONE, { backend: "folder", folderAvailable: true });
    expect(document.body.textContent).not.toMatch(/folder/i);
  });
});

describe("a phone install that had a local folder selected", () => {
  it("reads as this device, its lists untouched", async () => {
    localStorage.setItem("checklist:backend", "folder");
    localStorage.setItem("checklist:v1", '{"lists":"device"}');
    stubBuild(PHONE);
    const pref = await import("../../src/storage/backend-preference.ts");
    expect(pref.getBackend()).toBe("browser");
    expect(localStorage.getItem("checklist:v1")).toBe('{"lists":"device"}');
  });

  it("stays on the folder on the website and the desktop app", async () => {
    localStorage.setItem("checklist:backend", "folder");
    for (const flags of [WEBSITE, DESKTOP]) {
      stubBuild(flags);
      const pref = await import("../../src/storage/backend-preference.ts");
      expect(pref.getBackend()).toBe("folder");
    }
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
  it("its privacy page names neither Dropbox nor a local folder and names iCloud; the website's keeps both", async () => {
    stubBuild(PHONE);
    const phone = await import("../../src/ui/PrivacyPage.tsx");
    render(<phone.PrivacyPage />);
    expect(document.body.textContent).not.toMatch(/dropbox|local folder/i);
    expect(document.body.textContent).toMatch(/iCloud/);
    cleanup();

    stubBuild(WEBSITE);
    const web = await import("../../src/ui/PrivacyPage.tsx");
    render(<web.PrivacyPage />);
    expect(document.body.textContent).toMatch(/Dropbox/);
    expect(document.body.textContent).toMatch(/Local folder/);
  });

  it("its page heads name no Dropbox", async () => {
    const { HOME_ROUTE, PRIVACY_ROUTE, routeHeadFor, resolveNoscriptBody } =
      await import("../../src/site/routes.ts");
    for (const route of [HOME_ROUTE, PRIVACY_ROUTE]) {
      const phone = routeHeadFor(route, true);
      expect(phone.description).not.toMatch(/dropbox|folder/i);
      expect(resolveNoscriptBody(phone)).not.toMatch(/dropbox|folder/i);
      expect(routeHeadFor(route, false)).toBe(route);
    }
  });

  it("its bundled feature docs name neither Dropbox nor a local folder", async () => {
    stubBuild(PHONE);
    const { FEATURE_DOCS, parseFeatureDoc } =
      await import("../../src/ui/changelog/feature-docs.ts");
    expect(FEATURE_DOCS["cloud-sync"]).toBeUndefined();
    expect(FEATURE_DOCS["local-folder"]).toBeUndefined();
    // Each doc the phone glob carries, as the phone build loads it: the
    // markdown `vite.config.ts` hands the bundle (`appMarkdown`).
    for (const slug of Object.keys(FEATURE_DOCS)) {
      const doc = parseFeatureDoc(
        slug,
        appMarkdown(readFileSync(`docs/features/${slug}.md`, "utf8"), true),
      );
      const text = `${doc.title}\n${doc.body}`;
      expect(text, slug).not.toMatch(/dropbox|google drive|local[ -]folder/i);
      // No doc in the phone app links a page it does not carry.
      for (const [, link] of doc.body.matchAll(/\(feature:([a-z0-9-]+)\)/g)) {
        expect(FEATURE_DOCS[link!], `${slug} → ${link}`).toBeDefined();
      }
    }

    stubBuild(DESKTOP);
    const desktop = await import("../../src/ui/changelog/feature-docs.ts");
    expect(desktop.FEATURE_DOCS["cloud-sync"]).toBeDefined();
    expect(desktop.FEATURE_DOCS["local-folder"]).toBeDefined();
  });
});
