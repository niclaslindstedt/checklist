// Shared OAuth 2.0 PKCE helpers used by every cloud storage adapter
// that signs in through the browser (Dropbox). The
// helpers are pure and stateless; each adapter owns its own
// `sessionStorage` key for the verifier so parallel auth flows don't
// race each other. Ported from the budget project's `oauth-pkce.ts`.

import { createLogger } from "../dev/logger.ts";
import { toBase64Url } from "../encoding/base64url.ts";
import { AuthCancelledError, type AuthSessionHost } from "./auth-session.ts";
import {
  awaitLoopbackRedirect,
  beginLoopbackRedirect,
} from "./desktop-loopback.ts";
import { readErrorBody } from "./http-utils.ts";

const log = createLogger("oauth");

// 64 random bytes encoded as base64url — comfortably above the 43-
// character minimum the spec requires and well below the 128-character
// maximum, so the resulting string fits in a URL without truncation.
export function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function challengeFor(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
}

// The OAuth app registration must list this exact URI. We derive it
// from the current page's origin + pathname so production at `/` and
// preview at `/preview/` round-trip back to themselves — without the
// pathname, the redirect from Dropbox lands the preview build
// on production, where the PKCE verifier (stashed under the preview's
// sessionStorage key) is invisible and auth completion bails with
// "Missing PKCE verifier" or "cannot determine provider".
//
// The trailing slash is trimmed: an OAuth client config rejects
// redirect URIs that end in `/`, and Dropbox accepts either form, so
// the slash-less spelling is the only one that satisfies both.
// `/` maps to the bare origin, `/preview/` maps to `<origin>/preview`.
export function redirectUri(): string {
  const pathname = window.location.pathname.replace(/\/+$/, "");
  return `${window.location.origin}${pathname}`;
}

// Pick which cloud provider issued an inbound OAuth `?code=`. The
// authoritative signal is the PKCE verifier we stashed in `sessionStorage`
// before redirecting to the provider's consent screen: its presence alone
// identifies the flow. Returns `null` when nothing identifies it — the caller
// logs and bails rather than falling through to a hardcoded provider.
//
// Dropbox is the only cloud provider now, so there is nothing to disambiguate
// between; the shape is kept because the caller's job (decide, or refuse) does
// not change when a second one is added back.
export function pickOauthProvider(args: {
  dropboxPending: boolean;
}): "dropbox" | null {
  return args.dropboxPending ? "dropbox" : null;
}

export type FetchImpl = typeof fetch;

// All the per-provider knobs the three flow helpers below need. The
// helpers are uniform across providers; only this record changes.
//
// `extraAuthParams` carries the bits the providers legitimately differ
// on (Dropbox needs `token_access_type=offline`, …). The helper merges
// them into the redirect's query string verbatim.
//
// `providerName` is the human-readable label that surfaces in thrown
// error messages — "Dropbox token exchange failed: 400" reads better
// than a generic "OAuth token exchange failed".
export type OAuthConfig = {
  authBase: string;
  tokenEndpoint: string;
  clientId: string;
  // OAuth `state` echoed back by the redirect so a multi-provider app
  // can route the `?code=` to the right token exchange.
  state: string;
  // `sessionStorage` key for the PKCE verifier. Per-provider so parallel
  // flows don't race each other on the same slot.
  verifierKey: string;
  providerName: string;
  extraAuthParams?: Record<string, string>;
};

export type TokenResult = {
  accessToken: string;
  refreshToken: string | null;
};

// Kicks the user out to the provider's consent screen. Returns nothing —
// the next thing that happens is a full-page redirect back to the app
// with `?code=…&state=<config.state>` set.
export async function startAuth(config: OAuthConfig): Promise<void> {
  log.info(
    `${config.providerName}: startAuth (redirect=${redirectUri()}, state=${config.state}, verifierKey=${config.verifierKey})`,
  );
  const verifier = randomVerifier();
  sessionStorage.setItem(config.verifierKey, verifier);
  const challenge = await challengeFor(verifier);
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: config.state,
    ...(config.extraAuthParams ?? {}),
  });
  const dest = `${config.authBase}?${params.toString()}`;
  const sentKeys = [...params.keys()].sort().join(",");
  log.info(
    `${config.providerName}: redirecting to ${config.authBase} sentKeys=${sentKeys}`,
  );
  window.location.assign(dest);
}

