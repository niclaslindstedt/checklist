import { describe, expect, it } from "vitest";

import { resolveActiveEditor } from "../../src/ui/activeEditor.ts";

describe("resolveActiveEditor", () => {
  it("sets the id when a row opens its editor", () => {
    expect(resolveActiveEditor(null, "a", true)).toBe("a");
  });

  it("clears the id when the active row closes", () => {
    expect(resolveActiveEditor("a", "a", false)).toBeNull();
  });

  it("ignores a close from a row that isn't the active one", () => {
    // The trailing close of the row editing was just left, after editing has
    // already moved on — must not clear the new row's id.
    expect(resolveActiveEditor("b", "a", false)).toBe("b");
  });

  it("keeps the new row active across a switch, even when the old one closes last", () => {
    // Replays tapping row "b" while editing row "a", in the real-browser order:
    // "b" opens first (its editor takes focus), then "a" commits and closes a
    // beat later. The id must end on "b", not flash back to null.
    let id: string | null = null;
    id = resolveActiveEditor(id, "a", true); // editing a
    expect(id).toBe("a");
    id = resolveActiveEditor(id, "b", true); // b's editor opens (claims it)
    expect(id).toBe("b");
    id = resolveActiveEditor(id, "a", false); // a's trailing commit/close
    expect(id).toBe("b");
  });
});
