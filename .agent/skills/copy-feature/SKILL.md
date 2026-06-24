---
name: copy-feature
description: "Use whenever you want to bring a feature, look, modal, button, component, or behaviour from a sibling app (budget or notes) into this checklist app — 'port budget's split-entry modal', 'copy budget's company picker', 'copy the folder concept from notes', 'add notes' redesigned action bar'. Fetches the sibling repo into /tmp via the bundled clone-sibling.mjs helper, studies the named feature in place (its components, hooks, storage, styles, achievements, and the dependencies it needs), then re-implements it here adapted to the checklist domain — same structure and patterns, not a verbatim paste. Reach for this instead of hand-copying files, so the port stays idiomatic and self-consistent."
---

# Copying a feature from a sibling app into checklist

checklist, [`budget`](https://github.com/niclaslindstedt/budget), and
[`notes`](https://github.com/niclaslindstedt/notes) are sibling apps that
**inspire each other** — same stack (Vite + React 19 + Tailwind v4 +
`vite-plugin-pwa` + Vitest), same `OSS_SPEC.md` conventions, same `src/`-by-concern
layout, same CSS-variable token vocabulary, same i18n (en/sv) + achievements +
changeset machinery. `notes` in particular is the closest sibling — it shares
checklist's exact storage layer (the directory adapter, the markdown codec, the
namespace/folder registries), so a storage feature there often ports almost
line-for-line. Features flow every way: budget pioneered the update-download
wordmark fill, notes pioneered folders, checklist pioneered other surfaces. This
skill is the procedure for porting **from a sibling into checklist well** —
adapting a feature to the checklist domain rather than dumping files that don't
fit.

Use this skill every time you bring a sibling's feature across, so each port
lands in the same shape as the last.

> Throughout this skill `<sibling>` is whichever repo the feature lives in —
> `budget` or `notes`. The steps are identical; only the sibling name passed to
> the Step-0 helper and the domain mapping differ. (`notes` deals in *notes*
> where checklist deals in *checklists*, but its namespace/folder/storage
> vocabulary is the same.)

## When to invoke

Invoke when the task is "bring `<thing>` over from a sibling (budget / notes)",
e.g.:

- A UI surface: a modal, a picker, a confirm dialog, a header affordance, a
  progress indicator.
- A subsystem: an insights view, an import/staging flow, a storage capability.
- A look or interaction: a button style, a row layout, a gesture, an animation.

Do **not** invoke when:

- The feature has no sibling precedent — design it fresh in `src/` instead.
- You only need a single small utility you can read and retype in a minute
  (still _read_ the sibling's version for the pattern, but you don't need the
  full clone-and-port loop).

## Step 0 — Get the sibling's source into `/tmp`

Run the helper script — it puts the sibling's working tree under `/tmp` and
prints the path:

```sh
node .agent/skills/copy-feature/clone-sibling.mjs notes    # -> /tmp/notes
node .agent/skills/copy-feature/clone-sibling.mjs budget   # -> /tmp/budget
# optional 2nd/3rd args: a destination and a ref
node .agent/skills/copy-feature/clone-sibling.mjs notes /tmp/notes some-branch
```

The script tries three sources in order: the sibling's **mirror** on an
external git host (set via `MIRROR_BASE`; that host is typically reachable over
plain `git` even in the scoped sandbox where github.com is blocked, so it's a
real clone *with history*), then **github.com** (works in permissive sessions,
403-blocked in the scoped sandbox), then a **raw fallback** that fetches every
file over `raw.githubusercontent.com`. The siblings keep the mirror current via
their own `.github/workflows/mirror.yml`. **Don't hand-clone or hand-curl
around a failure; the script already encodes which paths work.**

> **Mirror config (provider-agnostic).** Set `MIRROR_BASE` (host+namespace,
> e.g. `gitlab.com/niclaslindstedt` or `codeberg.org/team`) to enable step 1;
> add `MIRROR_TOKEN` (+ optional `MIRROR_USER`, default `oauth2`) when the
> mirror is private. With none set, the script just falls through to github →
> raw.

> **Caveat — only the raw fallback lacks git history.** If the script logged
> "Cloned …" (mirror or GitHub), `git log`/`git show` work in the checkout. If
> it logged "Falling back to raw.githubusercontent.com" (no mirror, github
> blocked), there's no history — read the *why* (Step 1) from the PR's shipped
> artifacts instead: the `.changes/unreleased/*.md` fragment and the `docs/`
> diff, which the same checkout already contains, plus the GitHub PR page.

If the script fails outright (no outbound network at all), ask the user to paste
the relevant files — don't guess from memory, and don't fall back to the
scope-locked GitHub tools.

The script clears its destination first, so you always study current truth, and
it writes under `/tmp`, never inside this repo's working tree.

## Step 1 — Locate the feature in the sibling

Find every file the feature touches before copying anything. Each sibling's tree
is organized by concern, the same as ours:

```sh
cd /tmp/<sibling>
ls src                       # components|ui/ hooks/ domain|data/ storage/ i18n/ ...
rg -l "<FeatureName>" src     # ripgrep the term and the component name
```

Read `/tmp/<sibling>/AGENTS.md` and `/tmp/<sibling>/docs/` first — they keep a
`docs/dictionary.md` + `docs/overview.md` pair (same as ours) that maps user
vocabulary to concrete files. Use it to resolve what the user actually means.

Trace the whole dependency cone of the feature:

- The component(s) under `src/components/` and any modal host under
  `src/components/AppShell/*Host.tsx`.
- Hooks / state it reads (`src/hooks/use-*.ts`, `src/components/AppShell/hooks/*`,
  context modules).
- Pure logic under `src/data/` it calls (budget's name for domain logic).
- Persistence under `src/storage/` it touches.
- Achievement(s) under `src/data/achievements/` it unlocks.
- Styles: Tailwind classes plus any CSS variables from `src/styles/`.
- i18n keys under `src/i18n/locales/{en,sv}/`.
- npm dependencies it imports (check `/tmp/budget/package.json`).

### Read the feature's history for the *why*, not just the *what*

The current source tells you what the feature does; its **git history tells you
why it's shaped that way** — the design intent, the trap it avoids, the
behaviours it deliberately changed. Read it before porting so you re-create the
reasoning, not just the lines. Find the commits that built the feature and read
each one's message **and** the artifacts that carry the rationale:

```sh
cd /tmp/<sibling>
# Commits that touched the feature's files, newest first:
git log --oneline -30 -- src/ui/<Component>.tsx src/storage/<x>.ts
# The full message + diff for the one that introduced it:
git show <hash>
```

> **Learning, baked in:** these repos **squash-merge**, so a commit's body is
> usually *empty* — the subject line is just the PR title (`feat(sync): … (#118)`).
> The real rationale lives in the artifacts that PR shipped: the
> **`.changes/unreleased/*.md` changeset fragment** (the user-facing "what
> changed and why" in one sentence) and the **`docs/overview.md` / `docs/*.md`
> diff** in the same commit (the design narrative). Read those with
> `git show <hash> -- .changes/ docs/` when the commit body is bare. If the PR
> number is referenced (`(#118)`) and you have network, the GitHub PR
> description can add context — but the in-repo changeset + docs diff are
> authoritative and always reachable.

When the user names a specific commit or PR ("the redesigned action bar from
#112") and the Step-0 helper got the repo via `git clone`, `git show` that commit
(pass the ref as the helper's 3rd arg, or deepen the checkout, so it's reachable)
and read its message, changeset, and docs diff before porting the code. If Step 0
fell back to the raw fetch there is no local history — read the PR on GitHub and
the shipped `.changes/` + `docs/` files in the checkout instead.

## Step 2 — Map budget paths to checklist paths

The layouts line up by **concern**, but budget and checklist use different
folder names for two of them — budget's `components/` is our `ui/` + `app/`,
and budget's `data/` is our `domain/`. Port into the matching concern:

| budget                                  | checklist                              |
| --------------------------------------- | -------------------------------------- |
| `src/components/<Component>.tsx`        | `src/ui/<Component>.tsx`               |
| `src/components/AppShell/*` (shell, top-level state) | `src/app/*` (`App.tsx`, `use-*.ts`) |
| `src/components/AppShell/<X>ModalHost.tsx` | `src/app/modals/<X>ModalHost.tsx`   |
| `src/hooks/use-<x>.ts`                  | `src/app/use-<x>.ts` / `src/ui/hooks/<x>.ts` / `src/pwa/<x>.ts` (by concern) |
| `src/data/<x>.ts` (pure logic)          | `src/domain/<x>.ts`                    |
| `src/data/achievements/*`               | `src/achievements/*`                   |
| `src/storage/<x>.ts`                    | `src/storage/<x>.ts`                   |
| `src/i18n/locales/{en,sv}/<x>.ts`       | `src/i18n/locales/{en,sv}/<x>.ts`      |
| `src/styles/*`, `src/styles.css`        | `src/styles/*`, `src/styles.css`; theme tokens in `src/theme/` |
| `src/seo/routes.ts`                     | `src/seo/routes.ts`                    |
| `src/components/HomePage.tsx` (showcase) | `src/ui/ShowcasePage.tsx`             |
| `.changes/unreleased/*.md`              | `.changes/unreleased/*.md`             |
| `tests/*` (mirrors `src/`)              | `tests/*` (mirrors `src/`)             |

Honour the dependency rule the eslint config enforces in both repos. In
checklist that is `ui → domain`, `ui → storage`, `storage → domain`; **nothing
in `domain/` imports from `ui/`, `storage/`, `app/`, `window`, `document`, or
`fetch`.** budget's `data/` logic that reaches the DOM or storage must be
restructured to keep our `domain/` purity (the linter rejects a violation —
restructure, don't disable the rule).

## Step 3 — Bring over dependencies it needs

The app is **dependency-free by policy** for some things (e.g. icons are inline
SVGs — no `lucide-react`), and **no third-party network calls** are allowed
(no analytics, font CDNs, or error SaaS). Before installing anything budget
imports, check it doesn't violate those rules; prefer porting the inline
implementation budget uses.

If the feature genuinely needs an npm package this repo doesn't have, add it at
the **same version** budget pins (copy the spec from `/tmp/budget/package.json`):

```sh
rg '"<package>"' /tmp/budget/package.json   # read the exact version first
npm install <package>@<version>             # or -D for tooling/dev deps
```

Only add what the feature actually imports. After installing, re-run
`make lint` to confirm types resolve.

## Step 4 — Port and adapt (don't paste)

Re-create each file in its checklist home, then adapt it to the checklist
domain. Our model is **templates / checklists / items / namespaces / archive**
(`src/domain/types.ts`), not budget's accounts / sheets / budget rows /
transactions / loans — so:

- **Rename the domain vocabulary.** budget's `Account`, `Sheet`, `BudgetRow`,
  `Transaction`, `fiscalMonth`, `loan` become checklist concepts (a `Template`,
  a `Checklist`, a `ChecklistItem`, a `namespace`, "the list"). Don't leave
  budget nouns in the ported code — consult `docs/dictionary.md` for the right
  checklist term.
- **Keep the structure and patterns.** Same component decomposition, same hook
  shape, same external-store pattern (`useSyncExternalStore`), same
  modal-host / `Modal` primitive + `modal-bus`, same CSS-variable usage.
  Consistency between the two apps is the point.
- **Reuse our existing tokens.** Style through the CSS-variable vocabulary in
  `src/styles/` / `src/theme/`. If the feature needs a token checklist doesn't
  have yet, add it to the theme (and to every palette) rather than hard-coding
  a hex.
- **Mind the comments.** budget's source carries dense explanatory comments
  referencing its own features (sheets, fiscal months, coverage). Rewrite them
  for the checklist context; delete ones that no longer apply. Never ship a
  comment that describes budget.
- **i18n is mandatory.** Route every user-facing string through `src/i18n/`,
  adding the key to **both** `locales/en/<ns>.ts` and `locales/sv/<ns>.ts`
  (the Swedish file is typed against the English one, so a missing key is a
  compile error).

## Step 5 — Wire it in, and satisfy checklist's "same-PR" rules

Hook the ported feature into the checklist shell (`src/app/App.tsx` and its
state in `src/app/use-checklist.ts`). A modal needs a host under
`src/app/modals/` and a `modal-bus` command + trigger; a setting needs a place
in `src/settings/` and persistence. Leave the app building and navigable at
every step.

A user-facing feature in checklist is never *just* code — AGENTS.md requires
these in the **same PR**:

- **Tests** under `tests/` mirroring the `src/` path (Vitest; mock storage at
  the `StorageBackend` interface). Pure `domain/` logic gets DOM-free unit
  tests; UI gets jsdom tests.
- **An achievement** — every user-facing feature is also an unlockable trophy.
  Add it via the **`update-achievements`** skill (catalog entry + glyph + en/sv
  strings + wired trigger + test).
- **A changeset fragment** under `.changes/unreleased/` — use the
  **`write-changeset`** skill to decide the `type:`/`title:` and whether a
  feature doc is warranted.
- **Docs sync** — if the feature introduces a user-facing concept or word, add
  the `docs/dictionary.md` row **and** the `docs/overview.md` description.
- **Showcase sync** — if it changes what the app can do or what data it
  accesses, update `src/ui/ShowcasePage.tsx` and `SHOWCASE_ROUTE`.

## Verification

The port is done when:

- `make lint` is clean (zero warnings) — this also enforces the `domain/`
  purity boundary.
- `make test` passes, with new coverage under `tests/` for any ported
  `domain/` or `storage/` logic.
- `make build` succeeds and the service worker still emits.
- The feature works at a **mobile viewport first** (the primary target), then
  desktop. Run the dev server and check it by eye (see the `design` skill).
- No budget-only vocabulary, comments, dead imports, or unused deps remain.
- The achievement, changeset fragment, tests, and any docs/showcase edits ship
  in the same change.

## Common pitfalls

1. **Hand-cloning instead of using the Step-0 helper.** `git clone` of
   github.com 403s in a scoped session, and the git proxy / GitHub MCP are
   locked to this repo — don't retry them or hand-curl around them. Run
   `clone-sibling.mjs`, which already falls back to `raw.githubusercontent.com`.
2. **Pasting budget's domain nouns.** The single biggest tell of a lazy port.
   Translate every `account`/`sheet`/`row`/`transaction`/`loan` to a checklist
   concept via `docs/dictionary.md`.
3. **Hard-coded colours.** budget sometimes inlines a hex; route everything
   through the CSS-variable tokens so theming keeps working.
4. **Forgetting the same-PR obligations** — tests, an achievement, a changeset
   fragment, and docs/showcase sync are part of the feature, not follow-ups.
5. **Breaking the `domain/` boundary** by importing a hook or DOM call into a
   pure module — the linter will reject it; restructure instead of disabling
   the rule.
6. **Pulling a dependency that phones home or a non-inline icon set** — both are
   blocked by policy; port budget's inline implementation instead.
7. **Over-porting.** Bring the requested feature and its real dependencies, not
   the entire subsystem around it.

## Shared foundations already here — reuse, don't re-port

checklist already carries the cross-cutting infrastructure budget features lean
on, so a port almost always *reuses* these rather than bringing them over:

- **Modal stack + command bus** — `src/ui/Modal.tsx`, `src/ui/modal-bus.ts`,
  `src/ui/ModalBusProvider.tsx`; add a modal by extending the command union and
  adding a host under `src/app/modals/`.
- **Theme engine + tokens** — `src/theme/*` and the palettes in `src/styles/`.
- **Achievements** — `src/achievements/*` + `src/ui/achievements/*` (use the
  `update-achievements` skill to add one).
- **Changelog / "What's new" modal** — `src/ui/changelog/*` and the
  dependency-free markdown renderer `src/ui/markdown/renderMarkdown.tsx`.
- **Cloud sync status** — `src/ui/SyncStatus.tsx` / `SyncDetailsModal.tsx` over
  the `StorageBackend` interface.
- **Undo / redo** — `src/app/use-undo-redo.ts`.
- **Namespaces** — `src/storage/` namespace layer + `src/ui/Namespaces*`.
- **i18n** — `src/i18n/` (en + sv, the sv file typed against en).
- **Toast** — `src/ui/toast/*` (budget calls silent actions out with a toast;
  reuse ours).

If a budget feature depends on infrastructure checklist *doesn't* have yet,
port that foundation first as its own `copy-feature` pass, then record it below.

## Skill self-improvement

After a port:

1. If budget's layout has drifted from the path map in Step 2, update the table
   here.
2. If you discovered a reusable sub-port (a foundation you had to bring over
   before the real feature), add it to "Shared foundations already here" so the
   next run reuses it.
3. If how the sibling source is reached changed (proxy rules, scope, a new
   mirror, an auth requirement), update `clone-sibling.mjs` and the Step 0
   summary — keep the clone-then-raw-fallback logic current.
4. Commit the SKILL.md edit alongside the ported feature, and refresh
   `.last-updated` with today's date.
