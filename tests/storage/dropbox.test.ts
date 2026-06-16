import { describe, expect, it } from "vitest";

import { ConflictError } from "../../src/storage/adapter.ts";
import { encryptText } from "../../src/storage/crypto.ts";
import { BLOB_FILE_NAME } from "../../src/storage/directory-adapter.ts";
import {
  createDropboxAdapter,
  createDropboxSettingsStore,
  deleteDropboxNamespace,
  dropboxApiArg,
} from "../../src/storage/dropbox/index.ts";
import { parse, serialize } from "../../src/storage/serialize.ts";
import type { Snapshot } from "../../src/domain/types.ts";

// In-memory Dropbox simulator keyed by full path. Only the handful of
// endpoints the file store touches are modelled (list_folder, download,
// upload, delete_v2).
class DropboxSim {
  files = new Map<string, { content: string; rev: number }>();
  private counter = 0;

  fetch: typeof fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const arg = headers["Dropbox-API-Arg"]
      ? JSON.parse(headers["Dropbox-API-Arg"])
      : null;
    // Only the JSON endpoints carry a JSON body; uploads carry raw bytes.
    const jsonBody = () => JSON.parse(String(init?.body ?? "{}"));

    if (u.endsWith("/files/list_folder")) {
      const body = jsonBody();
      const root = `${body.path}/`;
      const entries = [...this.files.entries()]
        .filter(([p]) => p.startsWith(root))
        .map(([p, f]) => ({
          ".tag": "file",
          path_display: p,
          rev: String(f.rev),
        }));
      if (entries.length === 0 && !this.files.has(body.path)) {
        return resp(409, "path/not_found");
      }
      return resp(
        200,
        JSON.stringify({ entries, cursor: "", has_more: false }),
      );
    }
    if (u.endsWith("/files/download")) {
      const f = this.files.get(arg.path);
      return f ? resp(200, f.content) : resp(409, "path/not_found");
    }
    if (u.endsWith("/files/upload")) {
      const content = String(init?.body ?? "");
      this.files.set(arg.path, { content, rev: ++this.counter });
      return resp(200, "{}");
    }
    if (u.endsWith("/files/delete_v2")) {
      const path: string = jsonBody().path;
      let removed = false;
      for (const p of [...this.files.keys()]) {
        if (p === path || p.startsWith(`${path}/`)) {
          this.files.delete(p);
          removed = true;
        }
      }
      return removed ? resp(200, "{}") : resp(409, "path/not_found");
    }
    throw new Error(`unexpected dropbox call ${u}`);
  }) as typeof fetch;

  paths(): string[] {
    return [...this.files.keys()].sort();
  }
}

function resp(status: number, body: string): Response {
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

describe("dropbox adapter (markdown file store)", () => {
  it("writes one markdown file per checklist under the namespace folder", async () => {
    const sim = new DropboxSim();
    const adapter = createDropboxAdapter("token", sim.fetch);
    await adapter.save(serialize(snapshot));
    expect(sim.paths()).toEqual(["/default/checklists/groceries-cl1.md"]);
  });

  it("round-trips a snapshot through markdown files", async () => {
    const sim = new DropboxSim();
    const adapter = createDropboxAdapter("token", sim.fetch, "work");
    await adapter.save(serialize(snapshot));
    const loaded = await adapter.load();
    expect(parse(loaded!.text).checklists[0]!.name).toBe("Groceries");
  });

  it("returns null for an empty namespace folder", async () => {
    const sim = new DropboxSim();
    const adapter = createDropboxAdapter("token", sim.fetch);
    expect(await adapter.load()).toBeNull();
  });

  it("stores an encrypted envelope as a single blob file", async () => {
    const sim = new DropboxSim();
    const adapter = createDropboxAdapter("token", sim.fetch);
    const envelope = await encryptText(serialize(snapshot), "pw");
    await adapter.save(envelope);
    expect(sim.paths()).toEqual([`/default/${BLOB_FILE_NAME}`]);
    expect((await adapter.load())!.text).toBe(envelope);
  });

  it("reads a legacy JSON blob, then migrates it to markdown on save", async () => {
    const sim = new DropboxSim();
    sim.files.set(`/default/${BLOB_FILE_NAME}`, {
      content: serialize(snapshot),
      rev: 1,
    });
    const adapter = createDropboxAdapter("token", sim.fetch);
    const loaded = await adapter.load();
    expect(parse(loaded!.text).checklists[0]!.name).toBe("Groceries");
    await adapter.save(loaded!.text);
    expect(sim.paths()).toEqual(["/default/checklists/groceries-cl1.md"]);
  });

  it("raises a ConflictError when the folder moved past baseRevision", async () => {
    const sim = new DropboxSim();
    const adapter = createDropboxAdapter("token", sim.fetch);
    const first = await adapter.save(serialize(snapshot));
    sim.files.set("/default/checklists/groceries-cl1.md", {
      content: "tampered",
      rev: 99,
    });
    await expect(
      adapter.save(serialize(snapshot), first.revision),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("deleteDropboxNamespace removes the whole folder", async () => {
    const sim = new DropboxSim();
    const adapter = createDropboxAdapter("token", sim.fetch, "work");
    await adapter.save(serialize(snapshot));
    expect(sim.paths().length).toBe(1);
    await deleteDropboxNamespace("token", "work", sim.fetch);
    expect(sim.paths()).toEqual([]);
  });

  it("settings store reads/writes /settings.json at the app-folder root", async () => {
    const sim = new DropboxSim();
    const adapter = createDropboxAdapter("token", sim.fetch, "work");
    const settings = createDropboxSettingsStore("token", sim.fetch);
    await adapter.save(serialize(snapshot));
    expect(await settings.load()).toBeNull();
    await settings.save('{"theme":"dark"}');
    // settings.json sits beside the namespace folder, not inside it.
    expect(sim.paths()).toEqual([
      "/settings.json",
      "/work/checklists/groceries-cl1.md",
    ]);
    expect(await settings.load()).toBe('{"theme":"dark"}');
  });
});

describe("dropboxApiArg", () => {
  it("escapes characters above U+007F to \\uXXXX", () => {
    expect(dropboxApiArg({ path: "/städ" })).toBe('{"path":"/st\\u00e4d"}');
  });
});
