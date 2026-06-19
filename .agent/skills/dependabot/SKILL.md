---
name: dependabot
description: 'Use when the user wants to clear out the open Dependabot PRs — "do the dependabot PRs", "update the deps", "merge dependabot". Consolidates every open Dependabot bump into ONE branch + PR, resolves the peer-dependency fallout the bumps trigger (a Vite / ESLint / TypeScript major drags transitive tooling with it), gets the full CI chain green, then closes the superseded Dependabot PRs. Manual playbook — not part of the `maintenance` umbrella.'
---

# Clearing the Dependabot queue

Dependabot opens one PR per bump. Merging them one at a time means N−1
rebases as each merge invalidates the next PR's `package-lock.json`, and
the major bumps (Vite, ESLint, TypeScript) fail in isolation anyway
because they need transitive tooling bumps Dependabot never grouped in.
**So don't merge them individually — consolidate.** Pull every target
version onto one branch, fix the fallout once, ship one PR, then close
the originals.

This is a dependency bump, not a feature. Resist the urge to refactor
working code to satisfy new lint opinions the majors pull in — keep the
diff to versions + the minimum to make CI green.

## 1. Enumerate the PRs

`mcp__github__list_pull_requests` (state `open`) — the full list can blow
the token budget, so if it overflows, parse the saved file with python
and filter `user.login == "dependabot[bot]"`. Record number + title; the
title carries the target version for single-package bumps.

For **grouped / multi bumps** the title omits versions ("bump the
typescript-eslint group"). Pull the target out of the diff:
`mcp__github__pull_request_read` method `get_diff` — read the
`package.json` hunk, not the lock.

## 2. Apply the npm bumps

Edit `package.json` to the target caret ranges for every npm PR at once.
Then **the part Dependabot doesn't tell you**: a major bump's peers need
their own bumps, and those aren't separate Dependabot PRs. Before
installing, check the peers of anything a major touches:

```
npm view <pkg> peerDependencies          # what range does it demand?
npm view <pkg> version                    # latest available
npm view <pkg>@<ver> peerDependencies     # peers of a specific version
```

The general principle: **a major's peers need their own bumps that
Dependabot didn't group.** Known coupling in this repo (re-verify
versions with the commands above — the shape holds, the numbers drift):

- **Vite major** → `vite-plugin-pwa` peers Vite on a specific major
  range; a Vite major usually needs the plugin's next major line. Check
  `npm view vite-plugin-pwa@<ver> peerDependencies` for the Vite range
  it accepts and bump it alongside Vite. `vitest`'s Vite peer is usually
  wide — check but it normally already allows the new Vite.
  `@vitejs/plugin-react` peers Vite tightly too (its 6.x line peers
  `vite ^8`) — bump it onto the line that lists the new Vite major.
- **`vite-plugin-pwa` 1.x** → its 1.0 line peers
  `@vite-pwa/assets-generator ^1.0.0`, so the two move together; bump
  `@vite-pwa/assets-generator` to its 1.x alongside the plugin. The
  assets-generator major also re-encodes `favicon.ico` from the same
  source SVG (a few bytes smaller), which trips the `icons-check` CI
  step — see step 6.
- **ESLint major** → a new ESLint or `@typescript-eslint`/`typescript-eslint`
  major can grow its `recommended` preset with new rules (see step 4),
  and its `eslint` peer must list the new major. Bump
  `typescript-eslint`, `@eslint/js`, and `eslint-plugin-import` to
  versions whose `eslint` peer spans the new major. If a lint/format
  plugin's declared peer lags the host's major but works fine in
  practice, prefer an `overrides` shim over downgrading the host:
  ```json
  "overrides": { "<lagging-plugin>": { "eslint": "$eslint" } }
  ```
- **TypeScript major** → confirm `typescript-eslint`'s `typescript`
  peer still spans it. Bump typescript-eslint to its latest 8.x line if
  the installed one predates the new TS allowance.

Then resolve cleanly. A stale lock produces misleading ERESOLVE traces,
so wipe both:

```
rm -rf node_modules package-lock.json && npm install
```

Read the first ERESOLVE block top-to-bottom — it names the exact package
and the peer range that conflicts. Bump that package, re-install. Two or
three rounds clears it.

## 3. Make the code compile against the new majors

```
npx tsc --noEmit
```

This repo is vanilla TypeScript — there is no codegen step and no
generated module to build first. If a new major changes a type surface
the code relies on, chase the error through tsc: it points at each
offending site in turn. Widen or adjust the annotation at the point
tsc flags it; don't restructure working logic to dodge a type change.

## 4. Lint — preserve the surface, don't adopt new rules

A new ESLint, `@typescript-eslint`, **or `eslint-plugin-react-hooks`**
major can grow its `recommended` preset with a wave of new rules that
fire on deliberate, working patterns. **Adopting them is a standalone
refactor, not part of a version bump.** Turn the newly-firing rules off
in `eslint.config.js` (after the `...recommended.rules` spread) with a
comment explaining they arrived via the bump, so the prior lint surface
is preserved and the diff stays about versions. Disabling the
newly-firing rules to preserve the prior lint surface is a bump;
adopting them is a separate refactor.

The `eslint-plugin-react-hooks` 5→7 jump notably added
`react-hooks/set-state-in-effect` and `react-hooks/refs` to its
`recommended` preset — both fire across existing effects/test harnesses;
disable them rather than refactoring.

