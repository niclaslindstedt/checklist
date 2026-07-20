import { describe, expect, it } from "vitest";

import {
  foregroundServerAction,
  type LiveServer,
} from "../../native/src/serverRecovery.ts";

const alive = (origin: string | null): LiveServer => ({ alive: true, origin });
const dead: LiveServer = { alive: false, origin: null };

describe("foregroundServerAction", () => {
  it("leaves an in-flight start alone", () => {
    // A second start would trip the library's one-instance-per-process rule.
    expect(foregroundServerAction("starting", dead, null)).toBe("none");
    expect(
      foregroundServerAction("starting", alive("http://localhost:8791"), null),
    ).toBe("none");
  });

  it("retries a failed boot", () => {
    // A transient port clash on cold start recovers on the next foreground.
    expect(foregroundServerAction("failed", dead, null)).toBe("restart");
    // Even if a server has since become active, a failed hook state re-runs the
    // start sequence, which reuses that active instance.
    expect(
      foregroundServerAction("failed", alive("http://localhost:8791"), null),
    ).toBe("restart");
  });

  it("restarts a ready server whose socket iOS tore down in the background", () => {
    expect(foregroundServerAction("ready", dead, "http://localhost:8791")).toBe(
      "restart",
    );
  });

  it("does nothing when the ready server is still on the same origin", () => {
    expect(
      foregroundServerAction(
        "ready",
        alive("http://localhost:8791"),
        "http://localhost:8791",
      ),
    ).toBe("none");
  });

  it("resyncs when the live server was rebound to a new port", () => {
    // The origin we hold is stale; adopt the live one and reload onto it.
    expect(
      foregroundServerAction(
        "ready",
        alive("http://localhost:8792"),
        "http://localhost:8791",
      ),
    ).toBe("resync");
  });

  it("does not resync a ready server against an unknown live origin", () => {
    // No running instance to read a port from: fall back to restart, not a
    // resync onto a null origin.
    expect(foregroundServerAction("ready", dead, "http://localhost:8791")).toBe(
      "restart",
    );
  });
});
