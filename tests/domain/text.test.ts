import { describe, expect, it } from "vitest";

import { capitalizeFirst } from "../../src/domain/text.ts";

describe("capitalizeFirst", () => {
  it("uppercases the first letter", () => {
    expect(capitalizeFirst("buy milk")).toBe("Buy milk");
  });

  it("leaves the rest of the title untouched", () => {
    // Only the first letter changes — an intentional camel-cased word later in
    // the title survives.
    expect(capitalizeFirst("get an iPad")).toBe("Get an iPad");
  });

  it("is a no-op on an already-capitalised title", () => {
    expect(capitalizeFirst("Buy milk")).toBe("Buy milk");
  });

  it("returns an empty string unchanged", () => {
    expect(capitalizeFirst("")).toBe("");
  });

  it("handles non-ASCII first letters", () => {
    expect(capitalizeFirst("åka skidor")).toBe("Åka skidor");
  });

  it("does not split an astral first character", () => {
    // A leading emoji has no uppercase form, so the string is returned intact
    // rather than mangled by a naive charAt(0) slice.
    expect(capitalizeFirst("🎉 party")).toBe("🎉 party");
  });
});
