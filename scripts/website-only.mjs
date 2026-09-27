// Refuses an app bundle that carries what only the website may: a Donate
// link (App Store guideline 3.1.1 — `DONATE_URL` in `src/build-env.ts`) or
// the achievements (`ACHIEVEMENTS_BUILT`, the same file). Both are compiled
// out of the phone build (`VITE_NATIVE=1`) and the desktop build
// (`VITE_SHELL_BUILD=on`); a `dist/` left by a website build carries them,
// and so would a webroot copied from it. This is the check that the build
// honoured the flags — the failure is otherwise invisible until review.
//
// Looks for the Donate fallback and whatever `VITE_DONATE_URL` this shell
// has set, for strings only the achievements catalog spells, and for lines
// only the achievements feature page (`docs/features/achievements.md`) has.
//
// Usage (the desktop's `tauri/scripts/bundle-web.mjs` imports it):
//   node scripts/website-only.mjs native/webroot

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEXT = /\.(html|js|mjs|css|json|webmanifest|txt|xml)$/;

function needles() {
  return [
    ["a Donate link", "github.com/sponsors"],
    ["a Donate link", process.env.VITE_DONATE_URL?.trim()],
    ["the achievements", "Every feature in the app is an achievement"],
    ["the achievements", "Achievement unlocked"],
    [
      "the achievements page",
      "Every feature in the app is also an unlockable trophy",
    ],
    ["the achievements page", "Watch the header trophy."],
  ].filter(([, needle]) => needle);
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (TEXT.test(name)) yield path;
  }
}

/** Throws when any text file under `dir` carries a website-only needle. */
export function assertWebsiteOnlyAbsent(dir) {
  const list = needles();
  for (const path of files(dir)) {
    const text = readFileSync(path, "utf8");
    const hit = list.find(([, needle]) => text.includes(needle));
    if (hit) {
      throw new Error(
        `${relative(process.cwd(), path)} carries ${hit[0]} (${hit[1]}) — ` +
          `only the website may. Build it with VITE_NATIVE=1 (phone) or ` +
          `VITE_SHELL_BUILD=on (desktop) rather than copying a website dist/.`,
      );
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/website-only.mjs <bundle dir>");
    process.exit(2);
  }
  try {
    assertWebsiteOnlyAbsent(dir);
    console.log(`✓ ${dir}: no Donate link, no achievements`);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
