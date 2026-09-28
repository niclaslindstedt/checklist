// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the web app the phone app embeds: `vite build` at the repo root with
// `VITE_NATIVE=1`, into `native/webroot/`, which the `withWebroot` config
// plugin copies into both native projects at `expo prebuild` and the static
// server serves from a loopback origin (`src/useStaticServer.ts`).
//
// `VITE_NATIVE=1` is what makes it the phone build (`../../vite.config.ts`):
// no service worker and no update prompt — the app changes only when a new
// build ships — and none of what only the website carries: the Donate link,
// the achievements, and every link back to the source (the owner's decision
// D17). `APP_DISPLAY_NAME`, the store listing's name, passes through to the
// build, which calls the app by it; a `production` bundle is headed for a
// store, so it refuses to be built without it.
//
// The webroot is then refused if it still carries any of that — a Donate
// link, the achievements, `niclaslindstedt`, or a service worker (`sw.js`) —
// by `scripts/website-only.mjs`, the check the desktop's bundle script runs
// too.
//
// Usage:
//   node native/scripts/bundle-web.mjs                        # from the repo root
//   node native/scripts/bundle-web.mjs --profile production   # the store build
//
// The webroot is a build artifact (gitignored). Generate it before
// `eas build`; the root `.easignore` is what keeps it in the EAS upload.

import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertWebsiteOnlyAbsent } from "../../scripts/website-only.mjs";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");
const WEBROOT = join(APP_DIR, "webroot");
const WINDOWS = process.platform === "win32";
const NPM = WINDOWS ? "npm.cmd" : "npm";

/**
 * The environment the phone app's web build runs in.
 *
 * @param {Record<string, string | undefined>} env the caller's environment
 * @param {string} profile the EAS profile the bundle is for
 * @returns {Record<string, string | undefined>}
 */
export function nativeBuildEnv(env, profile) {
  const displayName = env.APP_DISPLAY_NAME?.trim() ?? "";
  if (profile === "production" && !displayName) {
    throw new Error(
      "APP_DISPLAY_NAME is not set. A production bundle names the app inside " +
        "it after the store listing — pass the same APP_DISPLAY_NAME the EAS " +
        "build gets (native/RELEASING.md).",
    );
  }
  const out = { ...env, VITE_NATIVE: "1" };
  if (displayName) out.APP_DISPLAY_NAME = displayName;
  else delete out.APP_DISPLAY_NAME;
  return out;
}

function main() {
  const at = process.argv.indexOf("--profile");
  const profile =
    (at >= 0 ? process.argv[at + 1] : undefined) ??
    process.env.EAS_BUILD_PROFILE ??
    "preview";
  const env = nativeBuildEnv(process.env, profile);
  console.log(
    `• building the phone app's web bundle — profile ${profile}, named ` +
      (env.APP_DISPLAY_NAME
        ? `"${env.APP_DISPLAY_NAME}"`
        : "by the project (APP_DISPLAY_NAME unset)") +
      "…",
  );
  execFileSync(
    NPM,
    ["run", "build", "--", "--outDir", WEBROOT, "--emptyOutDir"],
    {
      cwd: REPO_DIR,
      stdio: "inherit",
      // npm on Windows is a batch shim, which Node cannot execute directly.
      shell: WINDOWS,
      env,
    },
  );
  assertWebsiteOnlyAbsent(WEBROOT);
  console.log(
    `✓ ${WEBROOT}: no Donate link, no achievements, no link to the source, ` +
      `no service worker`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
