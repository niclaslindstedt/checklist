// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Stands in for `expo-sharing`, a native module only `native/` installs — see
// `expo-file-system.ts` beside it.

function notMocked(): never {
  throw new Error("expo-sharing is native: vi.mock it in the test");
}

export async function isAvailableAsync(): Promise<boolean> {
  notMocked();
}
export async function shareAsync(
  _url: string,
  _options?: { mimeType?: string; UTI?: string; dialogTitle?: string },
): Promise<void> {
  notMocked();
}
