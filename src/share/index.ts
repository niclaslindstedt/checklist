// Encode/decode shareable checklists into a URL fragment. The payload is
// gzipped JSON, then base64url-encoded, and only ever placed after `#` so it
// is never transmitted to a server (see AGENTS.md "Shareable URLs").

import type { Checklist } from "../domain/types.ts";

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

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
