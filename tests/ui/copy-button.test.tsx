// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";

import type { Checklist, ChecklistItem } from "../../src/domain/types.ts";
import { CopyButton } from "../../src/ui/CopyButton.tsx";
import { ToastProvider } from "../../src/ui/toast/Toast.tsx";

function list(items: ChecklistItem[]): Checklist {
  return {
    version: 1,
    id: "cl-1",
    templateId: "",
    name: "Shopping",
    items,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

const FLAT: ChecklistItem[] = [
  { id: "a", title: "Batteries", checked: false },
  { id: "b", title: "Stamps", checked: true },
];

const GROUPED: ChecklistItem[] = [
  {
    id: "produce",
    title: "Produce",
    checked: false,
    category: true,
    children: [
      { id: "p1", title: "Apples", checked: false },
      { id: "p2", title: "Carrots", checked: true },
    ],
  },
  {
    id: "dairy",
    title: "Dairy",
    checked: false,
    category: true,
    children: [{ id: "d1", title: "Milk", checked: false }],
  },
  { id: "loose", title: "Batteries", checked: false },
];

function renderButton(checklist: Checklist, includeArchived = false) {
  return render(
    <ToastProvider>
      <CopyButton checklist={checklist} includeArchived={includeArchived} />
    </ToastProvider>,
  );
}

// The clipboard write is awaited inside the click handler, so the assertions
// need one microtask turn to see it.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("CopyButton", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies the whole list in one tap when it has no categories", async () => {
    renderButton(list(FLAT));
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-haspopup")).toBeNull();
    fireEvent.click(trigger);
    await flush();
    expect(writeText).toHaveBeenCalledWith(
      "# Shopping\n\n- [ ] Batteries\n- [x] Stamps\n",
    );
    // No menu is offered — there is nothing to choose between.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("never puts the *(category)* marker on the clipboard", async () => {
    renderButton(list(GROUPED));
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitem", { name: "All" }));
    await flush();
    expect(writeText.mock.calls[0]![0]).not.toContain("(category)");
    expect(writeText.mock.calls[0]![0]).toContain("- [ ] Produce\n");
  });

  it("opens an All + per-category menu on a grouped list", () => {
    renderButton(list(GROUPED));
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.click(trigger);
    const items = screen
      .getAllByRole("menuitem")
      .map((el) => el.textContent?.trim());
    expect(items).toEqual(["All", "Produce", "Dairy"]);
  });

  it("copies just one category's children, without its header", async () => {
    renderButton(list(GROUPED));
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Produce" }));
    await flush();
    expect(writeText).toHaveBeenCalledWith(
      "# Shopping\n\n- [ ] Apples\n- [x] Carrots\n",
    );
  });

  it("closes the menu once a scope is chosen", async () => {
    renderButton(list(GROUPED));
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Dairy" }));
    await flush();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("skips a category that has been archived away", () => {
    renderButton(
      list([
        { ...GROUPED[0]!, archived: true },
        GROUPED[1]!,
        { id: "loose", title: "Batteries", checked: false },
      ]),
    );
    fireEvent.click(screen.getByRole("button"));
    expect(
      screen.getAllByRole("menuitem").map((el) => el.textContent?.trim()),
    ).toEqual(["All", "Dairy"]);
  });

  it("reports a failed clipboard write instead of claiming success", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    // jsdom implements neither the async clipboard nor `execCommand`, so both
    // legs of the best-effort write have to be stubbed to fail.
    Object.defineProperty(document, "execCommand", {
      value: () => false,
      configurable: true,
    });
    renderButton(list(FLAT));
    fireEvent.click(screen.getByRole("button"));
    await flush();
    expect(screen.getByText("Couldn't copy to the clipboard")).toBeTruthy();
  });
});
