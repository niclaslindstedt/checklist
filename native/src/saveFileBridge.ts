// THE SAVE-FILE BRIDGE: how an export leaves the app.
//
// A browser export is a download — an anchor clicked at a `blob:` URL. Inside
// the WebView that click goes nowhere: the WebView offers the `blob:` URL to
// `onShouldStartLoadWithRequest` as a navigation, and there is nothing to open
// it with. oss-framework's `saveFile` is the export call that works in both
// places: in a shell that advertises `save-file` in `window.__ossShell`, it
// posts the file's bytes here instead, and this writes them to the cache and
// opens the share sheet (Save to Files, Mail, AirDrop, …).
//
// The contract is oss-framework's `docs/native-shell.md`; this file is its
// reference native half, unchanged. The page's side is pinned against it in
// `tests/native/save-file-bridge.test.ts`.
//
// The payload is the user's document: it is never logged, only the latest
// export is kept (in the cache, which the next export clears and the OS may
// purge), and it goes to nothing but the share sheet.

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export const SAVE_FILE_TYPE = "oss-framework/save-file";
const RESULT_EVENT = "oss-framework/save-file-result";

/** Injected before the page loads (beside any other provider scripts). */
export const SAVE_FILE_DESCRIPTOR = `(function () {
  var shell = window.__ossShell || { version: 1, capabilities: [] };
  if (shell.capabilities.indexOf("save-file") < 0) shell.capabilities.push("save-file");
  window.__ossShell = shell;
})(); true;`;

export type SaveFileRequest = {
  type: string;
  version: number;
  id: string;
  filename: string;
  mimeType: string;
  base64: string;
};

export function isSaveFileRequest(value: unknown): value is SaveFileRequest {
  const m = value as Partial<SaveFileRequest> | null;
  return (
    typeof m === "object" &&
    m !== null &&
    m.type === SAVE_FILE_TYPE &&
    typeof m.id === "string" &&
    typeof m.filename === "string" &&
    typeof m.mimeType === "string" &&
    typeof m.base64 === "string"
  );
}

/** iOS picks share targets by UTI, not MIME type. Extend as exports need. */
const UTI: Record<string, string> = {
  "application/json": "public.json",
  "application/pdf": "com.adobe.pdf",
  "application/zip": "public.zip-archive",
  "image/jpeg": "public.jpeg",
  "image/png": "public.png",
  "image/svg+xml": "public.svg-image",
  "text/calendar": "public.calendar-event",
  "text/csv": "public.comma-separated-values-text",
  "text/markdown": "net.daringfireball.markdown",
  "text/plain": "public.plain-text",
  "text/vcard": "public.vcard",
};

function bareName(name: string): string {
  const last = name.split(/[\\/]/).pop()?.trim() ?? "";
  return last === "" || last === "." || last === ".." ? "file" : last;
}

/** The script that settles the page's promise. */
export function saveFileResultScript(
  id: string,
  ok: boolean,
  error?: string,
): string {
  const detail = ok ? { id, ok } : { id, ok, error };
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(
    RESULT_EVENT,
  )}, { detail: ${JSON.stringify(detail)} })); true;`;
}

/** Write the bytes to the cache, open the share sheet, answer. */
export async function answerSaveFile(
  request: SaveFileRequest,
  inject: (script: string) => void,
): Promise<void> {
  if (request.version !== 1) {
    inject(saveFileResultScript(request.id, false, "Unsupported version."));
    return;
  }
  // One directory per request, so the file keeps exactly the name the user
  // sees in the sheet. The previous export's directory goes first: it is not
  // deleted when its sheet closes, because an Android target may still be
  // reading it after the chooser has returned.
  const root = `${FileSystem.cacheDirectory}exports/`;
  const dir = `${root}${request.id.replace(/[^\w-]/g, "_")}/`;
  const uri = dir + bareName(request.filename);
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Sharing is not available on this device.");
    }
    await FileSystem.deleteAsync(root, { idempotent: true });
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.writeAsStringAsync(uri, request.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await Sharing.shareAsync(uri, {
      mimeType: request.mimeType,
      UTI: UTI[request.mimeType],
      dialogTitle: bareName(request.filename),
    });
    inject(saveFileResultScript(request.id, true));
  } catch (error) {
    inject(
      saveFileResultScript(
        request.id,
        false,
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
}
