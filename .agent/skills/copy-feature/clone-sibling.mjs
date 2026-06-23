#!/usr/bin/env node
// Get a sibling repo's working tree into a local folder so the
// copy-feature skill can read it. Three ways in, tried in order:
//
//   1. GitLab mirror clone — the siblings push-mirror themselves to
//      gitlab.com (see each repo's .github/workflows/mirror-gitlab.yml).
//      gitlab.com is reachable over plain `git` even in the scoped web
//      sandbox where github.com is blocked, so this is a real clone
//      *with history* — preferred whenever the mirror exists.
//
//   2. GitHub clone — fast and also has history, but github.com egress
//      is denied with HTTP 403 in a scoped sandbox (a host-level block;
//      even an unrelated public repo 403s). Works in permissive sessions.
//
//   3. raw-file fallback — `raw.githubusercontent.com` and
//      `api.github.com` stay reachable when github.com's git transport
//      doesn't, so we list the tree via the API and download every blob
//      over raw. This gives file *contents* but no git history.
//
// Usage:
//   node clone-sibling.mjs <repo|owner/repo> [dest] [ref]
//
//   node clone-sibling.mjs notes                 # -> /tmp/notes   @ main
//   node clone-sibling.mjs budget /tmp/b         # -> /tmp/b       @ main
//   node clone-sibling.mjs notes /tmp/notes dev  # -> /tmp/notes   @ dev
//
// Override the GitLab mirror namespace with GITLAB_OWNER (defaults to the
// GitHub owner). Set GITLAB_TOKEN (a GitLab read token) when the mirror is
// a *private* project — it is embedded in the clone URL so the anonymous
// clone of a private mirror doesn't fail; a public mirror needs no token.
// The resolved destination path is printed to STDOUT on success; all
// progress and diagnostics go to STDERR so the path can be captured
// cleanly (`DEST=$(node clone-sibling.mjs notes)`).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DEFAULT_OWNER = "niclaslindstedt";
const CA = "/root/.ccr/ca-bundle.crt";

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

function die(msg) {
  log(`error: ${msg}`);
  process.exit(1);
}

const [repoArg, destArg, refArg] = process.argv.slice(2);
if (!repoArg) {
  die("usage: clone-sibling.mjs <repo|owner/repo> [dest] [ref]");
}

const [owner, repo] = repoArg.includes("/")
  ? repoArg.split("/")
  : [DEFAULT_OWNER, repoArg];
const gitlabOwner = process.env.GITLAB_OWNER || owner;
const dest = destArg || `/tmp/${repo}`;
const ref = refArg || "main";

// Start from a clean destination so each run studies current truth.
rmSync(dest, { recursive: true, force: true });

// curl args: only pass --cacert when the proxy bundle is present (a
// permissive, non-proxied environment won't have it).
const caArgs = existsSync(CA) ? ["--cacert", CA] : [];

function tryGitClone(url) {
  // Never print an embedded credential (oauth2:<token>@) to the log.
  const safe = url.replace(/\/\/[^@/]+@/, "//");
  log(`Trying git clone ${safe} ...`);
  const r = spawnSync(
    "git",
    ["clone", "--depth", "50", "--branch", ref, url, dest],
    {
      stdio: ["ignore", "ignore", "pipe"],
      // Don't let git hang on an auth prompt for a private repo.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    },
  );
  if (r.status === 0) {
    log(`Cloned ${safe} (with history).`);
    return true;
  }
  const stderr = (r.stderr || "").toString().trim();
  log(`  unavailable (${stderr.split("\n").pop() || r.status}).`);
  // A partial checkout may exist if clone failed late; clear it.
  rmSync(dest, { recursive: true, force: true });
  return false;
}

// A GitLab read token (env GITLAB_TOKEN) is embedded into the mirror URL
// so a *private* mirror can still be cloned; without it the clone is
// anonymous and only works for a public mirror.
function gitlabUrl() {
  const token = process.env.GITLAB_TOKEN || "";
  const auth = token ? `oauth2:${token}@` : "";
  return `https://${auth}gitlab.com/${gitlabOwner}/${repo}.git`;
}

function curlText(url) {
  const r = spawnSync("curl", ["-fsS", ...caArgs, url], { encoding: "utf8" });
  if (r.status !== 0) {
    die(`curl ${url} failed: ${(r.stderr || "").toString().trim()}`);
  }
  return r.stdout;
}

function curlToFile(url, out) {
  mkdirSync(dirname(out), { recursive: true });
  const r = spawnSync("curl", ["-fsS", ...caArgs, url, "-o", out], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    die(`curl ${url} failed: ${(r.stderr || "").toString().trim()}`);
  }
}

function fetchViaRaw() {
  log(`Falling back to raw.githubusercontent.com for ${owner}/${repo}@${ref} ...`);
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
  const tree = JSON.parse(curlText(treeUrl));
  if (tree.message) {
    die(`GitHub API: ${tree.message}`);
  }
  const blobs = (tree.tree || []).filter((e) => e.type === "blob");
  if (blobs.length === 0) {
    die(`no files found in ${owner}/${repo}@${ref}`);
  }
  mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const entry of blobs) {
    const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${entry.path}`;
    curlToFile(raw, join(dest, entry.path));
    if (++n % 100 === 0) log(`  …${n}/${blobs.length} files`);
  }
  log(`Fetched ${blobs.length} file(s) (no git history).`);
  if (tree.truncated) {
    // The trees API caps very large repos. Note the gap rather than
    // pretending the checkout is complete.
    writeFileSync(
      join(dest, ".clone-sibling-truncated"),
      "GitHub's git/trees API truncated this listing — some files are missing.\n",
    );
    log(
      "warning: tree was truncated by the API — the checkout is incomplete. " +
        "Fetch any missing file individually over raw.githubusercontent.com.",
    );
  }
}

// GitLab mirror first (reachable + has history), then GitHub, then the
// raw fallback for the file contents.
if (
  !tryGitClone(gitlabUrl()) &&
  !tryGitClone(`https://github.com/${owner}/${repo}.git`)
) {
  fetchViaRaw();
}

log(`Sibling ready at ${dest}`);
process.stdout.write(`${dest}\n`);
