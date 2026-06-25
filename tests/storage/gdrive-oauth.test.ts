// @vitest-environment jsdom
// Direct coverage for the GIS OAuth flow extracted into
// `src/storage/gdrive/gis-oauth.ts`. The real flow injects Google's
// `gsi/client` script and opens a consent popup, which Vitest can't reach;
// these tests stub `window.google.accounts.oauth2` so `loadGisScript`
// short-circuits and `startGdriveAuth` exercises its callback / error paths
// against a fake token client.
import { afterEach, describe, expect, it } from "vitest";

import {
  preloadGdriveAuth,
  startGdriveAuth,
} from "../../src/storage/gdrive/gis-oauth.ts";

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type ErrorResponse = { type: string; message?: string };

// Install a fake GIS global whose token client immediately drives the
// configured callbacks, so a `requestAccessToken()` resolves synchronously
// without a popup. Returns the captured `client_id` / `scope` for assertions.
function installGis(opts: {
  response?: TokenResponse;
  error?: ErrorResponse;
}): { captured: { client_id?: string; scope?: string } } {
  const captured: { client_id?: string; scope?: string } = {};
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient(config) {
          captured.client_id = config.client_id;
          captured.scope = config.scope;
          return {
            requestAccessToken() {
              if (opts.error) {
                config.error_callback?.(opts.error);
                return;
              }
              config.callback(opts.response ?? {});
            },
          };
        },
      },
    },
  };
  return { captured };
}

afterEach(() => {
  delete window.google;
});

describe("startGdriveAuth", () => {
  it("resolves with the access token from a successful grant", async () => {
    const { captured } = installGis({ response: { access_token: "tok-123" } });
    await expect(startGdriveAuth()).resolves.toBe("tok-123");
    // Requests the narrow `drive.file` scope, not full Drive access.
    expect(captured.scope).toBe("https://www.googleapis.com/auth/drive.file");
  });

  it("rejects when Google returns an error, preferring the description", async () => {
    installGis({
      response: { error: "access_denied", error_description: "user said no" },
    });
    await expect(startGdriveAuth()).rejects.toThrow(
      "Google sign-in failed: user said no",
    );
  });

  it("rejects when the grant carries no access token", async () => {
    installGis({ response: {} });
    await expect(startGdriveAuth()).rejects.toThrow(
      "Google did not return an access token",
    );
  });

  it("rejects via the error callback when the popup fails", async () => {
    installGis({ error: { type: "popup_closed", message: "popup closed" } });
    await expect(startGdriveAuth()).rejects.toThrow("popup closed");
  });

  it("rejects via the error callback's type when no message is given", async () => {
    installGis({ error: { type: "popup_failed_to_open" } });
    await expect(startGdriveAuth()).rejects.toThrow(
      "Google sign-in popup_failed_to_open",
    );
  });

  it("injects the GIS script and resolves once it loads", async () => {
    // No `window.google` yet, so `loadGisScript` injects a <script> and
    // waits for its onload before opening the token client.
    const promise = startGdriveAuth();
    const script = document.head.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]',
    ) as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    // Google's script finishing load exposes the global; fire onload.
    installGis({ response: { access_token: "tok-loaded" } });
    script?.onload?.(new Event("load"));
    await expect(promise).resolves.toBe("tok-loaded");
  });
});

describe("preloadGdriveAuth", () => {
  it("does not throw when GIS is already available", () => {
    installGis({ response: { access_token: "tok" } });
    expect(() => {
      preloadGdriveAuth();
    }).not.toThrow();
  });
});
