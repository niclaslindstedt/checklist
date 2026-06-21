// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PwaUpdate } from "../../src/pwa/usePwaUpdate.ts";
import { UpdateToast } from "../../src/ui/UpdateToast.tsx";

// Drive the `usePwaUpdate` store from the test. `vi.hoisted` keeps the
// mutable holder available to the hoisted `vi.mock` factory.
const mock = vi.hoisted(() => ({
  value: {
    progress: null,
    needRefresh: false,
    incomingVersion: null,
    reload: vi.fn(),
    dismiss: vi.fn(),
  } as PwaUpdate,
}));

vi.mock("../../src/pwa/usePwaUpdate.ts", () => ({
  usePwaUpdate: () => mock.value,
}));

function setState(patch: Partial<PwaUpdate>) {
  mock.value = { ...mock.value, ...patch };
}

afterEach(() => {
  mock.value = {
    progress: null,
    needRefresh: false,
    incomingVersion: null,
    reload: vi.fn(),
    dismiss: vi.fn(),
  };
});

describe("UpdateToast", () => {
  it("renders nothing until a new build is waiting", () => {
    const { container } = render(<UpdateToast />);
    expect(container.firstChild).toBeNull();
  });

  it("leads with the headline over the incoming version when ready", () => {
    setState({ needRefresh: true, incomingVersion: "1.2.3" });
    render(<UpdateToast />);
    expect(screen.getByText("Update ready")).toBeTruthy();
    expect(screen.getByText("v1.2.3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update" })).toBeTruthy();
  });

  it("omits the version line when the incoming version is unknown", () => {
    setState({ needRefresh: true, incomingVersion: null });
    render(<UpdateToast />);
    expect(screen.getByText("Update ready")).toBeTruthy();
    expect(screen.queryByText(/^v/)).toBeNull();
  });

  it("applies the update and dismisses via their controls", () => {
    const reload = vi.fn();
    const dismiss = vi.fn();
    setState({ needRefresh: true, incomingVersion: "1.2.3", reload, dismiss });
    render(<UpdateToast />);
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss update notice" }),
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
