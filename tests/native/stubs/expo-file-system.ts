// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Stands in for `expo-file-system/legacy`, a native module only `native/`
// installs: `test.alias` in vite.config.ts resolves the import here, and the
// root tsconfig's `paths` types it from here. It declares only what
// `native/src/saveFileBridge.ts` uses. A test that reaches it mocks it with
// `vi.mock`, so nothing here ever runs. One stub per module: two ids aliased to
// one file would share one mock.

function notMocked(): never {
  throw new Error("expo-file-system is native: vi.mock it in the test");
}

export const cacheDirectory: string | null = null;
export const EncodingType = { Base64: "base64", UTF8: "utf8" } as const;
export async function deleteAsync(
  _uri: string,
  _options?: { idempotent?: boolean },
): Promise<void> {
  notMocked();
}
export async function makeDirectoryAsync(
  _uri: string,
  _options?: { intermediates?: boolean },
): Promise<void> {
  notMocked();
}
export async function writeAsStringAsync(
  _uri: string,
  _contents: string,
  _options?: { encoding?: "base64" | "utf8" },
): Promise<void> {
  notMocked();
}
