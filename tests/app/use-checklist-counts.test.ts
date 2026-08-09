// @vitest-environment jsdom
// The two item counts the composer hook derives — the header's checked /
// total tally and the sidebar switcher's "remaining" badge. The interesting
// case is a **categorised** list: a category header is a grouping label rather
// than a line of work, so by default it stays out of both counts — and the
// "Count categories" preference puts it back in both.
import { act, renderHook, waitFor } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

import {
  addItem,
  createChecklist,
  setCategory,
} from "../../src/domain/checklists.ts";
import { emptySnapshot } from "../../src/domain/types.ts";
import { useChecklist } from "../../src/app/use-checklist.ts";
import type {
  StorageAdapter,
  StoredSnapshot,
} from "../../src/storage/adapter.ts";
import { serialize } from "../../src/storage/serialize.ts";

const NOW = "2026-01-01T00:00:00.000Z";

// "ICA" grouping Milk and Bread, plus a loose item — four lines in the tree,
// three of which are real work.
function groupedSnapshot() {
  let c = createChecklist("c1", "Groceries", NOW);
  c = addItem(c, { id: "cat", title: "ICA" }, NOW);
  c = addItem(c, { id: "milk", title: "Milk" }, NOW, "bottom", "cat");
  c = addItem(c, { id: "bread", title: "Bread" }, NOW, "bottom", "cat");
  c = addItem(c, { id: "loose", title: "Batteries" }, NOW);
  c = setCategory(c, "cat", true, NOW);
  return { ...emptySnapshot(), checklists: [c] };
}

function seededAdapter(): StorageAdapter {
  const text = serialize(groupedSnapshot());
  return {
    id: "browser",
    label: "mem",
    capabilities: new Set(["loadSync"]),
    loadSync: (): StoredSnapshot => ({ text, revision: "1" }),
    load: async (): Promise<StoredSnapshot> => ({ text, revision: "1" }),
    save: async (next: string) => ({ text: next, revision: "2" }),
    saveDebounceMs: 0,
  };
}

// `useChecklist(adapter, addItemPosition, notify, sortCheckedToBottom,
// namespace, countCategories)` — only the first and last matter here.
function renderCounts(countCategories: boolean) {
  return renderHook(() =>
    useChecklist(
      seededAdapter(),
      "bottom",
      undefined,
      false,
      undefined,
      countCategories,
    ),
  );
}

describe("useChecklist header counts", () => {
  it("leaves category headers out of the tally by default", async () => {
    const { result } = renderCounts(false);
    await act(async () => {});
    expect(result.current.visibleCount).toBe(3);
    expect(result.current.checkedCount).toBe(0);
  });

  it("finishes a grouped list at n/n once its real items are checked", async () => {
    const { result } = renderCounts(false);
    await act(async () => {});
    act(() => {
      result.current.checkAll();
    });
    // Check-all ticks the header too, but the header isn't counted — so the
    // fraction reads 3/3 rather than stalling at 3/4.
    expect(result.current.checkedCount).toBe(3);
    expect(result.current.visibleCount).toBe(3);
  });

  it("counts the headers when the preference is on", async () => {
    const { result } = renderCounts(true);
    await act(async () => {});
    expect(result.current.visibleCount).toBe(4);
    act(() => {
      result.current.toggle("cat");
    });
    // Toggling the header cascades to its two children: three of four.
    expect(result.current.checkedCount).toBe(3);
  });
});

// The sidebar switcher badges each list with how many items are still
// outstanding. It has to follow the same rule as the header, or a list the
// header calls finished still wears a badge for its category headers.
describe("side-menu remaining badge", () => {
  it("leaves category headers out of the badge by default", async () => {
    const { result } = renderCounts(false);
    await act(async () => {});
    expect(result.current.checklists[0]!.remaining).toBe(3);
  });

  it("clears the badge once the real items are checked", async () => {
    const { result } = renderCounts(false);
    await act(async () => {});
    act(() => {
      result.current.checkAll();
    });
    await waitFor(() =>
      expect(result.current.checklists[0]!.remaining).toBe(0),
    );
  });

  it("counts the headers when the preference is on", async () => {
    const { result } = renderCounts(true);
    await act(async () => {});
    expect(result.current.checklists[0]!.remaining).toBe(4);
  });
});
