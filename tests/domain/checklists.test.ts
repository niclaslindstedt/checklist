import { describe, expect, it } from "vitest";
import {
  instantiate,
  isComplete,
  progress,
  toggleItem,
} from "../../src/domain/checklists.ts";
import { createTemplate } from "../../src/domain/templates.ts";
import type { Template } from "../../src/domain/types.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function sampleTemplate(): Template {
  return {
    ...createTemplate({ id: "t1", name: "Trip", now: NOW }),
    items: [
      { id: "i1", title: "Passport", required: true },
      { id: "i2", title: "Sunglasses" },
    ],
  };
}

describe("checklists", () => {
  it("instantiates an unchecked copy that points at its template", () => {
    const c = instantiate(sampleTemplate(), "c1", NOW);
    expect(c.templateId).toBe("t1");
    expect(c.items.every((i) => i.checked === false)).toBe(true);
  });

  it("toggles a single item without mutating the source", () => {
    const c = instantiate(sampleTemplate(), "c1", NOW);
    const toggled = toggleItem(c, "i1", NOW);
    expect(c.items[0]?.checked).toBe(false);
    expect(toggled.items[0]?.checked).toBe(true);
    expect(progress(toggled)).toEqual({ checked: 1, total: 2 });
  });

  it("is complete only when all required items are checked", () => {
    const c = instantiate(sampleTemplate(), "c1", NOW);
    expect(isComplete(c)).toBe(false);
    expect(isComplete(toggleItem(c, "i1", NOW))).toBe(true);
  });
});
