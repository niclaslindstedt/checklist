// Small HTTP helpers shared by the cloud storage adapters (Dropbox,
// Google Drive) and the OAuth PKCE flow. Keeping them in one place stops
// each adapter from re-implementing the same defensive response handling
// — and means a fix (a new fallback, a header quirk) lands once for every
// backend.

import type { Logger } from "../dev/logger.ts";

/**
 * Read a response body as text for inclusion in an error message,
 * falling back to a placeholder when the body can't be read (already
 * consumed, aborted stream, …) so building the error never itself throws.
 */
export async function readErrorBody(res: Response): Promise<string> {
  return res.text().catch(() => "<unreadable>");
}

/**
 * `host/path` of a request URL for the sync log — identifies the endpoint
 * (which host, which operation) without ever logging the access token (it
 * rides in the `Authorization` header), the search query, the
 * `Dropbox-API-Arg` file path, or any body. Falls back to the raw URL when
 * it can't be parsed.
 */
export function requestLabel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

/**
 * A compact "Name: message" for a thrown value, so a bare WebKit
 * `TypeError: Load failed` (a network-level failure) is legible in the sync
 * log. Non-`Error` throws are stringified.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/**
 * Parse an HTTP `Retry-After` header (delta-seconds) into milliseconds,
 * clamped to never return below `fallbackMs`. A missing or non-numeric
 * header yields the fallback; a present value is floored at zero before
 * the seconds→ms conversion.
 */
export function parseRetryAfterMs(
  headers: Headers | undefined,
  fallbackMs: number,
): number {
  const headerSeconds = Number(headers?.get("Retry-After") ?? "");
  const headerMs = Number.isFinite(headerSeconds)
    ? Math.max(0, headerSeconds) * 1000
    : 0;
  return Math.max(headerMs, fallbackMs);
}

/**
 * Build the `Authorization` header for an OAuth bearer token. Centralising
 * the `Bearer ` scheme keeps every cloud backend's request headers in one
 * place — guarding against a header-casing typo and giving a single edit
 * point if the scheme ever changes.
 */
export function bearerAuthHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** The per-request diagnostics handle returned by {@link createRequestLog}. */
export type RequestLog = {
  /**
   * Run one fetch attempt. On a network-level throw it logs a `… threw
   * after <ms>ms[<note>]: <error>` warning and rethrows; otherwise it
   * returns the response untouched. `note` annotates a follow-up attempt
   * (e.g. `" (post-refresh)"`).
   */
  attempt(thunk: () => Promise<Response>, note?: string): Promise<Response>;
  /**
   * Emit the closing `… → <status> (<ms>ms)` line — `info` when the
   * response is ok, `warn` otherwise — and return the response so callers
   * can `return logStatus(res)`.
   */
  logStatus(res: Response): Response;
};

/**
 * Per-request sync diagnostics shared by the cloud adapters' logged-fetch
 * wrappers (Google Drive's `loggedFetch`, Dropbox's `authedFetch`). It
 * records which endpoint / file ran (never the access token or the file
 * contents — see {@link requestLabel}), how long it ran, and how it ended.
 * That trio is what tells sync failures apart on a flaky link: a request
 * that *throws* after several seconds is a timeout / dropped connection;
 * one that throws in tens of ms is a refused / blocked request (CORS,
 * Private Relay, a content blocker, or — in the installed PWA — the service
 * worker); a load that logs several `→ 200` reads and one `threw` is an
 * intermittent per-request drop, not the whole host being unreachable; and
 * a single file that always throws while the rest succeed points at that
 * file (e.g. a path-encoding bug on a nested entry).
 *
 * The two backends differ only in what sits between the fetch and the
 * status line — Dropbox interleaves a 401 silent-refresh retry — so each
 * composes its own flow from {@link RequestLog.attempt} and
 * {@link RequestLog.logStatus} rather than sharing a single fetch wrapper.
 */
export function createRequestLog(
  log: Logger,
  url: string,
  labelOverride?: string,
): RequestLog {
  const label = labelOverride
    ? `${requestLabel(url)} ${labelOverride}`
    : requestLabel(url);
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  return {
    async attempt(thunk, note = "") {
      try {
        return await thunk();
      } catch (err) {
        log.warn(
          `${label} threw after ${elapsed()}ms${note}: ${describeError(err)}`,
        );
        throw err;
      }
    },
    logStatus(res) {
      const line = `${label} → ${res.status} (${elapsed()}ms)`;
      if (res.ok) log.info(line);
      else log.warn(line);
      return res;
    },
  };
}
