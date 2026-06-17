import { describe, expect, it } from "vitest";

import type { Snapshot } from "../../src/domain/types.ts";
import { ConflictError, RateLimitError } from "../../src/storage/adapter.ts";
import { encryptText } from "../../src/storage/crypto.ts";
import { BLOB_FILE_NAME } from "../../src/storage/directory-adapter.ts";
import {
  createGdriveAdapter,
  createGdriveSettingsStore,
  deleteGdriveNamespace,
} from "../../src/storage/gdrive/index.ts";
import { parse, serialize } from "../../src/storage/serialize.ts";

const FOLDER = "application/vnd.google-apps.folder";

type Node = {
  id: string;
  name: string;
  mimeType: string;
  parent: string;
  content: string;
  version: number;
};

// Minimal Google Drive simulator: a flat node list with parent pointers,
// covering only the endpoints the file store and namespace-delete use.
class DriveSim {
  nodes: Node[] = [];
  private seq = 0;

  private add(partial: Omit<Node, "id" | "version">): string {
    const id = `id${++this.seq}`;
    this.nodes.push({ ...partial, id, version: ++this.seq });
    return id;
  }

  fetch: typeof fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = init?.method ?? "GET";
    const path = u.pathname;
    const idInPath = /\/files\/([^/?]+)/.exec(path)?.[1];

    // Download
    if (method === "GET" && idInPath && u.searchParams.get("alt") === "media") {
      const node = this.nodes.find((n) => n.id === idInPath);
      return node ? json(200, node.content) : json(404, "not found");
    }
    // Search / list
    if (method === "GET" && u.searchParams.get("q")) {
      return json(
        200,
        JSON.stringify({ files: this.search(u.searchParams.get("q")!) }),
      );
    }
    // Create file (multipart upload) — checked before folder-create since
    // the upload path also ends with `/drive/v3/files`.
    if (method === "POST" && path.includes("/upload/drive/v3/files")) {
      const raw = String(init?.body ?? "");
      const segments = raw.split("\r\n\r\n");
      const meta = JSON.parse(segments[1]!.split("\r\n--")[0]!);
      const content = segments
        .slice(2)
        .join("\r\n\r\n")
        .replace(/\r\n--[\s\S]*$/, "");
      const id = this.add({
        name: meta.name,
        mimeType: "text/markdown",
        parent: meta.parents?.[0] ?? "root",
        content,
      });
      return json(200, JSON.stringify({ id }));
    }
    // Create folder (POST to /drive/v3/files, JSON body)
    if (method === "POST" && path.endsWith("/drive/v3/files")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const id = this.add({
        name: body.name,
        mimeType: body.mimeType,
        parent: body.parents?.[0] ?? "root",
        content: "",
      });
      return json(200, JSON.stringify({ id }));
    }
    // Update file (media PATCH)
    if (method === "PATCH" && idInPath) {
      const node = this.nodes.find((n) => n.id === idInPath);
      if (node) {
        node.content = String(init?.body ?? "");
        node.version = ++this.seq;
      }
      return json(200, "{}");
    }
    // Delete (recursive)
    if (method === "DELETE" && idInPath) {
      this.removeTree(idInPath);
      return json(204, "");
    }
    throw new Error(`unexpected drive call ${method} ${u.toString()}`);
  }) as typeof fetch;

  private search(q: string): Node[] {
    const name = /name='([^']*)'/.exec(q)?.[1];
    const parent = /'([^']*)' in parents/.exec(q)?.[1];
    const wantsFolder = q.includes(`mimeType='${FOLDER}'`);
    return this.nodes.filter((n) => {
      if (parent && n.parent !== parent) return false;
      if (name !== undefined && n.name !== name) return false;
      if (name !== undefined) {
        return wantsFolder ? n.mimeType === FOLDER : n.mimeType !== FOLDER;
      }
      return true; // listDir: every child
    });
  }

  private removeTree(id: string): void {
    const children = this.nodes.filter((n) => n.parent === id).map((n) => n.id);
    this.nodes = this.nodes.filter((n) => n.id !== id);
    children.forEach((c) => this.removeTree(c));
  }

  fileNames(): string[] {
    return this.nodes
      .filter((n) => n.mimeType !== FOLDER)
      .map((n) => n.name)
      .sort();
  }

  folderNames(): string[] {
    return this.nodes.filter((n) => n.mimeType === FOLDER).map((n) => n.name);
  }
}

function json(status: number, body: string): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    },
  } as unknown as Response;
}

