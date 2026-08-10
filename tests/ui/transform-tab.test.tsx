// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";

import type { TransformRule } from "../../src/domain/transforms.ts";
import { defaultSettings } from "../../src/settings/store.ts";
import type { Settings } from "../../src/settings/types.ts";
import { TransformTab } from "../../src/ui/settings/tabs/transform.tsx";

// The Transform settings tab: the rule list, its ordering and switches, and
// the editor modal that writes a rule (with the live preview that is the whole
// point of the dialog).

function rule(over: Partial<TransformRule> = {}): TransformRule {
  return {
    id: "r1",
    pattern: "#(\\d+)",
    caseInsensitive: false,
    kind: "link",
    replacement: "https://example.com/issues/$1",
    label: "",
    mask: "edges",
    enabled: true,
    ...over,
  };
}

function renderTab(transforms: TransformRule[]) {
  const onUpdate = vi.fn();
  const settings: Settings = { ...defaultSettings(), transforms };
  render(<TransformTab settings={settings} onUpdate={onUpdate} />);
  return onUpdate;
}

// The last `transforms` value the tab wrote.
function written(onUpdate: ReturnType<typeof vi.fn>): TransformRule[] {
  const calls = onUpdate.mock.calls;
  return calls[calls.length - 1]![1] as TransformRule[];
}

afterEach(cleanup);

describe("transform tab", () => {
  it("shows an empty state before any rule exists", () => {
    renderTab([]);
    expect(screen.getByText("No transforms yet.")).toBeTruthy();
  });

  it("lists a rule with its pattern, kind, and replacement", () => {
    renderTab([rule()]);
    expect(screen.getByText("#(\\d+)")).toBeTruthy();
    expect(screen.getByText("Link")).toBeTruthy();
    expect(screen.getByText("https://example.com/issues/$1")).toBeTruthy();
  });

  it("shows the mask, not a replacement, for a sensitive rule", () => {
    renderTab([rule({ kind: "sensitive", mask: "last4" })]);
    expect(screen.getByText("Keep the last four — ******4123")).toBeTruthy();
  });

  it("flags a rule whose pattern doesn't compile", () => {
    renderTab([rule({ pattern: "(unclosed" })]);
    expect(screen.getByText("Invalid pattern")).toBeTruthy();
  });

  it("parks a rule without deleting it", () => {
    const onUpdate = renderTab([rule()]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Use “#(\\d+)”" }));
    expect(written(onUpdate)).toHaveLength(1);
    expect(written(onUpdate)[0]?.enabled).toBe(false);
  });

  it("removes a rule", () => {
    const onUpdate = renderTab([rule()]);
    fireEvent.click(screen.getByRole("button", { name: "Remove “#(\\d+)”" }));
    expect(written(onUpdate)).toEqual([]);
  });

  it("reorders rules, and can't move an end rule off the list", () => {
    const onUpdate = renderTab([rule({ id: "a" }), rule({ id: "b" })]);
    const up = screen.getAllByRole("button", { name: /Move .* up/ });
    // The first rule's "up" is disabled; the second's moves it to the top.
    expect((up[0] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(up[1]!);
    expect(written(onUpdate).map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("transform rule editor", () => {
  function openNew() {
    const onUpdate = renderTab([]);
    fireEvent.click(screen.getByRole("button", { name: "Add transform" }));
    return onUpdate;
  }

  function type(label: string | RegExp, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }

  it("refuses to save until the pattern is a valid expression", () => {
    openNew();
    const save = screen.getByRole("button", {
      name: "Save",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    type("Match", "(unclosed");
    expect(
      screen.getByText("That isn't a valid regular expression."),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    type("Match", "#(\\d+)");
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("previews the draft rule against the sample text", () => {
    openNew();
    type("Match", "#(\\d+)");
    type("Address", "https://example.com/issues/$1");
    type("Sample text", "Fix #134 before the demo");
    const link = screen.getByRole("link", { name: "#134" });
    expect(link.getAttribute("href")).toBe("https://example.com/issues/134");
  });

  it("previews a mask, and says so when the sample doesn't match", () => {
    openNew();
    type("Match", "\\d{10}");
    fireEvent.click(screen.getByRole("radio", { name: "Sensitive" }));
    type("Sample text", "Door code 0761234123");
    expect(screen.getByText("076****123")).toBeTruthy();
    type("Sample text", "Door code");
    expect(
      screen.getByText("Nothing in the sample text matches."),
    ).toBeTruthy();
  });

  it("hands the finished rule back to the tab", () => {
    const onUpdate = openNew();
    type("Match", "  #(\\d+)  ");
    type("Address", "https://example.com/issues/$1");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const [saved] = written(onUpdate);
    expect(saved?.pattern).toBe("#(\\d+)");
    expect(saved?.kind).toBe("link");
    expect(saved?.replacement).toBe("https://example.com/issues/$1");
    expect(saved?.enabled).toBe(true);
  });

  it("writes nothing when the editor is cancelled", () => {
    const onUpdate = openNew();
    type("Match", "#(\\d+)");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("inserts a regex building block into the pattern from the helper", () => {
    openNew();
    type("Match", "#");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Insert a regular-expression building block",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /Any digit/ }));
    expect((screen.getByLabelText("Match") as HTMLInputElement).value).toBe(
      "#\\d",
    );
  });
});
