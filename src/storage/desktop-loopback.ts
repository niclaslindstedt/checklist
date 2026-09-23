// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The page's half of the DESKTOP SIGN-IN — the loopback OAuth redirect.
//
// A desktop shell serves the app from a private scheme (`<app>://localhost`,
// which WebView2 on Windows maps onto `http://<app>.localhost`). No OAuth
// provider will register either as a redirect URI, so the redirect flow in
// `./oauth-pkce.ts` (`startAuth` → navigate away → land back on this origin)
// has nowhere to land. The way out is the one RFC 8252 prescribes for native
// apps: open the consent screen in the user's REAL browser, and catch the
// redirect on a loopback listener (`http://127.0.0.1:<port>/`) the shell
// opens for the occasion.
//
// A page cannot hold a listening socket, so the shell holds it — and nothing
// else. The page reaches it by `fetch`ing two reserved paths on its OWN
// origin, which the shell's scheme handler answers:
//
//   GET /__oauth/begin  → {"redirectUri": "http://127.0.0.1:<port>/"} | {"error"}
//   GET /__oauth/await  → {"query": "<the redirect's query string>"}  | {"error"}
//
// `await` holds its answer until the redirect lands (or the shell gives up).
// Every decision — the PKCE challenge, the `state` check, the token exchange
// — stays on this side, in `runLoopbackAuth` (`./oauth-pkce.ts`). The same
// seam as `@niclaslindstedt/oss-framework/storage`'s, which this app does not
// depend on; the shell (`tauri/shell/src/oauth.rs`) answers both alike.

/** The path that opens the listener and answers with the redirect URI. */
export const LOOPBACK_BEGIN_PATH = "/__oauth/begin";

/** The path that answers once the redirect has landed on the listener. */
export const LOOPBACK_AWAIT_PATH = "/__oauth/await";

/**
 * Is this page being served by a desktop shell — the one surface where a
 * redirect-based sign-in cannot complete and the loopback one can?
 *
 * Read from the origin alone, because the shell never tells the page
 * anything: a non-web scheme (`paint://localhost` on macOS and Linux), or the
 * `<app>.localhost` host WebView2 maps that scheme onto on Windows. A plain
 * `http://localhost:5173` dev server is neither — its host has no subdomain.
 */
export function isDesktopShellOrigin(
  location?: Pick<Location, "protocol" | "hostname">,
): boolean {
  location ??= typeof window !== "undefined" ? window.location : undefined;
  if (!location) return false;
  const { protocol, hostname } = location;
  if (protocol !== "http:" && protocol !== "https:" && protocol !== "file:") {
    return true;
  }
  return protocol === "http:" && /^[a-z0-9-]+\.localhost$/i.test(hostname);
}

type LoopbackReply = { redirectUri?: string; query?: string; error?: string };

async function ask(path: string): Promise<LoopbackReply> {
  if (!isDesktopShellOrigin()) {
    throw new Error(
      "The loopback sign-in is only available in the desktop app",
    );
  }
  let res: Response;
  try {
    res = await fetch(`${window.location.origin}${path}`);
  } catch (err) {
    throw new Error(`Could not reach the desktop shell: ${String(err)}`, {
      cause: err,
    });
  }
  if (!res.ok) throw new Error(`Desktop shell refused ${path}: ${res.status}`);
  return (await res.json()) as LoopbackReply;
}

/**
 * Ask the shell to open a one-shot loopback listener, and resolve with the
 * redirect URI to hand the provider. Supersedes any listener already waiting,
 * so an abandoned attempt does not strand a socket.
 */
export async function beginLoopbackRedirect(): Promise<string> {
  const reply = await ask(LOOPBACK_BEGIN_PATH);
  if (reply.error) throw new Error(reply.error);
  if (!reply.redirectUri) {
    throw new Error("Desktop shell returned no redirect URI");
  }
  return reply.redirectUri;
}

/**
 * Resolve with the redirect's query parameters once the provider sends the
 * browser back to the listener. Rejects if the shell gave up waiting or was
 * never asked to listen. The parameters are returned unread: whether they
 * carry a `code`, an `error`, or someone else's `state` is the caller's call.
 */
export async function awaitLoopbackRedirect(): Promise<URLSearchParams> {
  const reply = await ask(LOOPBACK_AWAIT_PATH);
  if (reply.error) throw new Error(reply.error);
  return new URLSearchParams(reply.query ?? "");
}
