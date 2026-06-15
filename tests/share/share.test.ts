import { describe, expect, it } from "vitest";
import { decodeChecklist, encodeChecklist } from "../../src/share/index.ts";
import type { Checklist } from "../../src/domain/types.ts";

const checklist: Checklist = {
  version: 1,
  id: "c1",
  templateId: "t1",
  name: "Trip",
  items: [{ id: "i1", title: "Passport", required: true, checked: true }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("share", () => {
  it("round-trips a checklist through the fragment payload", async () => {
    const payload = await encodeChecklist(checklist);
    expect(payload).not.toContain("#");
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
    expect(await decodeChecklist(payload)).toEqual(checklist);
  });

  it("tolerates a leading '#' on decode", async () => {
    const payload = await encodeChecklist(checklist);
    expect(await decodeChecklist(`#${payload}`)).toEqual(checklist);
  });
});
