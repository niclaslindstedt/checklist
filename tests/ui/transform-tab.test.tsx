// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";

import type {
  TransformRule,
  TransformRules,
} from "../../src/domain/transforms.ts";
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

const WORK = { slug: "work", name: "Work" };
const HOME = { slug: "home", name: "Home" };

// The tab as a single-namespace user sees it: no picker, one list of rules.
function renderTab(transforms: TransformRule[]) {
  return renderTabIn({ work: transforms }, [WORK], "work");
}

// The tab with several namespaces around, opened on `activeNamespace`.
function renderTabIn(
  transforms: TransformRules,
  namespaces: { slug: string; name: string }[],
  activeNamespace: string,
) {
  const onUpdate = vi.fn();
  const settings: Settings = { ...defaultSettings(), transforms };
  render(
    <TransformTab
      settings={settings}
      onUpdate={onUpdate}
      namespaces={namespaces}
      activeNamespace={activeNamespace}
    />,
  );
  return onUpdate;
}

// The last transform map the tab wrote.
function writtenMap(onUpdate: ReturnType<typeof vi.fn>): TransformRules {
  const calls = onUpdate.mock.calls;
  return calls[calls.length - 1]![1] as TransformRules;
}

// The last rule list the tab wrote for `slug`.
function written(
  onUpdate: ReturnType<typeof vi.fn>,
  slug = "work",
): TransformRule[] {
  return writtenMap(onUpdate)[slug] ?? [];
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

describe("transform tab — namespace scoping", () => {
  it("hides the namespace picker when there's only one namespace", () => {
    renderTab([rule()]);
    expect(screen.queryByRole("combobox", { name: "Rules for" })).toBeNull();
  });

  it("opens on the active namespace's rules and leaves the others off screen", () => {
    renderTabIn(
      {
        work: [rule({ pattern: "#(\\d+)" })],
        home: [rule({ pattern: "milk" })],
      },
      [WORK, HOME],
      "work",
    );
    expect(screen.getByText("#(\\d+)")).toBeTruthy();
    expect(screen.queryByText("milk")).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Rules for" }).textContent,
    ).toContain("Work");
  });

  it("writes a rule into the namespace on screen, leaving the rest untouched", () => {
    const onUpdate = renderTabIn(
      { work: [rule({ id: "w" })], home: [rule({ id: "h" })] },
      [WORK, HOME],
      "work",
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove “#(\\d+)”" }));
    expect(writtenMap(onUpdate)).toEqual({ home: [rule({ id: "h" })] });
  });

  it("switches to another namespace's rules and edits those instead", () => {
    const onUpdate = renderTabIn(
      { work: [rule({ id: "w" })], home: [rule({ id: "h", pattern: "milk" })] },
      [WORK, HOME],
      "work",
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Rules for" }));
    fireEvent.click(screen.getByRole("option", { name: /Home/ }));

    expect(screen.getByText("milk")).toBeTruthy();
    expect(screen.queryByText("#(\\d+)")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove “milk”" }));
    expect(writtenMap(onUpdate)).toEqual({ work: [rule({ id: "w" })] });
  });

  it("starts a namespace with no rules of its own from empty", () => {
    const onUpdate = renderTabIn({ work: [rule()] }, [WORK, HOME], "home");
    expect(screen.getByText("No transforms yet.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add transform" }));
    fireEvent.change(screen.getByLabelText("Match"), {
      target: { value: "milk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const map = writtenMap(onUpdate);
    expect(map.home?.map((r) => r.pattern)).toEqual(["milk"]);
    expect(map.work).toHaveLength(1);
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
