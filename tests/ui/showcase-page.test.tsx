// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { ShowcasePage } from "../../src/ui/ShowcasePage.tsx";

// The `/home` showcase is the page linked as the OAuth "app homepage": it must
// stand on its own (no login, no app state) and meet Google's requirements —
// identify the app, describe what it does, explain why it requests data, and
// link to the privacy policy.

describe("ShowcasePage", () => {
  it("identifies the app with a top-level heading", () => {
    render(<ShowcasePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "checklist" }),
    ).toBeTruthy();
  });

  it("describes what the app does", () => {
    render(<ShowcasePage />);
    // A few of the headline capabilities the page must spell out.
    expect(screen.getByText(/What you can do with it/i)).toBeTruthy();
    expect(screen.getByText(/Reuse templates/i)).toBeTruthy();
    expect(screen.getByText(/works offline/i)).toBeTruthy();
  });

  it("explains why it requests access and the narrow scope used", () => {
    render(<ShowcasePage />);
    expect(
      screen.getByRole("heading", {
        name: /why the app asks for access/i,
      }),
    ).toBeTruthy();
    expect(screen.getAllByText(/Google Drive/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dropbox/).length).toBeGreaterThan(0);
    expect(screen.getByText(/app-specific folder/i)).toBeTruthy();
    expect(
      screen.getByText(/only if you choose to turn on cloud sync/i),
    ).toBeTruthy();
  });

  it("links to the privacy policy under the current base path", () => {
    render(<ShowcasePage />);
    const privacyLinks = screen
      .getAllByRole("link", { name: /privacy/i })
      .map((a) => a.getAttribute("href"));
    expect(privacyLinks.some((href) => href === "/privacy/")).toBe(true);
  });

  it("offers a way into the app without any login", () => {
    render(<ShowcasePage />);
    const open = screen.getByRole("link", { name: /open the app/i });
    expect(open.getAttribute("href")).toBe("/");
    // No credential entry on the homepage at all.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(within(document.body).queryByText(/password/i)).toBeNull();
  });
});