const snapshot: Snapshot = {
  templates: [],
  checklists: [
    {
      version: 1,
      id: "cl1",
      templateId: "",
      name: "Groceries",
      items: [{ id: "1", title: "Milk", checked: false }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

describe("gdrive adapter (markdown file store)", () => {
  it("writes a markdown file under checklist/<ns>/checklists/", async () => {
    const sim = new DriveSim();
    const adapter = createGdriveAdapter("token", sim.fetch);
    await adapter.save(serialize(snapshot));
    expect(sim.fileNames()).toEqual(["groceries-cl1.md"]);
    expect(sim.folderNames()).toEqual(["checklist", "default", "checklists"]);
  });

  it("round-trips a snapshot through markdown files", async () => {
    const sim = new DriveSim();
    const adapter = createGdriveAdapter("token", sim.fetch, "work");
    await adapter.save(serialize(snapshot));
    const loaded = await adapter.load();
    expect(parse(loaded!.text).checklists[0]!.name).toBe("Groceries");
  });

  it("returns null for an empty namespace", async () => {
    const sim = new DriveSim();
    const adapter = createGdriveAdapter("token", sim.fetch);
    expect(await adapter.load()).toBeNull();
  });

  it("stores an encrypted envelope as a single blob file", async () => {
    const sim = new DriveSim();
    const adapter = createGdriveAdapter("token", sim.fetch);
    const envelope = await encryptText(serialize(snapshot), "pw");
    await adapter.save(envelope);
    expect(sim.fileNames()).toEqual([BLOB_FILE_NAME]);
    expect((await adapter.load())!.text).toBe(envelope);
  });

  it("raises a ConflictError when a file moved past baseRevision", async () => {
    const sim = new DriveSim();
    const adapter = createGdriveAdapter("token", sim.fetch);
    const first = await adapter.save(serialize(snapshot));
    const file = sim.nodes.find((n) => n.name === "groceries-cl1.md")!;
    file.content = "tampered";
    file.version = 9999;
    await expect(
      adapter.save(serialize(snapshot), first.revision),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("deleteGdriveNamespace removes the namespace folder tree", async () => {
    const sim = new DriveSim();
    const adapter = createGdriveAdapter("token", sim.fetch, "work");
    await adapter.save(serialize(snapshot));
    expect(sim.fileNames().length).toBe(1);
    await deleteGdriveNamespace("token", "work", sim.fetch);
    expect(sim.fileNames()).toEqual([]);
  });

  it("settings store stores settings.json in the app folder, beside namespaces", async () => {
    const sim = new DriveSim();
    const adapter = createGdriveAdapter("token", sim.fetch, "work");
    const settings = createGdriveSettingsStore("token", sim.fetch);
    await adapter.save(serialize(snapshot));
    expect(await settings.load()).toBeNull();
    await settings.save('{"theme":"dark"}');
    expect(await settings.load()).toBe('{"theme":"dark"}');
    // settings.json's parent is the `checklist` app folder, not the `work`
    // namespace folder — so it sits at the app-folder root.
    const appFolder = sim.nodes.find(
      (n) => n.name === "checklist" && n.parent === "root",
    )!;
    const settingsNode = sim.nodes.find((n) => n.name === "settings.json")!;
    expect(settingsNode.parent).toBe(appFolder.id);
    expect(sim.folderNames().sort()).toEqual([
      "checklist",
      "checklists",
      "work",
    ]);
  });

  // A fetch stub that answers every call with one chosen response — enough
  // to trip the rate-limit mapping on the first request a save makes (the
  // app-folder search).
  function alwaysRespond(res: Response): typeof fetch {
    return (async () => res) as unknown as typeof fetch;
  }

  it("maps a 403 userRateLimitExceeded to a RateLimitError", async () => {
    const body = JSON.stringify({
      error: { code: 403, errors: [{ reason: "userRateLimitExceeded" }] },
    });
    const adapter = createGdriveAdapter(
      "token",
      alwaysRespond(json(403, body)),
    );
    await expect(adapter.save(serialize(snapshot))).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("maps a bare 429 to a RateLimitError and honours Retry-After", async () => {
    const res = {
      status: 429,
      ok: false,
      headers: new Headers({ "Retry-After": "12" }),
      async text() {
        return "Too Many Requests";
      },
      async json() {
        return {};
      },
    } as unknown as Response;
    const adapter = createGdriveAdapter("token", alwaysRespond(res));
    await expect(adapter.save(serialize(snapshot))).rejects.toMatchObject({
      name: "RateLimitError",
      retryAfterMs: 12_000,
    });
  });

  it("leaves a genuine 403 permission error as a non-throttle Error", async () => {
    const body = JSON.stringify({
      error: { code: 403, errors: [{ reason: "insufficientPermissions" }] },
    });
    const adapter = createGdriveAdapter(
      "token",
      alwaysRespond(json(403, body)),
    );
    const err = await adapter.save(serialize(snapshot)).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(RateLimitError);
  });
});
