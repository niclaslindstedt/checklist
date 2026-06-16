import { describe, expect, it } from "vitest";

import { ConflictError, RateLimitError } from "../../src/storage/adapter.ts";
import {
  createDropboxAdapter,
  deleteDropboxNamespace,
  dropboxApiArg,
} from "../../src/storage/dropbox/index.ts";

function argPath(call: Call): string {
  const headers = call.init?.headers as Record<string, string> | undefined;
  return JSON.parse(headers?.["Dropbox-API-Arg"] ?? "{}").path as string;
}

// Minimal `Response` shim. The adapter only ever reads `.status`, `.ok`,
// `.headers.get`, `.json()`, and `.text()`.
function makeResponse(opts: {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}): Response {
  const status = opts.status;
  const body = opts.body ?? "";
  const headers = new Headers(opts.headers ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    headers,
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    },
  } as unknown as Response;
}

type Call = { url: string; init?: RequestInit };

function fakeFetch(handler: (call: Call) => Response): {
  fn: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fn: typeof fetch = (async (
    url: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fn, calls };
}

describe("dropbox adapter", () => {
  it("round-trips revision through save then load", async () => {
    let stored = '{"version":1}';
    let rev = "abc123";
    const { fn } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        rev = "def456";
        stored = (call.init?.body as string) ?? "";
        return makeResponse({ status: 200, body: JSON.stringify({ rev }) });
      }
      if (call.url.includes("/files/download")) {
        return makeResponse({
          status: 200,
          body: stored,
          headers: { "Dropbox-API-Result": JSON.stringify({ rev }) },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });

    const adapter = createDropboxAdapter("token-123", fn);
    const saved = await adapter.save("payload-1");
    expect(saved.revision).toBe("def456");
    expect(saved.text).toBe("payload-1");

    const loaded = await adapter.load();
    expect(loaded).toEqual({ text: "payload-1", revision: "def456" });
  });

  it("getRevision returns the rev from get_metadata without downloading", async () => {
    let downloaded = false;
    const { fn, calls } = fakeFetch((call) => {
      if (call.url.includes("/files/get_metadata")) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ rev: "meta-rev-1" }),
        });
      }
      if (call.url.includes("/files/download")) {
        downloaded = true;
        return makeResponse({ status: 200, body: "{}" });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createDropboxAdapter("token-123", fn);

    expect(await adapter.getRevision!()).toBe("meta-rev-1");
    expect(downloaded).toBe(false);
    expect(calls.some((c) => c.url.includes("/files/get_metadata"))).toBe(true);
    expect(adapter.capabilities.has("getRevision")).toBe(true);
  });

  it("returns null on first load when Dropbox responds 409 not_found", async () => {
    const { fn } = fakeFetch(() =>
      makeResponse({
        status: 409,
        body: JSON.stringify({ error_summary: "path/not_found/" }),
      }),
    );
    const adapter = createDropboxAdapter("token-123", fn);
    expect(await adapter.load()).toBeNull();
  });

  it("throws ConflictError carrying the remote snapshot when save 409s", async () => {
    let firstUpload = true;
    const remoteText = '{"version":1,"remote":true}';
    const remoteRev = "remote-rev";
    const { fn } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        if (firstUpload) {
          firstUpload = false;
          return makeResponse({
            status: 409,
            body: JSON.stringify({ error_summary: "path/conflict/file/" }),
          });
        }
        return makeResponse({
          status: 200,
          body: JSON.stringify({ rev: "x" }),
        });
      }
      if (call.url.includes("/files/download")) {
        return makeResponse({
          status: 200,
          body: remoteText,
          headers: { "Dropbox-API-Result": JSON.stringify({ rev: remoteRev }) },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });

    const adapter = createDropboxAdapter("token-123", fn);
    await expect(
      adapter.save("our-payload", "stale-rev"),
    ).rejects.toMatchObject({
      name: "ConflictError",
      remote: { text: remoteText, revision: remoteRev },
    });
  });

  it("throws RateLimitError with the Retry-After header when save 429s", async () => {
    const { fn } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        return makeResponse({
          status: 429,
          body: '{"error_summary":"too_many_write_operations/"}',
          headers: { "Retry-After": "12" },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createDropboxAdapter("token-123", fn);
    const err = await adapter.save("payload").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfterMs).toBe(12_000);
  });

  it("floors the 429 cooldown when Retry-After is missing", async () => {
    const { fn } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        return makeResponse({
          status: 429,
          body: '{"error_summary":"too_many_write_operations/"}',
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createDropboxAdapter("token-123", fn);
    const err = await adapter.save("payload").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfterMs).toBeGreaterThanOrEqual(5_000);
  });

  it("sets a 1-second debounce so edits coalesce", () => {
    const { fn } = fakeFetch(() => makeResponse({ status: 200, body: "{}" }));
    const adapter = createDropboxAdapter("token-123", fn);
    expect(adapter.saveDebounceMs).toBe(1000);
  });

  it("uses update mode when a baseRevision is supplied", async () => {
    const { fn, calls } = fakeFetch(() =>
      makeResponse({ status: 200, body: JSON.stringify({ rev: "r2" }) }),
    );
    const adapter = createDropboxAdapter("token-123", fn);
    await adapter.save("payload", "r1");
    const uploadCall = calls.find((c) => c.url.includes("/files/upload"));
    const apiArg = JSON.parse(
      (uploadCall?.init?.headers as Record<string, string>)[
        "Dropbox-API-Arg"
      ] ?? "{}",
    );
    expect(apiArg.mode).toEqual({ ".tag": "update", update: "r1" });
    expect(apiArg.update).toBeUndefined();
  });

  it("uses add mode for the very first save", async () => {
    const { fn, calls } = fakeFetch(() =>
      makeResponse({ status: 200, body: JSON.stringify({ rev: "r1" }) }),
    );
    const adapter = createDropboxAdapter("token-123", fn);
    await adapter.save("payload");
    const uploadCall = calls.find((c) => c.url.includes("/files/upload"));
    const apiArg = JSON.parse(
      (uploadCall?.init?.headers as Record<string, string>)[
        "Dropbox-API-Arg"
      ] ?? "{}",
    );
    expect(apiArg.mode).toBe("add");
  });
});

describe("dropbox silent token refresh", () => {
  it("refreshes the access token on 401 and retries the request", async () => {
    let accessToken = "expired-access";
    let refreshCalls = 0;
    const refreshed: string[] = [];
    const { fn } = fakeFetch((call) => {
      if (call.url === "https://api.dropboxapi.com/oauth2/token") {
        refreshCalls += 1;
        const body = (call.init?.body as string) ?? "";
        expect(body).toContain("grant_type=refresh_token");
        accessToken = "fresh-access";
        return makeResponse({
          status: 200,
          body: JSON.stringify({
            access_token: "fresh-access",
            expires_in: 14400,
          }),
        });
      }
      if (call.url.includes("/files/upload")) {
        const auth = (call.init?.headers as Record<string, string>)
          .Authorization;
        if (auth === "Bearer expired-access") {
          return makeResponse({
            status: 401,
            body: JSON.stringify({ error_summary: "expired_access_token/" }),
          });
        }
        expect(auth).toBe(`Bearer ${accessToken}`);
        return makeResponse({
          status: 200,
          body: JSON.stringify({ rev: "after-refresh" }),
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });

    const adapter = createDropboxAdapter(
      {
        accessToken: "expired-access",
        refreshToken: "ref-1",
        onAccessTokenRefreshed: (token) => refreshed.push(token),
      },
      fn,
    );
    const snap = await adapter.save("payload");
    expect(snap.revision).toBe("after-refresh");
    expect(refreshCalls).toBe(1);
    expect(refreshed).toEqual(["fresh-access"]);
  });

  it("surfaces an AuthError when no refresh token is available", async () => {
    const { fn } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        return makeResponse({
          status: 401,
          body: JSON.stringify({ error_summary: "expired_access_token/" }),
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createDropboxAdapter(
      {
        accessToken: "expired-access",
        refreshToken: null,
        onAccessTokenRefreshed: () => {},
      },
      fn,
    );
    await expect(adapter.save("payload")).rejects.toThrow(/401/);
  });
});

describe("dropboxApiArg header encoding", () => {
  it("leaves pure-ASCII argument structs byte-for-byte equal to JSON", () => {
    const arg = { path: "/checklist.json", mute: true };
    expect(dropboxApiArg(arg)).toBe(JSON.stringify(arg));
  });

  it("escapes every code point above U+007F to \\uXXXX", () => {
    const arg = { path: "/Café — Brontë's 🧾.json" };
    const encoded = dropboxApiArg(arg);
    expect([...encoded].every((ch) => ch.charCodeAt(0) < 0x80)).toBe(true);
    expect(() => new Headers({ "Dropbox-API-Arg": encoded })).not.toThrow();
    expect(JSON.parse(encoded)).toEqual(arg);
  });
});

describe("dropbox namespaces", () => {
  it("writes a namespace's document into its own folder", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ rev: "r1" }),
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createDropboxAdapter("token", fn, "family");
    await adapter.save("payload");
    const upload = calls.find((c) => c.url.includes("/files/upload"))!;
    expect(argPath(upload)).toBe("/family/checklist.json");
  });

  it("migrates the legacy root document into the default folder on first load", async () => {
    const legacyText = '{"version":1,"legacy":true}';
    let moved = false;
    const { fn, calls } = fakeFetch((call) => {
      if (call.url.includes("/files/download")) {
        const path = argPath(call);
        if (path === "/default/checklist.json") {
          if (!moved) {
            return makeResponse({
              status: 409,
              body: JSON.stringify({ error_summary: "path/not_found/" }),
            });
          }
          return makeResponse({ status: 200, body: legacyText });
        }
        if (path === "/checklist.json") {
          return makeResponse({
            status: 200,
            body: legacyText,
            headers: {
              "Dropbox-API-Result": JSON.stringify({ rev: "legacy" }),
            },
          });
        }
      }
      if (call.url.includes("/files/move_v2")) {
        moved = true;
        return makeResponse({
          status: 200,
          body: JSON.stringify({ metadata: { rev: "moved-rev" } }),
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });

    const adapter = createDropboxAdapter("token", fn); // default namespace
    const loaded = await adapter.load();
    expect(loaded).toEqual({ text: legacyText, revision: "moved-rev" });
    expect(calls.some((c) => c.url.includes("/files/move_v2"))).toBe(true);
  });

  it("never probes the legacy document for a non-default namespace", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (call.url.includes("/files/download")) {
        return makeResponse({
          status: 409,
          body: JSON.stringify({ error_summary: "path/not_found/" }),
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createDropboxAdapter("token", fn, "family");
    expect(await adapter.load()).toBeNull();
    const downloads = calls.filter((c) => c.url.includes("/files/download"));
    expect(downloads).toHaveLength(1);
    expect(argPath(downloads[0]!)).toBe("/family/checklist.json");
  });

  it("deletes a namespace's whole folder", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (call.url.includes("/files/delete_v2")) {
        return makeResponse({ status: 200, body: "{}" });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    await deleteDropboxNamespace("token", "family", fn);
    const del = calls.find((c) => c.url.includes("/files/delete_v2"))!;
    expect(JSON.parse(del.init?.body as string).path).toBe("/family");
  });
});

describe("ConflictError integration with dropbox", () => {
  it("the thrown error is detected by instanceof ConflictError", async () => {
    const { fn } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        return makeResponse({
          status: 409,
          body: JSON.stringify({ error_summary: "path/conflict/" }),
        });
      }
      return makeResponse({
        status: 200,
        body: '{"x":1}',
        headers: { "Dropbox-API-Result": JSON.stringify({ rev: "r9" }) },
      });
    });
    const adapter = createDropboxAdapter("token", fn);
    await expect(adapter.save("text", "rev-old")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
