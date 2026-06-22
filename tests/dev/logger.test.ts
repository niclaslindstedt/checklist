import { afterEach, describe, expect, it } from "vitest";

import {
  clearLogs,
  createLogger,
  getLogs,
  setCaptureEnabled,
  setDevModeEnabled,
} from "../../src/dev/logger.ts";

// Logging is a developer-only diagnostic: a push only records while
// developer mode or capture is on. With both off (a regular user) the
// logger is a no-op, so nothing accumulates in the buffer.

afterEach(() => {
  setDevModeEnabled(false);
  setCaptureEnabled(false);
  clearLogs();
});

describe("logger gating", () => {
  it("records nothing when developer mode and capture are both off", () => {
    const log = createLogger("dropbox");
    log.info("save start");
    log.error("save failed");
    expect(getLogs()).toEqual([]);
  });

  it("records when developer mode is on, even with capture off", () => {
    setDevModeEnabled(true);
    const log = createLogger("gdrive");
    log.info("load start");
    expect(getLogs().map((e) => e.message)).toContain("load start");
  });

  it("records when capture is on", () => {
    setCaptureEnabled(true);
    const log = createLogger("checklist");
    log.warn("nearing quota");
    expect(getLogs().map((e) => e.message)).toContain("nearing quota");
  });

  it("falls back to a no-op once both flags are turned off again", () => {
    setDevModeEnabled(true);
    const log = createLogger("dropbox");
    log.info("while on");
    setDevModeEnabled(false);
    log.info("while off");
    const messages = getLogs().map((e) => e.message);
    expect(messages).toContain("while on");
    expect(messages).not.toContain("while off");
  });
});
