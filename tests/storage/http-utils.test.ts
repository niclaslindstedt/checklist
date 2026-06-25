import { describe, expect, it, vi } from "vitest";

import type { Logger } from "../../src/dev/logger.ts";
import {
  bearerAuthHeader,
  createRequestLog,
  describeError,
  parseRetryAfterMs,
  readErrorBody,
  requestLabel,
} from "../../src/storage/http-utils.ts";

function fakeLogger(): {
  log: Logger;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  return { log: { info, warn, error }, info, warn, error };
}

// Read the single-string argument of a mocked logger call.
function lineOf(call: unknown[] | undefined): string {
  return String(call?.[0]);
}

describe("bearerAuthHeader", () => {
  it("builds an RFC 6750 Authorization header from a token", () => {
    expect(bearerAuthHeader("abc123")).toEqual({
      Authorization: "Bearer abc123",
    });
  });

  it("spreads cleanly alongside other request headers", () => {
    expect({
      ...bearerAuthHeader("tok"),
      "Content-Type": "application/json",
    }).toEqual({
      Authorization: "Bearer tok",
      "Content-Type": "application/json",
    });
  });
});

describe("requestLabel", () => {
  it("reduces a URL to its host and path", () => {
    expect(
      requestLabel("https://api.dropboxapi.com/2/files/download?foo=bar"),
    ).toBe("api.dropboxapi.com/2/files/download");
  });

  it("omits the query string and any access token", () => {
    expect(
      requestLabel(
        "https://www.googleapis.com/drive/v3/files?access_token=s3cret",
      ),
    ).toBe("www.googleapis.com/drive/v3/files");
  });

  it("falls back to the raw string when the URL can't be parsed", () => {
    expect(requestLabel("not a url")).toBe("not a url");
  });
});

describe("describeError", () => {
  it("formats an Error as Name: message", () => {
    expect(describeError(new TypeError("Load failed"))).toBe(
      "TypeError: Load failed",
    );
  });

  it("stringifies a non-Error throw", () => {
    expect(describeError("boom")).toBe("boom");
    expect(describeError(42)).toBe("42");
  });
});

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

describe("createRequestLog", () => {
  const url = "https://api.dropboxapi.com/2/files/download?foo=bar";

  it("attempt returns the response untouched on success", async () => {
    const { log, warn } = fakeLogger();
    const res = new Response("ok");
    const rlog = createRequestLog(log, url);
    await expect(rlog.attempt(() => Promise.resolve(res))).resolves.toBe(res);
    expect(warn).not.toHaveBeenCalled();
  });

  it("attempt logs a throw with the labelled endpoint and rethrows", async () => {
    const { log, warn } = fakeLogger();
    const rlog = createRequestLog(log, url);
    await expect(
      rlog.attempt(() => Promise.reject(new TypeError("Load failed"))),
    ).rejects.toThrow("Load failed");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(lineOf(warn.mock.calls[0])).toMatch(
      /^api\.dropboxapi\.com\/2\/files\/download threw after \d+ms: TypeError: Load failed$/,
    );
  });

  it("attempt threads a note into the throw line for a follow-up attempt", async () => {
    const { log, warn } = fakeLogger();
    const rlog = createRequestLog(log, url);
    await expect(
      rlog.attempt(() => Promise.reject(new Error("nope")), " (post-refresh)"),
    ).rejects.toThrow("nope");
    expect(lineOf(warn.mock.calls[0])).toMatch(
      /threw after \d+ms \(post-refresh\): Error: nope$/,
    );
  });

  it("logStatus logs at info for an ok response and returns it", () => {
    const { log, info, warn } = fakeLogger();
    const res = new Response("body", { status: 200 });
    const rlog = createRequestLog(log, url);
    expect(rlog.logStatus(res)).toBe(res);
    expect(info).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(lineOf(info.mock.calls[0])).toMatch(
      /^api\.dropboxapi\.com\/2\/files\/download → 200 \(\d+ms\)$/,
    );
  });

  it("logStatus logs at warn for a non-ok response", () => {
    const { log, info, warn } = fakeLogger();
    const rlog = createRequestLog(log, url);
    rlog.logStatus(new Response("nope", { status: 500 }));
    expect(info).not.toHaveBeenCalled();
    expect(lineOf(warn.mock.calls[0])).toMatch(/→ 500 \(\d+ms\)$/);
  });

  it("prefixes the label with a caller override", () => {
    const { log, info } = fakeLogger();
    const rlog = createRequestLog(log, url, "download checklists/x.md");
    rlog.logStatus(new Response("", { status: 200 }));
    expect(lineOf(info.mock.calls[0])).toMatch(
      /^api\.dropboxapi\.com\/2\/files\/download download checklists\/x\.md → 200/,
    );
  });
});
