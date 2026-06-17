import { describe, expect, it } from "vitest";

import { fromBase64Url, toBase64Url } from "../../src/encoding/base64url.ts";

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 63, 62]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  it("emits the URL-safe alphabet with padding stripped", () => {
    // 0xff,0xff is "//8=" in standard base64 → "__8" once URL-safe and
    // de-padded, so it exercises both substitutions and the `=` strip.
    const encoded = toBase64Url(new Uint8Array([0xff, 0xff]));
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encoded).toBe("__8");
  });

  it("decodes a padding-stripped url-safe string", () => {
    expect(fromBase64Url("__8")).toEqual(new Uint8Array([0xff, 0xff]));
  });

  it("round-trips the empty input", () => {
    expect(toBase64Url(new Uint8Array())).toBe("");
    expect(fromBase64Url("")).toEqual(new Uint8Array());
  });
});
