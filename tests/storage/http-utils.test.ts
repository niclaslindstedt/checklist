import { describe, expect, it } from "vitest";

import {
  parseRetryAfterMs,
  readErrorBody,
} from "../../src/storage/http-utils.ts";

describe("parseRetryAfterMs", () => {
  it("converts a delta-seconds header to milliseconds", () => {
    expect(parseRetryAfterMs(new Headers({ "Retry-After": "12" }), 5000)).toBe(
      12_000,
    );
  });

  it("falls back when the header is absent", () => {
    expect(parseRetryAfterMs(new Headers(), 5000)).toBe(5000);
  });

  it("falls back when the header is a non-numeric HTTP-date", () => {
    const headers = new Headers({
      "Retry-After": "Wed, 21 Oct 2099 07:28:00 GMT",
    });
    expect(parseRetryAfterMs(headers, 5000)).toBe(5000);
  });

  it("clamps below the fallback floor", () => {
    expect(parseRetryAfterMs(new Headers({ "Retry-After": "1" }), 5000)).toBe(
      5000,
    );
  });

  it("handles an undefined headers bag", () => {
    expect(parseRetryAfterMs(undefined, 5000)).toBe(5000);
  });
});

describe("readErrorBody", () => {
  it("returns the response text when readable", async () => {
    expect(await readErrorBody(new Response("boom"))).toBe("boom");
  });

  it("falls back to a placeholder when the body can't be read", async () => {
    const res = {
      text: () => Promise.reject(new Error("already consumed")),
    } as unknown as Response;
    expect(await readErrorBody(res)).toBe("<unreadable>");
  });
});
