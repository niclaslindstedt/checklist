import { describe, expect, it } from "vitest";

import { createDevSeedAdapter } from "../../src/storage/dev-seed/index.ts";
import { parse } from "../../src/storage/serialize.ts";

describe("createDevSeedAdapter", () => {
  it("loads a non-empty sample document", async () => {
    const adapter = createDevSeedAdapter();
    const stored = await adapter.load();
    expect(stored).not.toBeNull();
    const doc = parse(stored!.text);
    expect(doc.checklists.length).toBeGreaterThan(0);
    expect(doc.templates.length).toBeGreaterThan(0);
  });

  it("never advertises the synchronous fast path", () => {
    const adapter = createDevSeedAdapter();
    expect(adapter.capabilities.has("loadSync")).toBe(false);
    expect(adapter.loadSync).toBeUndefined();
  });

  it("round-trips edits in memory without persisting", async () => {
    const adapter = createDevSeedAdapter();
    await adapter.save('{"templates":[],"checklists":[]}\n');
    const reloaded = await adapter.load();
    expect(parse(reloaded!.text).checklists).toHaveLength(0);

    // A fresh adapter is back to the pristine seed — nothing leaked out.
    const fresh = await createDevSeedAdapter().load();
    expect(parse(fresh!.text).checklists.length).toBeGreaterThan(0);
  });
});
