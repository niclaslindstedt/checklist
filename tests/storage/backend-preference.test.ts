// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearDropboxRefreshToken,
  clearDropboxToken,
  clearDropboxTokens,
  clearGdriveToken,
  getBackend,
  getDropboxRefreshToken,
  getDropboxToken,
  getEncryption,
  getGdriveToken,
  setBackend,
  setDropboxRefreshToken,
  setDropboxToken,
  setEncryption,
  setGdriveToken,
} from "../../src/storage/backend-preference.ts";

afterEach(() => {
  localStorage.clear();
  delete (globalThis as { __native?: unknown }).__native;
  vi.restoreAllMocks();
});

describe("backend preference", () => {
  it("defaults to the browser backend on a fresh device", () => {
    expect(getBackend()).toBe("browser");
  });

  it("round-trips each known backend id", () => {
    for (const id of ["dropbox", "gdrive", "folder", "browser"] as const) {
      setBackend(id);
      expect(getBackend()).toBe(id);
    }
  });

  it("migrates the legacy 'local' value to 'browser'", () => {
    localStorage.setItem("checklist:backend", "local");
    expect(getBackend()).toBe("browser");
  });

  it("falls back to browser for an unknown stored value", () => {
    localStorage.setItem("checklist:backend", "carrier-pigeon");
    expect(getBackend()).toBe("browser");
  });

  it("downgrades a stored 'icloud' to browser when the bridge is absent", () => {
    // The web build (no native bridge) must never resolve to iCloud, even if a
    // stored preference from the native wrapper leaked across the shared origin.
    localStorage.setItem("checklist:backend", "icloud");
    expect(getBackend()).toBe("browser");
  });

  it("resolves 'icloud' only when the native iCloud bridge is present", () => {
    (globalThis as { __native?: unknown }).__native = {
      platform: "ios",
      icloud: {},
    };
    localStorage.setItem("checklist:backend", "icloud");
    expect(getBackend()).toBe("icloud");
  });
});

describe("cloud tokens", () => {
  it("stores, reads, and clears the Dropbox access token", () => {
    expect(getDropboxToken()).toBeNull();
    setDropboxToken("dbx-access");
    expect(getDropboxToken()).toBe("dbx-access");
    clearDropboxToken();
    expect(getDropboxToken()).toBeNull();
  });

  it("keeps the Dropbox refresh token under its own key", () => {
    setDropboxToken("dbx-access");
    setDropboxRefreshToken("dbx-refresh");
    expect(getDropboxRefreshToken()).toBe("dbx-refresh");
    // Clearing the access token leaves the refresh token in place.
    clearDropboxToken();
    expect(getDropboxRefreshToken()).toBe("dbx-refresh");
    clearDropboxRefreshToken();
    expect(getDropboxRefreshToken()).toBeNull();
  });

  it("clears both Dropbox tokens together", () => {
    setDropboxToken("dbx-access");
    setDropboxRefreshToken("dbx-refresh");
    clearDropboxTokens();
    expect(getDropboxToken()).toBeNull();
    expect(getDropboxRefreshToken()).toBeNull();
  });

  it("stores, reads, and clears the Google Drive token", () => {
    expect(getGdriveToken()).toBeNull();
    setGdriveToken("gd-access");
    expect(getGdriveToken()).toBe("gd-access");
    clearGdriveToken();
    expect(getGdriveToken()).toBeNull();
  });
});

describe("encryption mode", () => {
  it("defaults to plaintext", () => {
    expect(getEncryption()).toBe("plaintext");
  });

  it("round-trips the encrypted opt-in", () => {
    setEncryption("encrypted");
    expect(getEncryption()).toBe("encrypted");
    setEncryption("plaintext");
    expect(getEncryption()).toBe("plaintext");
  });

  it("treats any non-'encrypted' stored value as plaintext", () => {
    localStorage.setItem("checklist:encryption", "garbage");
    expect(getEncryption()).toBe("plaintext");
  });
});

describe("storage resilience", () => {
  it("swallows a failing write rather than throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => setBackend("dropbox")).not.toThrow();
  });

  it("returns a safe default when reads throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });
    expect(getBackend()).toBe("browser");
    expect(getDropboxToken()).toBeNull();
    expect(getEncryption()).toBe("plaintext");
  });
});
