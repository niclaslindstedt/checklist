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
});
