import { describe, expect, it } from "vitest";
import { createChecklist } from "../../src/domain/checklists.ts";
import { emptySnapshot, type Snapshot } from "../../src/domain/types.ts";
import { parse, serialize } from "../../src/storage/serialize.ts";

const NOW = "2026-01-01T00:00:00.000Z";

describe("serialize", () => {
  it("round-trips a snapshot", () => {
    const snapshot: Snapshot = {
      templates: [],
      checklists: [createChecklist("c1", "List", NOW)],
    };
    expect(parse(serialize(snapshot))).toEqual(snapshot);
  });

  it("falls back to an empty snapshot on absent or corrupt input", () => {
    expect(parse(null)).toEqual(emptySnapshot());
    expect(parse(undefined)).toEqual(emptySnapshot());
    expect(parse("not json")).toEqual(emptySnapshot());
  });

  it("defaults missing top-level arrays", () => {
    expect(parse("{}")).toEqual(emptySnapshot());
  });
});
