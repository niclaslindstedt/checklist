// Encode/decode shareable checklists into a URL fragment. The payload is
// gzipped JSON, then base64url-encoded, and only ever placed after `#` so it
// is never transmitted to a server (see AGENTS.md "Shareable URLs").

import type { Checklist } from "../domain/types.ts";
import { fromBase64Url, toBase64Url } from "../encoding/base64url.ts";

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Serialize a checklist into a fragment-safe string (no leading `#`). */
export async function encodeChecklist(checklist: Checklist): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(checklist));
  return toBase64Url(await gzip(json));
}

/** Parse a fragment payload (with or without a leading `#`) into a checklist. */
export async function decodeChecklist(fragment: string): Promise<Checklist> {
  const payload = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  const json = await gunzip(fromBase64Url(payload));
  return JSON.parse(new TextDecoder().decode(json)) as Checklist;
}
