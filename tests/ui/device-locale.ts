import { vi } from "vitest";

// Pretend the device runs in `tag` ("en-US", "en-GB", …). The app's English
// takes its date formats, clock and week start from the device
// (`bcp47` in `src/i18n/locale.ts`), so a test that asserts a formatted
// date names the device it expects. `vi.restoreAllMocks()` undoes it.
export function stubDeviceLocale(tag: string): void {
  vi.spyOn(window.navigator, "language", "get").mockReturnValue(tag);
}
