// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AddItemForm } from "../../src/ui/AddItemForm.tsx";

const noop = (): void => {};

function renderForm(over: Partial<Parameters<typeof AddItemForm>[0]> = {}) {
  return render(
    <AddItemForm
      onAdd={noop}
      onAddWithBody={noop}
      onImport={() => 0}
      onClose={noop}
      {...over}
    />,
  );
}

afterEach(cleanup);

describe("AddItemForm", () => {
  it("adds the typed item on Enter", () => {
    const onAdd = vi.fn();
    renderForm({ onAdd });
    const input = screen.getByLabelText("Add item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Buy milk" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("Buy milk");
  });

  // The draft row is focused programmatically right after Enter commits the
  // previous item; on an installed iOS PWA the keyboard keeps that row's shift
  // state unless the capitalise hint is set explicitly, so the next item would
  // start lowercase.
  it("hints the composer to capitalise sentences", () => {
    renderForm();
    const input = screen.getByLabelText("Add item") as HTMLInputElement;
    expect(input.getAttribute("autocapitalize")).toBe("sentences");
  });

  it("leaves the title verbatim when capitalise is off", () => {
    const onAdd = vi.fn();
    renderForm({ onAdd, capitalize: false });
    const input = screen.getByLabelText("Add item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "buy milk" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("buy milk");
  });

  it("capitalises the first letter live and on commit when enabled", () => {
    const onAdd = vi.fn();
    renderForm({ onAdd, capitalize: true });
    const input = screen.getByLabelText("Add item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "buy milk" } });
    // The field shows the capitalised text as you type…
    expect(input.value).toBe("Buy milk");
    // …and the committed item carries it too.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("Buy milk");
  });

  describe("archive typeahead", () => {
    const pool = [
      { title: "Car", count: 1 },
      { title: "Carrots", count: 1 },
      { title: "Bread", count: 1 },
    ];

    function typed(value: string, over: Parameters<typeof renderForm>[0] = {}) {
      const utils = renderForm({ suggestionPool: pool, ...over });
      const input = screen.getByLabelText("Add item") as HTMLInputElement;
      fireEvent.change(input, { target: { value } });
      return { input, ...utils };
    }

    it("suggests matching archived titles while typing", () => {
      typed("car");
      const listbox = screen.getByRole("listbox");
      expect(listbox).toBeTruthy();
      const options = screen.getAllByRole("option");
      expect(options.map((o) => o.textContent)).toEqual(["Car", "Carrots"]);
    });

    it("orders the most-used matching title first", () => {
      renderForm({
        suggestionPool: [
          { title: "Car", count: 1 },
          { title: "Carrots", count: 9 },
        ],
      });
      const input = screen.getByLabelText("Add item") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "car" } });
      const options = screen.getAllByRole("option");
      expect(options.map((o) => o.textContent)).toEqual(["Carrots", "Car"]);
    });

    it("highlights the matched letters", () => {
      typed("car");
      const carrots = screen
        .getAllByRole("option")
        .find((o) => o.textContent === "Carrots")!;
      expect(carrots.querySelector("mark")?.textContent).toBe("Car");
    });

    it("shows nothing for an empty draft or without a pool", () => {
      renderForm({ suggestionPool: pool });
      expect(screen.queryByRole("listbox")).toBeNull();
      cleanup();
      renderForm();
      const input = screen.getByLabelText("Add item") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "car" } });
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("pressing a suggestion adds it verbatim and clears the field", () => {
      const onAdd = vi.fn();
      // Capitalise on: the picked title must keep its stored spelling, not
      // get re-capitalised.
      const { input } = typed("car", { onAdd, capitalize: true });
      const carrots = screen
        .getAllByRole("option")
        .find((o) => o.textContent === "Carrots")!;
      fireEvent.click(carrots.querySelector("button")!);
      expect(onAdd).toHaveBeenCalledWith("Carrots");
      expect(input.value).toBe("");
      // The composer stays open, ready for the next entry.
      expect(screen.getByLabelText("Add item")).toBeTruthy();
    });

    it("arrow keys walk the list and Enter picks the highlighted one", () => {
      const onAdd = vi.fn();
      const { input } = typed("car", { onAdd });
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onAdd).toHaveBeenCalledWith("Carrots");
      expect(input.value).toBe("");
    });

    it("Enter without a highlight commits the raw draft", () => {
      const onAdd = vi.fn();
      const { input } = typed("car", { onAdd });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onAdd).toHaveBeenCalledWith("car");
    });

    it("Escape dismisses the dropdown until the draft changes", () => {
      const { input } = typed("car");
      fireEvent.keyDown(input, { key: "Escape" });
      expect(screen.queryByRole("listbox")).toBeNull();
      fireEvent.change(input, { target: { value: "carr" } });
      expect(screen.getByRole("listbox")).toBeTruthy();
    });
  });
});
