// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The save-file bridge (`native/src/saveFileBridge.ts`) against the page's side
// of the contract, oss-framework's `saveFile`.
//
// Like the auth-session bridge, every failure here is silent: a descriptor the
// page does not recognize leaves `saveFile` downloading a `blob:` URL the
// WebView cannot open, and a result event with the wrong name leaves the
// export's promise pending forever — on a build nobody can run without Xcode.
// So the injected scripts are RUN against the page's real `window`, and the
// page's own call is answered by the bridge with the file system and the share
// sheet stubbed out.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIME_CSV, saveFile } from "@niclaslindstedt/oss-framework/files";
import {
  isNativeShell,
  nativeShellCan,
} from "@niclaslindstedt/oss-framework/pwa";

const fs = vi.hoisted(() => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  deleteAsync: vi.fn(async () => {}),
  makeDirectoryAsync: vi.fn(async () => {}),
  writeAsStringAsync: vi.fn(
    async (_uri: string, _contents: string, _options?: unknown) => {},
  ),
}));
const sharing = vi.hoisted(() => ({
  isAvailableAsync: vi.fn(async () => true),
  shareAsync: vi.fn(async () => {}),
}));
vi.mock("expo-file-system/legacy", () => fs);
vi.mock("expo-sharing", () => sharing);

const {
  SAVE_FILE_DESCRIPTOR,
  answerSaveFile,
  isSaveFileRequest,
  saveFileResultScript,
} = await import("../../native/src/saveFileBridge.ts");

type ShellWindow = Window & {
  ReactNativeWebView?: { postMessage: (data: string) => void };
  __ossShell?: { version: number; capabilities: string[] };
};
const shellWindow = window as ShellWindow;

/** What the page posted to the shell, parsed. */
let posted: unknown[] = [];

/** Run a script the shell injects, as the WebView would. */
function inject(script: string): void {
  new Function(script)();
}

/** The WebView: the bridge `react-native-webview` puts on `window` when the
 *  shell passes `onMessage`, plus the descriptor injected before load. */
function enterShell(): void {
  shellWindow.ReactNativeWebView = {
    postMessage: (data: string) => posted.push(JSON.parse(data)),
  };
  inject(SAVE_FILE_DESCRIPTOR);
}

/** The shell's `onMessage`: every save-file request goes to the bridge, whose
 *  answer is injected back into the page. */
async function answerPosted(): Promise<void> {
  const request = posted.shift();
  expect(isSaveFileRequest(request)).toBe(true);
  if (isSaveFileRequest(request)) await answerSaveFile(request, inject);
}

beforeEach(() => {
  posted = [];
  vi.clearAllMocks();
  sharing.isAvailableAsync.mockResolvedValue(true);
});

afterEach(() => {
  delete shellWindow.ReactNativeWebView;
  delete shellWindow.__ossShell;
  vi.restoreAllMocks();
});

describe("the descriptor", () => {
  it("makes the page see a shell that takes exports", () => {
    enterShell();
    expect(isNativeShell()).toBe(true);
    expect(nativeShellCan("save-file")).toBe(true);
  });

  it("merges into a descriptor another script set, once", () => {
    shellWindow.__ossShell = { version: 1, capabilities: ["other"] };
    enterShell();
    inject(SAVE_FILE_DESCRIPTOR);
    expect(shellWindow.__ossShell?.capabilities).toEqual([
      "other",
      "save-file",
    ]);
  });
});

describe("an export in the phone app", () => {
  it("reaches the share sheet with the page's bytes, name and type", async () => {
    enterShell();
    const saved = saveFile({
      text: "Milk,1\nBröd,2\n",
      filename: "shopping.csv",
      mimeType: MIME_CSV,
    });
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    await answerPosted();

    await expect(saved).resolves.toBe("shared");
    const [uri, base64] = fs.writeAsStringAsync.mock.calls[0] ?? ["", ""];
    expect(uri).toMatch(/^file:\/\/\/cache\/exports\/[\w-]+\/shopping\.csv$/);
    expect(
      new TextDecoder().decode(
        Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
      ),
    ).toBe("Milk,1\nBröd,2\n");
    expect(sharing.shareAsync).toHaveBeenCalledWith(uri, {
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
      dialogTitle: "shopping.csv",
    });
    // Only the latest export is kept: the previous one's directory goes first.
    expect(fs.deleteAsync).toHaveBeenCalledWith("file:///cache/exports/", {
      idempotent: true,
    });
  });

  it("rejects the page's call when the device cannot share", async () => {
    sharing.isAvailableAsync.mockResolvedValue(false);
    enterShell();
    const saved = saveFile({ text: "x", filename: "x.txt" });
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    await answerPosted();

    await expect(saved).rejects.toThrow(
      "Sharing is not available on this device.",
    );
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("never trusts the name, and answers a version it does not know", async () => {
    const answers: string[] = [];
    const request = {
      type: "oss-framework/save-file",
      version: 1,
      id: "a/b",
      filename: "../../x.txt",
      mimeType: "text/plain",
      base64: "eA==",
    };
    await answerSaveFile(request, (s) => answers.push(s));
    expect(fs.writeAsStringAsync.mock.calls[0]?.[0]).toBe(
      "file:///cache/exports/a_b/x.txt",
    );

    await answerSaveFile({ ...request, version: 2 }, (s) => answers.push(s));
    expect(answers[1]).toBe(
      saveFileResultScript("a/b", false, "Unsupported version."),
    );
  });
});

describe("an export in a browser", () => {
  it("downloads, and posts nothing", async () => {
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    await expect(saveFile({ text: "x", filename: "x.txt" })).resolves.toBe(
      "downloaded",
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(posted).toHaveLength(0);
  });

  it("downloads in a WebView whose shell does not advertise save-file", async () => {
    shellWindow.ReactNativeWebView = {
      postMessage: (data: string) => posted.push(JSON.parse(data)),
    };
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await expect(saveFile({ text: "x", filename: "x.txt" })).resolves.toBe(
      "downloaded",
    );
    expect(posted).toHaveLength(0);
  });
});