// The DESKTOP sign-in, start to tokens, in one promise — for the desktop app,
// where the redirect in `startAuth` has nowhere to land (see
// `./desktop-loopback.ts`). Nothing navigates: the consent screen opens in the
// user's own browser (the shell hands `window.open` to it) and the provider
// redirects to a loopback listener the shell opened for the occasion.
//
// Throws on every failure the user can cause as well as the ones they can't:
// declining consent, letting the listener time out, or a `state` that is not
// this flow's. The verifier is dropped on all of them, so a failed attempt
// cannot be resumed by a later redirect.
export async function runLoopbackAuth(
  config: OAuthConfig,
  fetchImpl: FetchImpl = fetch,
): Promise<TokenResult> {
  const redirect = await beginLoopbackRedirect();
  log.info(`${config.providerName}: loopback auth (redirect=${redirect})`);
  const verifier = randomVerifier();
  sessionStorage.setItem(config.verifierKey, verifier);
  try {
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: redirect,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: "S256",
      state: config.state,
      ...(config.extraAuthParams ?? {}),
    });
    // `noopener` because this never becomes a window this page talks to — the
    // shell refuses the window and hands the URL to the system browser.
    window.open(
      `${config.authBase}?${params.toString()}`,
      "_blank",
      "noopener",
    );
    const back = await awaitLoopbackRedirect();
    return await finishRedirect(config, back, redirect, fetchImpl);
  } catch (err) {
    sessionStorage.removeItem(config.verifierKey);
    log.error(`${config.providerName}: loopback auth failed`, err);
    throw err;
  }
}

// The PHONE sign-in, start to tokens, in one promise — for the phone app,
// whose loopback origin no provider redirects to (see `./auth-session.ts`).
// The consent screen opens in an authentication session the host provides; the
// sheet closes on the host's redirect URI (`<bundle id>://oauth`) and hands the
// URL back here, where the `state` check and the token exchange happen with
// the verifier this page still holds. The host never sees a token.
//
// A sheet the reader closes rejects with `AuthCancelledError`, which the caller
// reports quietly (`isAuthCancelled`); every other failure is an error. The
// verifier is dropped on all of them, as in `runLoopbackAuth`.
export async function runAuthSessionAuth(
  config: OAuthConfig,
  host: AuthSessionHost,
  fetchImpl: FetchImpl = fetch,
): Promise<TokenResult> {
  const redirect = host.redirectUri;
  log.info(`${config.providerName}: auth session (redirect=${redirect})`);
  const verifier = randomVerifier();
  sessionStorage.setItem(config.verifierKey, verifier);
  try {
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: redirect,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: "S256",
      state: config.state,
      ...(config.extraAuthParams ?? {}),
    });
    const landed = await host.open(`${config.authBase}?${params.toString()}`);
    if (landed === null) throw new AuthCancelledError(config.providerName);
    return await finishRedirect(
      config,
      callbackParams(config, landed, redirect),
      redirect,
      fetchImpl,
    );
  } catch (err) {
    sessionStorage.removeItem(config.verifierKey);
    if (err instanceof AuthCancelledError) {
      log.info(`${config.providerName}: auth session cancelled`);
    } else {
      log.error(`${config.providerName}: auth session failed`, err);
    }
    throw err;
  }
}

// The query of the URL a session ended on — refused unless it is the redirect
// URI the provider was given, so a sheet that ended anywhere else never has a
// `code` read out of it.
function callbackParams(
  config: OAuthConfig,
  landed: string,
  redirect: string,
): URLSearchParams {
  const hash = landed.indexOf("#");
  const bare = hash >= 0 ? landed.slice(0, hash) : landed;
  const mark = bare.indexOf("?");
  const base = mark >= 0 ? bare.slice(0, mark) : bare;
  const trim = (uri: string) => uri.replace(/\/+$/, "");
  if (trim(base) !== trim(redirect)) {
    throw new Error(
      `${config.providerName} sign-in ended somewhere other than the redirect URI`,
    );
  }
  return new URLSearchParams(mark >= 0 ? bare.slice(mark + 1) : "");
}