Discover _which_ rules are new by counting failures by ruleId rather
than scrolling the full message list:

```
npx eslint . -f json | python3 -c "import json,sys,collections; c=collections.Counter(m.get('ruleId') for f in json.load(sys.stdin) for m in f['messages']); print(*[f'{n} {r}' for r,n in c.most_common()],sep=chr(10))"
```

Mention the disabled rules in the PR body so the maintainer can adopt
them deliberately later.

## 5. GitHub Actions bumps

These live in `.github/workflows/*.yml` as `uses: actions/x@vN`. The
workflows currently pin `actions/checkout@v4`, `actions/setup-node@v4`,
`actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, and
`actions/deploy-pages@v4`. One sed across the directory:

```
sed -i 's#actions/checkout@v4#actions/checkout@v6#g; \
        s#actions/setup-node@v4#actions/setup-node@v6#g; \
        ...' .github/workflows/*.yml
```

Map each `@vN → @vM` from the corresponding PR title, matching the real
pins above. No install needed.

## 6. Verify, ship, close

Run the exact chain CI's `test` job runs (`.github/workflows/ci.yml`):

```
npm run build && npm test && npm run lint && make icons-check
```

(`npm run lint` is `eslint . && tsc --noEmit` — it _is_ the typecheck;
there is no separate `make typecheck`. **CI does not run `fmt-check`** —
prettier formatting is not gated, so don't reformat unrelated
preexisting files to chase a green `prettier --check .`; just keep your
own changed files prettier-clean.)

**`make icons-check` _is_ gated** and regenerates every icon from
`public/favicon.svg` via `@vite-pwa/assets-generator`. Bumping that
generator across a major changes its `favicon.ico` output, so after such
a bump run `make icons` and commit the regenerated `public/favicon.ico`
(the PNGs usually stay byte-identical) or this step fails.

Commit (one `chore(deps):` commit is fine), push `-u origin <branch>`,
open the PR ready-for-review listing every bump it subsumes and the
disabled-rule note from step 4.

**Changeset**: pure dependency bumps with no intended behaviour change
are `no-changelog`. Apply the label via `mcp__github__issue_write`
immediately after opening (the `changeset` check fires on `opened` and
re-runs on `labeled`).

**Close the superseded PRs**: for each original Dependabot PR, post one
short comment pointing at the consolidated PR, then close it
(`mcp__github__pull_request_read`/`update_pull_request` with `state:
closed`). Closing the branch Dependabot owns is enough — it won't
reopen for the same version.

## Bumps-in-the-road checklist

- Stale `package-lock.json` → misleading ERESOLVE. `rm -rf node_modules
package-lock.json` before trusting the trace.
- `vite-plugin-pwa` must move with a Vite major — it's not in the
  Dependabot batch. Check its `peerDependencies` for the Vite range, and
  `@vitejs/plugin-react` (peers Vite tightly, e.g. 6.x → `vite ^8`).
- `vite-plugin-pwa` 1.x peers `@vite-pwa/assets-generator ^1.0.0` — bump
  the generator with it.
- `@vite-pwa/assets-generator` major re-encodes `favicon.ico` → run
  `make icons` and commit it, or the gated `make icons-check` fails.
- A lint/format plugin whose peer lags the host's major → `overrides`
  shim, not a downgrade of the host.
- New `recommended` lint rules from a major → disable (with a comment),
  don't refactor. `eslint-plugin-react-hooks` 7 adds
  `react-hooks/set-state-in-effect` and `react-hooks/refs`.
- CI does **not** run `fmt-check` — don't reformat unrelated preexisting
  files chasing a green `prettier --check .`; this `SKILL.md` is itself
  prettier-ignored (lives under `.agent`/`.claude`).
- Don't merge the PRs individually — consolidate into one.

## Improve this skill every run

This playbook is only as good as the last bump taught it. **Every time
you run it, leave it sharper than you found it** — in the same PR, before
you call the task done:

1. **Capture what surprised you.** Anything that cost you a round trip
   the skill didn't warn about — a new peer-coupling (package X had to
   move with major Y), a fresh API break in the new versions, a new wave
   of lint rules, a CI job that fired on an event you didn't expect — is
   a missing line here. Add it to the matching numbered step **and** a
   one-liner in the "Bumps-in-the-road checklist" so it's catchable at a
   glance.
2. **Correct what was wrong or stale.** If a version pin, peer range, or
   instruction in here didn't match reality this time (e.g. a plugin
   caught up to a peer and the `overrides` entry is no longer needed),
   edit it in place rather than appending a contradiction. The skill
   describes the _current_ shape, not its history — don't narrate "used
   to be X"; just make it say Y.
3. **Keep it lean.** Fold new findings into existing bullets where they
   belong instead of growing a parallel list. A 200-line skill nobody
   reads helps no one; the value is in the few non-obvious traps, kept
   current. Prune advice that the tooling has since made automatic.
4. **Generalize before you write.** A trap from one package (a plugin
   lagging ESLint) is worth more stated as the pattern ("lint/format
   plugins lag their host's major; prefer an `overrides` shim over
   downgrading the host"). Capture the shape, cite the instance as the
   example.

The frontmatter `description` is load-bearing too: if you find this skill
fired for a request it shouldn't have, or _didn't_ fire when it should,
adjust the trigger phrasing there in the same pass.
