// Iterative design screenshot harness. The `recipe` block at the end
// of this file is the only thing an agent edits per iteration — the
// helpers above are stable building blocks for common app flows.
//
// REQUIRES PLAYWRIGHT (not currently a dependency of this repo). This
// script imports `@playwright/test`, which checklist does not yet
// install. Before running this skill, the maintainer must:
//
//   npm i -D @playwright/test && npx playwright install chromium
//
// Nothing else in the repo depends on Playwright, so it is left out of
// `package.json` by default. Add it only if you want this skill to run.
//
// Run:
//
//   npm run dev &                              # leave running in the background
//   node .agent/skills/design/screenshot.mjs   # captures the recipe at every viewport
//
// Then `Read` the PNGs written under /tmp/design-*.png, tweak code,
// rerun. Vite HMR picks up edits without a rebuild so each loop is
// ~1-2s once the dev server is warm.
//
// CLI flags (all optional, sensible defaults):
//
//   --base-url <url>       Where the app is served (default
//                          http://localhost:5173/). Auto-falls back to
//                          the vite preview server when the dev port is
//                          silent.
//   --out <dir>            Output directory (default /tmp).
//   --name <prefix>        Filename prefix (default "design").
//   --viewports <list>     Comma-separated subset of
//                          desktop,mobile,mobile-landscape,tablet
//                          (default desktop,mobile).

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// === HELPERS (don't edit — these stay stable across recipes) ===

// Playwright's `newContext` takes `viewport: { width, height }` as a
// nested object — passing `width` / `height` at the top level is a
// silent no-op and lands on the default 1280×720 desktop. Every entry
// here is shaped for direct spread into the context options.
const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 800 } },
  // iPhone 12 viewport — same `390 × 844` Playwright's "iPhone 12"
  // device descriptor exposes, with hasTouch / isMobile flipped so
  // touch interactions work and the mobile media queries match.
  mobile: {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  },
  "mobile-landscape": {
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  },
  // iPad mini portrait — wide enough to render the desktop layout
  // but narrow enough that responsive overrides are visible.
  tablet: {
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
    isMobile: true,
  },
};

// Land on the app and wait until the shell has rendered. checklist has
// no auth / guest gate — `src/app/main.ts` mounts straight into the
// "checklist" heading — so this just navigates and waits for the
// wordmark before a recipe chains further interactions.
export async function openApp(page) {
  await page.goto("./");
  await page
    .getByRole("heading", { name: "checklist", level: 1 })
    .waitFor();
}

// Open the share dialog from the current checklist. Stub for the share
// surface (URL-fragment encode/decode lives in `src/share/`). Wire the
// real selector once the share trigger exists in `src/ui/`; until then
// it documents the intended entry point for recipes.
export async function openShareDialog(page) {
  await page.getByRole("button", { name: /share/i }).click();
  await page.getByRole("dialog").waitFor();
}

// Open the settings / storage panel (the LocalStorage / Google Drive /
// Dropbox backend picker). Settings live behind the side navigation
// drawer: open the drawer ("Open navigation"), then pick "Settings"
// from the burger menu pinned at its foot.
export async function openSettings(page) {
  await page.getByRole("button", { name: /open navigation/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole("menuitem", { name: /^settings$/i }).click();
  await page.getByRole("dialog").waitFor();
}

// Pop the local `npm run dev` Vite server, or fall back to the built
// preview server if dev is silent. The skill prefers dev for HMR
// speed; preview is the deterministic backup.
async function resolveBaseUrl(explicit) {
  if (explicit) return explicit;
  const candidates = ["http://localhost:5173/", "http://localhost:4173/"];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(750) });
      if (res.ok || res.status === 304) return url;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    "No app server reachable. Start `npm run dev` (or `make build && npm run preview`) before running this script.",
  );
}

function parseArgs(argv) {
  const args = { out: "/tmp", name: "design", viewports: "desktop,mobile" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const [flag, inline] =
      eq === -1 ? [a, undefined] : [a.slice(0, eq), a.slice(eq + 1)];
    const value = inline ?? argv[++i];
    if (flag === "--base-url") args.baseUrl = value;
    else if (flag === "--out") args.out = value;
    else if (flag === "--name") args.name = value;
    else if (flag === "--viewports") args.viewports = value;
    else throw new Error(`Unknown flag: ${flag}`);
  }
  return args;
}

// === RECIPE (edit this per iteration) ===
//
// `recipe` runs once per viewport. It receives the page already
// pointed at the right base URL but otherwise empty — drive the UI
// however you need, ending in the visual state you want to inspect.
// The harness takes the screenshot for you after this returns.
//
// `viewport` is the key from VIEWPORTS so the recipe can branch on
// breakpoint when needed (e.g. only exercise a mobile-only control).

async function recipe(page, _viewport) {
  await openApp(page);

  // Add one item and check it so the bulk actions are enabled, not dimmed.
  await page.getByRole("button", { name: /^add item$/i }).click();
  const input = page.getByRole("textbox", { name: /^add item$/i });
  await input.fill("Buy milk");
  await input.press("Enter");
  // Blur the still-open composer so the (+) button comes back.
  await page.getByRole("heading", { name: "checklist", level: 1 }).click();
  await page.waitForTimeout(150);
  await page
    .getByRole("checkbox", { name: /^check item$/i })
    .first()
    .check({ force: true });

  // Long-press the (+) to fan out the bulk-action row, then release the
  // pointer *away* from the row so the pointerup doesn't land on a bulk
  // button (which would fire it and collapse the row again).
  const add = page.getByRole("button", { name: /^add item$/i });
  const box = await add.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.move(box.x + box.width / 2, box.y - 200);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

// === RUN (don't edit) ===

async function main() {
  const args = parseArgs(process.argv);
  const baseURL = await resolveBaseUrl(args.baseUrl);
  if (!existsSync(args.out)) await mkdir(args.out, { recursive: true });
  const viewports = args.viewports.split(",").map((s) => s.trim());
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      const spec = VIEWPORTS[viewport];
      if (!spec) {
        console.error(
          `Unknown viewport "${viewport}". Known: ${Object.keys(VIEWPORTS).join(", ")}`,
        );
        process.exitCode = 1;
        continue;
      }
      const ctx = await browser.newContext({ baseURL, ...spec });
      const page = await ctx.newPage();
      try {
        await recipe(page, viewport);
        const path = join(args.out, `${args.name}-${viewport}.png`);
        await page.screenshot({
          path,
          fullPage: viewport.startsWith("mobile") ? false : true,
        });
        console.log(path);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