// What the provider's redirect said, turned into tokens — or into the error it
// carried. Shared by the loopback and the auth-session flows.
async function finishRedirect(
  config: OAuthConfig,
  back: URLSearchParams,
  redirect: string,
  fetchImpl: FetchImpl,
): Promise<TokenResult> {
  const error = back.get("error");
  if (error) {
    throw new Error(
      `${config.providerName} declined the connection: ${
        back.get("error_description") ?? error
      }`,
    );
  }
  // Checked before the code is spent: a `state` that is not ours means the
  // redirect belongs to some other flow, and the code is not ours to trade.
  if (back.get("state") !== config.state) {
    throw new Error(
      `${config.providerName} redirect carried an unexpected state`,
    );
  }
  const code = back.get("code");
  if (!code) {
    throw new Error(`${config.providerName} redirect carried no code`);
  }
  return await completeAuth(config, code, fetchImpl, redirect);
}

// Trades the code from the redirect for an access (and, where the
// provider issues one, refresh) token. Caller is responsible for
// persisting both and cleaning the URL. Throws on any failure so the
// caller can surface the error in the UI.
//
// `redirect` must be the SAME URI the authorization request carried — the
// provider checks it again at the token endpoint. It defaults to this page's;
// `runLoopbackAuth` passes the listener's, `runAuthSessionAuth` the host's.
export async function completeAuth(
  config: OAuthConfig,
  code: string,
  fetchImpl: FetchImpl = fetch,
  redirect: string = redirectUri(),
): Promise<TokenResult> {
  log.info(`${config.providerName}: completeAuth (code received)`);
  const verifier = sessionStorage.getItem(config.verifierKey);
  if (!verifier) {
    log.error(
      `${config.providerName}: completeAuth aborted — missing PKCE verifier (key=${config.verifierKey})`,
    );
    throw new Error("Missing PKCE verifier — restart the connect flow");
  }
  sessionStorage.removeItem(config.verifierKey);
  const params = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: redirect,
    code_verifier: verifier,
  });
  const start = performance.now();
  let res: Response;
  try {
    res = await fetchImpl(config.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    log.error(`${config.providerName}: token exchange network error`, err);
    throw err;
  }
  const ms = (performance.now() - start).toFixed(0);
  log.info(`${config.providerName}: token exchange → ${res.status} (${ms}ms)`);
  if (!res.ok) {
    const body = await readErrorBody(res);
    log.error(`${config.providerName}: token exchange failed`, body);
    throw new Error(
      `${config.providerName} token exchange failed: ${res.status}`,
    );
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!json.access_token) {
    log.error(`${config.providerName}: response missing access_token`, json);
    throw new Error(
      `${config.providerName} token response missing access_token`,
    );
  }
  log.info(
    `${config.providerName}: tokens ok hasRefresh=${Boolean(json.refresh_token)}`,
  );
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
  };
}

// Trades a refresh token for a fresh access token. Returns the new
// access token only — the providers we support (today: Dropbox) keep the
// refresh token stable across calls under the PKCE flow, so the caller
// only needs to persist the new access token. Throws on any failure so
// the adapter can fall back to surfacing the original 401.
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  log.info(`${config.providerName}: refreshAccessToken`);
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  const start = performance.now();
  let res: Response;
  try {
    res = await fetchImpl(config.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    log.error(`${config.providerName}: refresh network error`, err);
    throw err;
  }
  const ms = (performance.now() - start).toFixed(0);
  log.info(`${config.providerName}: refresh → ${res.status} (${ms}ms)`);
  if (!res.ok) {
    const body = await readErrorBody(res);
    log.error(`${config.providerName}: refresh failed`, body);
    throw new Error(
      `${config.providerName} token refresh failed: ${res.status}`,
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    log.error(
      `${config.providerName}: refresh response missing access_token`,
      json,
    );
    throw new Error(
      `${config.providerName} refresh response missing access_token`,
    );
  }
  return json.access_token;
}
