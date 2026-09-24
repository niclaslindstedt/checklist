// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The page's half of the PHONE SIGN-IN — an authentication session the host
// opens on the page's behalf.
//
// The phone app serves this page in a WebView from a loopback origin, and the
// redirect flow in `./oauth-pkce.ts` cannot finish there: the providers refuse
// consent inside an embedded WebView, so the wrapper sends the consent page to
// Safari, and the provider then redirects SAFARI to an origin it has not
// registered, in a browser that does not hold the PKCE verifier this page
// stashed in its own `sessionStorage`.
//
// The platform's answer is an authentication session (`ASWebAuthenticationSession`
// on iOS, a Custom Tab on Android): a browser sheet over the app that closes the
// moment the provider redirects to a URI the app claims, and hands that URI
// back. A host that can open one says so by installing an object at
// `window.__ossAuthSession`; the page asks for the CAPABILITY, never for the
// platform, and a browser or the desktop shell simply has none.
//
// The same seam as `@niclaslindstedt/oss-framework/storage`'s
// (`getAuthSessionHost`), which this app does not depend on — the names match
// so one wrapper answers both. `native/src/authSessionBridge.ts` installs the
// host; `tests/native/auth-session-bridge.test.ts` pins the two together.

/** Where a host installs itself. */
export const AUTH_SESSION_HOST_PROPERTY = "__ossAuthSession";

/** The event a host dispatches once it has installed itself. */
export const AUTH_SESSION_HOST_EVENT = "oss:auth-session-host";

/** What a host offers. */
export type AuthSessionHost = {
  /** The shape of this object; a host of another version is ignored. */
  version: 1;
  /** The URI the session closes on — the one the provider is told to use. */
  redirectUri: string;
  /**
   * Open `url` in a session. Resolves with the URL the provider redirected to,
   * or null when the reader closed the sheet; rejects when it could not open.
   */
  open(url: string): Promise<string | null>;
};

/** The host this page runs inside, or null when there is none. */
export function getAuthSessionHost(
  win: object | undefined = typeof window !== "undefined" ? window : undefined,
): AuthSessionHost | null {
  if (!win) return null;
  const candidate = (win as Record<string, unknown>)[
    AUTH_SESSION_HOST_PROPERTY
  ];
  if (typeof candidate !== "object" || candidate === null) return null;
  const host = candidate as Partial<AuthSessionHost>;
  if (host.version !== 1) return null;
  if (typeof host.redirectUri !== "string" || host.redirectUri === "") {
    return null;
  }
  if (typeof host.open !== "function") return null;
  return host as AuthSessionHost;
}

/**
 * The reader closed the sign-in sheet. Thrown by `runAuthSessionAuth`
 * (`./oauth-pkce.ts`) and reported quietly — it is a change of mind, not a
 * failure. Lives here, beside the seam, so the connect button can recognise it
 * without loading the OAuth module.
 */
export class AuthCancelledError extends Error {
  constructor(providerName: string) {
    super(`${providerName} sign-in was cancelled`);
    this.name = "AuthCancelledError";
  }
}

export function isAuthCancelled(err: unknown): boolean {
  return err instanceof AuthCancelledError;
}
