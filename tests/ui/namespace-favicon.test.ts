// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  applyFaviconHref,
  namespaceFaviconSrc,
} from "../../src/ui/namespace-favicon.ts";

afterEach(() => {
  document.head.innerHTML = "";
});

describe("namespaceFaviconSrc", () => {
  it("uses the background-less bundled mark when no namespace is active", () => {
    const src = namespaceFaviconSrc(undefined);
    expect(src).toContain("favicon-mark.svg");
    expect(src).not.toContain("favicon.svg");
  });

  it("uses the background-less mark for a namespace with only a colour", () => {
    expect(
      namespaceFaviconSrc({ slug: "x", name: "X", color: "#abcdef" }),
    ).toContain("favicon-mark.svg");
  });

  it("renders the glyph as a data URI when one is chosen", () => {
    const src = namespaceFaviconSrc({
      slug: "x",
      name: "X",
      glyph: "home",
      color: "#abcdef",
    });
    expect(src.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(src)).toContain('stroke="#abcdef"');
  });
});

describe("applyFaviconHref", () => {
  it("reuses the existing svg icon link, creating one if absent", () => {
    applyFaviconHref("data:image/svg+xml,first");
    const links = document.head.querySelectorAll(
      'link[rel="icon"][type="image/svg+xml"]',
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("data:image/svg+xml,first");

    // A second call updates the same link rather than appending another.
    applyFaviconHref("data:image/svg+xml,second");
    expect(
      document.head.querySelectorAll('link[rel="icon"][type="image/svg+xml"]'),
    ).toHaveLength(1);
    expect(
      document.head
        .querySelector('link[rel="icon"][type="image/svg+xml"]')!
        .getAttribute("href"),
    ).toBe("data:image/svg+xml,second");
  });
});
