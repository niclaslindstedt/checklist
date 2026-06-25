// Google Identity Services (GIS) OAuth flow for the Google Drive backend.
// Lazily injects Google's `gsi/client` script, then opens the consent popup
// and resolves with a short-lived access token. Kept separate from the
// file-store adapter (`./index.ts`) so the OAuth plumbing is independently
// testable and the next cloud backend has a pattern to copy rather than
// re-derive. The adapter receives a token from here via `useCloudTokens`.

import { createLogger } from "../../dev/logger.ts";
import { GOOGLE_CLIENT_ID } from "./index.ts";

const log = createLogger("gdrive");

// `drive.file` lets the app see and manage only files it created. Files
// stay visible to the user in Drive's UI.
export const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

type GisTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GisTokenClientConfig = {
  client_id: string;
  scope: string;
  callback: (response: GisTokenResponse) => void;
  error_callback?: (err: GisErrorResponse) => void;
};

type GisTokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

type GisErrorResponse = {
  type: string;
  message?: string;
};

type GisGlobal = {
  accounts: {
    oauth2: {
      initTokenClient(config: GisTokenClientConfig): GisTokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GisGlobal;
  }
}

let gisLoaderPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (typeof window !== "undefined" && window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisLoaderPromise) return gisLoaderPromise;
  log.info(`loadGisScript: injecting <script> src=${GIS_SCRIPT_URL}`);
  gisLoaderPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        gisLoaderPromise = null;
        reject(
          new Error(
            "Google sign-in loaded but didn't initialise. Reload the page and try again.",
          ),
        );
      }
    };
    script.onerror = () => {
      gisLoaderPromise = null;
      reject(
        new Error(
          "Couldn't reach Google to start sign-in. Check your connection (Wi-Fi, VPN, Private Relay, or content blocker) and try again.",
        ),
      );
    };
    document.head.appendChild(script);
  });
  return gisLoaderPromise;
}

// Kick off the GIS script load without blocking, so the eventual
// `requestAccessToken` runs synchronously inside the user gesture and the
// popup isn't blocked.
export function preloadGdriveAuth(): void {
  void loadGisScript().catch((err: unknown) => {
    log.warn(
      `preloadGdriveAuth: preload failed (will retry on click): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
}

// Opens the Google consent popup and resolves with a short-lived access
// token. Throws when the user dismisses the popup, the popup is blocked,
// or Google returns an error.
export async function startGdriveAuth(): Promise<string> {
  await loadGisScript();
  const gis = window.google?.accounts?.oauth2;
  if (!gis) {
    throw new Error("Google Identity Services unavailable after load");
  }
  return new Promise<string>((resolve, reject) => {
    const client = gis.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GDRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          const desc = resp.error_description ?? resp.error;
          reject(new Error(`Google sign-in failed: ${desc}`));
          return;
        }
        if (!resp.access_token) {
          reject(new Error("Google did not return an access token"));
          return;
        }
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(
          new Error(err.message ?? `Google sign-in ${err.type ?? "failed"}`),
        );
      },
    });
    client.requestAccessToken();
  });
}
