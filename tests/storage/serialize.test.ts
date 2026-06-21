import { describe, expect, it } from "vitest";
import { createChecklist } from "../../src/domain/checklists.ts";
import { emptySnapshot, type Snapshot } from "../../src/domain/types.ts";
import {
  parse,
  parseFolders,
  serialize,
  serializeFolders,
} from "../../src/storage/serialize.ts";

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

  it("falls back to empty when a newer-version document fails migration", () => {
    // A document written by a future build carries a version past
    // LATEST_VERSION; the migration chain throws and `parse` must degrade
    // to an empty document rather than crashing the load.
    const fromTheFuture = JSON.stringify({
      version: 999,
      templates: [{ id: "t1" }],
      checklists: [],
    });
    expect(parse(fromTheFuture)).toEqual(emptySnapshot());
  });

  it("stamps the latest version onto serialized output", () => {
    const text = serialize(emptySnapshot());
    expect(JSON.parse(text).version).toBe(1);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("round-trips a folder registry through serialize / parse", () => {
    const snap = {
      templates: [],
      checklists: [],
      folders: [{ id: "f1", name: "Work", createdAt: "2026-01-01T00:00:00Z" }],
    };
    expect(parse(serialize(snap)).folders).toEqual(snap.folders);
  });

  it("omits an empty folder registry rather than writing folders: []", () => {
    const snap = parse(serialize(emptySnapshot()));
    expect("folders" in snap).toBe(false);
  });

  it("drops malformed folder entries and duplicate ids defensively", () => {
    const text = JSON.stringify({
      version: 1,
      templates: [],
      checklists: [],
      folders: [
        { id: "f1", name: "Keep", createdAt: "2026-01-01T00:00:00Z" },
        { id: "f1", name: "Dup", createdAt: "2026-01-02T00:00:00Z" },
        { name: "No id", createdAt: "x" },
        "garbage",
      ],
    });
    expect(parse(text).folders).toEqual([
      { id: "f1", name: "Keep", createdAt: "2026-01-01T00:00:00Z" },
    ]);
  });

  it("parseFolders / serializeFolders validate a standalone sidecar", () => {
    const folders = [
      { id: "f1", name: "X", createdAt: "2026-01-01T00:00:00Z" },
    ];
    expect(parseFolders(JSON.parse(serializeFolders(folders)))).toEqual(
      folders,
    );
    expect(parseFolders("nope")).toEqual([]);
  });
});
