import { describe, expect, it } from "vitest";

import { ConflictError } from "../../src/storage/adapter.ts";
import { createGdriveAdapter } from "../../src/storage/gdrive/index.ts";

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

function isSearch(url: string): boolean {
  return (
    url.startsWith("https://www.googleapis.com/drive/v3/files?") &&
    url.includes("q=") &&
    !url.includes("alt=media")
  );
}
function isDownload(url: string): boolean {
  return (
    url.startsWith("https://www.googleapis.com/drive/v3/files/") &&
    url.includes("alt=media")
  );
}
function isMetadata(url: string): boolean {
  return (
    url.startsWith("https://www.googleapis.com/drive/v3/files/") &&
    !url.includes("alt=media") &&
    !url.includes("q=")
  );
}
function isFolderCreate(url: string): boolean {
  return url === "https://www.googleapis.com/drive/v3/files?fields=id";
}
function isCreate(url: string): boolean {
  return url.startsWith(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
  );
}
function isUpdate(url: string): boolean {
  return (
    url.startsWith("https://www.googleapis.com/upload/drive/v3/files/") &&
    url.includes("uploadType=media")
  );
}

describe("gdrive adapter", () => {
  it("returns null on first load when no file matches the search", async () => {
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [] }),
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    expect(await adapter.load()).toBeNull();
  });

  it("getRevision returns the ETag from a metadata GET without downloading", async () => {
    let downloaded = false;
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "file-abc" }] }),
        });
      }
      if (isMetadata(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "file-abc" }),
          headers: { ETag: "etag-meta-1" },
        });
      }
      if (isDownload(call.url)) {
        downloaded = true;
        return makeResponse({ status: 200, body: "{}" });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    expect(await adapter.getRevision!()).toBe("etag-meta-1");
    expect(downloaded).toBe(false);
    expect(adapter.capabilities.has("getRevision")).toBe(true);
  });

  it("loads the snapshot when a matching file exists", async () => {
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "file-abc" }] }),
        });
      }
      if (isDownload(call.url)) {
        return makeResponse({
          status: 200,
          body: '{"version":1}',
          headers: { ETag: '"etag-v1"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    expect(await adapter.load()).toEqual({
      text: '{"version":1}',
      revision: '"etag-v1"',
    });
  });

  it("creates a new file via multipart upload on the first save", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [] }),
        });
      }
      if (isFolderCreate(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "app-folder-id" }),
        });
      }
      if (isCreate(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "new-file-id" }),
        });
      }
      if (isMetadata(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "new-file-id" }),
          headers: { ETag: '"etag-new"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    const saved = await adapter.save("payload-1");
    expect(saved).toEqual({ text: "payload-1", revision: '"etag-new"' });

    const folderCreate = calls.find((c) => isFolderCreate(c.url));
    const folderBody = JSON.parse((folderCreate?.init?.body as string) ?? "{}");
    expect(folderBody.name).toBe("checklist");

    const createCall = calls.find((c) => isCreate(c.url));
    const body = createCall?.init?.body as string;
    expect(body).toContain('"name":"checklist.json"');
    expect(body).toContain('"parents":["app-folder-id"]');
    expect(body).toContain("payload-1");
  });

  it("updates an existing file via PATCH with If-Match on subsequent saves", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "file-abc" }] }),
        });
      }
      if (isUpdate(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "file-abc" }),
          headers: { ETag: '"etag-v2"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    const saved = await adapter.save("payload-2", '"etag-v1"');
    expect(saved.revision).toBe('"etag-v2"');
    const updateCall = calls.find((c) => isUpdate(c.url));
    const headers = updateCall?.init?.headers as Record<string, string>;
    expect(headers["If-Match"]).toBe('"etag-v1"');
  });

  it("throws ConflictError on 412 with the remote snapshot", async () => {
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "file-abc" }] }),
        });
      }
      if (isUpdate(call.url)) {
        return makeResponse({ status: 412, body: "" });
      }
      if (isDownload(call.url)) {
        return makeResponse({
          status: 200,
          body: '{"remote":true}',
          headers: { ETag: '"etag-remote"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    await expect(
      adapter.save("our-payload", '"etag-stale"'),
    ).rejects.toMatchObject({
      name: "ConflictError",
      remote: { text: '{"remote":true}', revision: '"etag-remote"' },
    });
  });

  it("recovers when the cached fileId points at a deleted file (404)", async () => {
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "stale-id" }] }),
        });
      }
      if (isUpdate(call.url)) {
        return makeResponse({ status: 404, body: "" });
      }
      if (isCreate(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "fresh-id" }),
        });
      }
      if (isMetadata(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "fresh-id" }),
          headers: { ETag: '"etag-fresh"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    expect(await adapter.save("payload")).toEqual({
      text: "payload",
      revision: '"etag-fresh"',
    });
  });

  it("sets a 1-second debounce so edits coalesce", () => {
    const { fn } = fakeFetch(() => makeResponse({ status: 200, body: "{}" }));
    const adapter = createGdriveAdapter("token-123", fn);
    expect(adapter.saveDebounceMs).toBe(1000);
  });

  it("forwards the bearer token on every request", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "f1" }] }),
        });
      }
      if (isDownload(call.url)) {
        return makeResponse({
          status: 200,
          body: "{}",
          headers: { ETag: '"e1"' },
        });
      }
      if (isUpdate(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "f1" }),
          headers: { ETag: '"e2"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-abc", fn);
    await adapter.load();
    await adapter.save("payload");
    for (const call of calls) {
      const auth = (call.init?.headers as Record<string, string>).Authorization;
      expect(auth).toBe("Bearer token-abc");
    }
  });
});

describe("ConflictError integration with gdrive", () => {
  it("the thrown error is detected by instanceof ConflictError", async () => {
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "f1" }] }),
        });
      }
      if (isUpdate(call.url)) {
        return makeResponse({ status: 412, body: "" });
      }
      if (isDownload(call.url)) {
        return makeResponse({
          status: 200,
          body: '{"x":1}',
          headers: { ETag: '"e-remote"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token", fn);
    await expect(adapter.save("text", '"e-old"')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
