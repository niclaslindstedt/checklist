---
name: refactor
description: "Use to work through the refactor backlog in docs/refactoring-roadmap.md or to extend it with newly-discovered code smells. Picks the highest-leverage pending item, re-verifies its severity against the current tree (line counts and the smell shape drift over time), and either lands the fix, skips it with a written reason, or extends the roadmap when exploration mode finds something new. Grounded in the roadmap — bootstraps it on first run, and stops when the queue is empty rather than refactoring for its own sake."
---

# Working the refactor roadmap

`docs/refactoring-roadmap.md` is the single source of truth for what
this codebase considers a code smell worth fixing. It carries:

- a strategic-context section explaining why the smells matter — the
  goal is to keep the codebase clean and the layering honest so new
  UI surfaces, new storage backends (the `StorageBackend` interface
  must stay interchangeable across LocalStorage / Google Drive /
  Dropbox), and new share / template features stay easy to add;
- a **severity rubric** (1–10, with **3** as the fix threshold and
  an "easy wins" carve-out for mechanical zero-risk transforms);
- a **Pending** list grouped by severity band, with line counts and
  refactor plans;
- a **Landed** list of past fixes;
- an **Investigated and skipped** list of candidates rejected on
  prior sweeps, with the reasoning.

This skill is the operating procedure for that file. There are two
modes:

- **Work mode** — pick the highest-leverage pending item, verify,
  land it (or skip it with a reason).
- **Explore mode** — survey the codebase for smells the roadmap
  hasn't catalogued yet, rate them, and append them to **Pending**.

The skill is **grounded**: every action references a specific row in
the roadmap. Don't refactor code that isn't on the list — file a
finding under Explore mode first, get it rated, then land it on a
follow-up pass. **Don't keep going once Pending is empty.** A clean
roadmap means the layering is honest and the next UI surface,
storage backend, or share feature has a clean runway; the next
session will re-survey before adding anything new.

## Bootstrap — first run, before anything else

`docs/refactoring-roadmap.md` does not exist yet in this repo. The
**first** time this skill runs, create it before doing any other
work:

1. Write `docs/refactoring-roadmap.md` with:
   - a short **strategic-context** intro (the clean-layering framing
     above — honest dependency direction, interchangeable storage
     backends, easy-to-add UI surfaces and share/template features);
   - the **severity rubric** table (reproduced under "Rate each
     finding" below);
   - an empty **Pending** section (with the severity-band
     sub-headings and an "Easy wins" carve-out at the bottom);
   - an empty **Landed** section;
   - an empty **Investigated and skipped** section.
2. Then proceed in **Explore mode** to populate **Pending** — pick
   one survey angle, run it, and write the findings into the file
   you just created.

After the bootstrap run the file exists and behaves as the source of
truth for every subsequent run; this step is a no-op once the file
is present.

## Modes — pick one per invocation

Pick at session start; don't blend the two within one PR. Each PR
carries a single item from one mode.

- **Work mode** (default): user asked you to "work the refactor
  backlog", "do the next refactor", "land another item". Run the
  **Work-mode loop** below.
- **Explore mode**: user asked you to "find more refactor
  candidates", "do another sweep", "extend the roadmap". Run the
  **Explore-mode loop** below. (Bootstrap, above, ends here.)

If the user is ambiguous ("can you clean up the codebase?"), ask
which mode they want before doing anything. The cost of guessing
wrong is a PR pointed at the wrong outcome.

## Work-mode loop

### 1. Open the roadmap and pick a candidate

```sh
$EDITOR docs/refactoring-roadmap.md
```

Look at **Pending**. Pick the **highest-severity** item the current
session can plausibly land in one PR. Tie-break:

1. **Architectural blockers first** (severity 9–10). These gate
   future work — a broken dependency direction or a storage backend
   that can't stay interchangeable blocks everything downstream;
   everything else can wait.
2. **Easy wins** at any severity (mechanical moves, helper
   extractions with N≥3 call sites, type-only edits). The roadmap
   has an explicit "Easy wins" list at the bottom of Pending.
3. **Severity 7–8 multipliers** next.
4. **Severity 5–6 friction** if the harder bands are blocked or
   already in flight on another branch.
5. **Severity 3–4** opportunistically — usually as a drive-by while
   touching the file for other reasons.

If you can't pick one — e.g. every remaining 9-band item requires
smoke-testing a cloud backend (Google Drive / Dropbox OAuth) you
can't reach in this environment — tell the user, surface the
constraint, and ask whether to drop to a lower band or do an
Explore-mode sweep instead.

### 2. Re-verify before touching code

The roadmap goes stale between sweeps. Confirm the candidate is
still real:

```sh
# Line counts shift; the severity rubric reads them as a proxy for
# "size of the affected surface". Refresh the count for any file
# the candidate names. The 1000-line cap (§20.5 of OSS_SPEC.md) is
# a hard signal here.
wc -l <files-the-candidate-touches>

# Grep for the exact smell shape — a candidate that called out
# "domain/ reaching into storage/" can quietly evaporate if an
# earlier PR cut the import. Don't take the roadmap's word for it;
# re-read the file.
grep -n '<the-pattern>' <files>
```

If the smell has shrunk meaningfully (e.g. file dropped well under
1000 lines, the duplication is now at 2 call sites instead of 8),
**re-rate** before doing anything. A candidate that drifts from
7/10 to 3/10 may still be worth landing but the plan probably needs
updating too. If it drifts to 1/10, move it to **Investigated and
skipped** with "smell decayed naturally — re-evaluate if N call
sites grow again" and stop.

### 3. Land the refactor

Follow the per-candidate **Plan** in the roadmap as the starting
point, but the plan is allowed to be wrong — if you discover a
better seam while reading the code, use the better one and amend
the roadmap entry in the same PR so the next agent sees the
corrected shape.

Refactor rules:

- **No behaviour changes.** Pure refactors. A refactor PR that
  also adjusts UX is two PRs in a trench coat — split it.
- **Respect the layering.** The dependency direction is
  `ui → domain`, `ui → storage`, `storage → domain`. Nothing in
  `src/domain/` may import from `ui/`, `storage/`, `window`,
  `document`, or `fetch` — this is a lint-enforced hard invariant.
  A refactor must never move code in a way that crosses these
  edges; if a candidate seems to require it, it's a feature/design
  change, not a refactor — stop and flag it.
- **Hold the line on size**: each refactor PR should aim for
  <500 lines of diff. The roadmap entry may describe a larger end
  state; that's fine, but ship it as a sequence of small PRs each
  of which leaves the code working. Splitting a file that breached
  the 1000-line cap into cohesive sibling modules, one PR per seam,
  is the model.
- **Run the linter and tests.** `make lint && make test` before
  opening the PR. Note that `make lint` is `eslint . && tsc
  --noEmit` — the typecheck is folded into lint; there is no
  separate `make typecheck`. Tests are Vitest only (`make test` is
  `vitest run`); there is no e2e / Playwright layer.
- **Smoke-test the storage hot path manually for storage-layer
  refactors.** The OAuth / cloud flows (Google Drive, Dropbox) have
  **no automated coverage**, so any refactor touching the
  `StorageBackend` adapters must be exercised by hand against the
  LocalStorage default plus whichever cloud backend the change
  touches before merging. The roadmap calls these out explicitly
  because Vitest can't reach the OAuth flow.

### 4. Update the roadmap in the same commit

Edit `docs/refactoring-roadmap.md` to reflect the new state:

- **Move the row from Pending to Landed.** One-line summary plus
  the date (`YYYY-MM`). If the change shipped as a multi-PR plan
  and only step 1 landed, leave the candidate in Pending with the
  scope narrowed (mark step 1 done, describe step 2's remaining
  shape).
- **If the smell decayed mid-refactor** — e.g. you discovered the
  problem is smaller than the roadmap claimed — drop the severity
  in the moved row and note "narrower than expected" in the
  Landed line.
- **If you discovered a related smell while reading the code**,
  add a Pending row in the right severity band. Don't fix it in
  the same PR.

The roadmap edit is **part of the refactor PR**, not a follow-up.
A PR that lands the code change without updating the roadmap will
silently re-propose the same work on the next sweep.

### 5. Write the changeset / changelog fragment

A refactor PR is rarely user-visible — by definition there should
be no behaviour change. Invoke the `write-changeset` skill anyway;
its decision tree handles "pure refactor with no user-visible
effect" by labelling the PR `no-changelog`. Don't try to write a
changelog fragment for a refactor.

### 6. Stop when Pending is empty

If Pending has no rows left (across every severity band), the
refactor sweep is **done**. Don't invent new items to keep going.
Tell the user the backlog is empty and recommend either:

- moving on to feature work (a clean roadmap is the whole point —
  the layering is honest and the next UI surface, storage backend,
  or share feature has a clean runway); or
- running this skill in **Explore mode** to look for new smells
  that emerged since the last sweep.

## Explore-mode loop

This mode extends the roadmap. The cost of a bad refactor is high;
the cost of a bad roadmap entry is low (it just sits in Pending
until someone re-rates it). So Explore mode is more permissive
about flagging — but every entry gets a rating, a file path, and a
sentence explaining **why it has leverage** (it blocks future work,
or every new storage backend / UI surface threads through it). No
ratings-by-vibe.

### 1. Read the roadmap first

Before exploring, skim the existing Pending / Landed / Investigated
lists so you don't re-propose what's already there. **Investigated
and skipped is especially important** — it tells you the smells
that look real but were rejected on closer reading, and the
reasoning that rejected them. Don't re-propose a skipped item
unless you can explain what changed (e.g. the call-site count
grew, the divergent semantics finally converged).

### 2. Pick a survey angle

You can't audit everything in one session. Pick a frame and stick
to it:

- **Largest files first.** `find src -name '*.ts' -exec wc -l {} +
| sort -rn | head` — read each large file with the rubric in mind.
  Anything approaching the **1000-line cap** (§20.5 of OSS_SPEC.md)
  without an `oss-spec:allow-large-file:` opt-out is a standing
  candidate to split by concern.
- **Per-layer audit.** Read every file in one layer at a time:
  - `src/domain/` — **purity.** Pure functions over the data model
    only. No DOM, no I/O. `grep -rn "from.*ui\|from.*storage" src/domain`
    — **any hit violates the domain-purity rule** and is at least a
    multiplier. Also grep for `window`, `document`, `fetch` inside
    `src/domain/`.
  - `src/storage/` — **interchangeability.** Anything added to one
    backend must work for all three (LocalStorage default in
    `src/storage/local/`, Google Drive, Dropbox) or be expressed as
    a capability the UI can feature-detect. Logic that lives in one
    adapter but should be shared, or a `StorageBackend` contract
    that one adapter quietly diverges from, is a smell.
  - `src/share/` — **client-side only.** Share payloads live in the
    URL **fragment** (`#…`), never the path or query string. Any
    code that puts share data into a path/query, or that reaches
    the network with a payload, is a real smell.
  - `src/ui/`, `src/app/`, `src/pwa/` — look for domain rules
    leaking into presentational code, duplicated logic across
    sibling components.
- **Direction-of-dependency check.** `grep -rn
"from.*ui\|from.*storage" src/domain` — any hit is a real smell
  because the layering forbids it. Confirm the broader direction
  (`ui → domain`, `ui → storage`, `storage → domain`) holds.
- **Cross-cutting patterns.** Grep for repeated boilerplate (JSON
  `parse → cast` pairs, inline `parseFloat`, duplicated
  encode/decode helpers, hardcoded user strings). For each pattern,
  report N≥3 example files with line numbers.
- **Type-safety holes.** `grep -rn "as any\|as unknown
as\|@ts-ignore\|@ts-expect-error" src/` — each hit is at least
  severity 3.
- **AGENTS.md rule sweep.** Pick one cross-cutting rule and grep
  for violations: domain/ purity; storage interchangeability;
  share payloads fragment-only; **no third-party network calls**
  beyond the app's own origin and the opt-in Google Drive / Dropbox
  APIs (grep for `fetch(` / URLs and confirm every call is to an
  allowed origin and gated on the user choosing that backend); the
  1000-line cap.

Delegate broad sweeps to `Agent(subagent_type: "Explore")` with a
self-contained brief — Explore-mode surveys produce a lot of file
reads, and the parent context shouldn't carry every excerpt.

### 3. Rate each finding 1–10

Use the rubric in the roadmap:

| Band | What to look for                                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------- |
| 9–10 | Architectural blocker. Correctness / persistence risk, a broken layering edge, or a `StorageBackend` divergence every backend bumps into. |
| 7–8  | Multiplier. Local today; every new storage backend / UI surface / share feature threads through it.             |
| 5–6  | Friction. Slows iteration; readers stumble. Worth landing soon.                                                 |
| 3–4  | Nit with leverage. Cheap to fix; alternative call-sites would multiply if left alone.                           |
| 1–2  | Cosmetic. Don't add to the roadmap; if it ever bothers anyone enough to want to fix it, it'll re-surface.       |

For each finding ≥3, write a row into Pending with:

- **The file path(s)** with current line counts.
- **The smell shape** — one or two sentences, concrete enough that
  a future agent can re-verify by running a grep.
- **The plan** — what the fix looks like. Doesn't have to be the
  final answer; the next agent will re-evaluate. Just enough to
  show the work isn't unbounded.
- **The risk** — what could go wrong, what must be smoke-tested
  (e.g. cloud backends, which have no automated coverage), whether
  it's a multi-PR plan.
- **The rating**, in bold, at the end of the prose: `**Severity:
N.**`

Place the row in the right severity band. If the row crosses
bands (e.g. a 7-rating that also contains a 4-rated "easy partial
fix"), keep it in the higher band but note the partial fix
inline.

### 4. Skip findings that fail the rubric

If a finding rates below 3, **don't** add it to Pending. It's
either:

- already there in spirit (re-read Pending and confirm), in which
  case do nothing;
- a real cosmetic concern, in which case mention it in the PR
  body and drop it.

If a finding rates 3 but you can't articulate why it has leverage
(blocks future work, or every new backend / UI surface threads
through it), the rating is probably wrong. Re-rate honestly. A
roadmap full of inflated 3s makes Work mode wander; a roadmap with
10 honest items is more useful than one with 40 aspirational ones.

### 5. Don't fix in Explore mode

Explore mode opens a PR that **only** edits
`docs/refactoring-roadmap.md`. The code stays the same. Work mode
handles the code on a subsequent pass.

The reason: a fix landed in the same PR as the discovery means
the discovery wasn't peer-reviewed before someone acted on it.
The two-PR rhythm forces a sanity check.

### 6. Stop after one survey angle

Explore mode is a **bounded sweep**, not an open-ended scan.
Pick one survey angle (step 2), exhaust it, write the findings,
open the PR. Don't try to do every angle in one session — that's
how Pending lists accumulate redundant rows and lose focus.

If the codebase is rich enough that the chosen angle yielded 10+
findings, the PR is large enough; ship it and let a future
session pick the next angle. If the angle yielded zero
findings (the layer is clean), say so in the PR body and pick a
different angle next time.

## What this skill explicitly does NOT do

- **Doesn't refactor code that isn't on the roadmap.** If you see
  something during Work mode that looks like a smell but isn't on
  the list, switch to Explore mode behaviour for that finding:
  add it to Pending with a rating, then return to the original
  Work-mode candidate. Don't sneak in unrelated cleanup.
- **Doesn't introduce new abstractions speculatively.** "We might
  need this when a new backend lands" is not a reason to extract an
  abstraction now. The roadmap captures **observed** smells with
  evidence; if the smell isn't visible yet, wait. AGENTS.md's "no
  features beyond what the task requires" applies to refactors too.
- **Doesn't change persisted or shared shape semantics.** If a
  refactor touches the data model that `src/storage/` serializes or
  the share-fragment format in `src/share/`, it must be pure
  renaming / module-relocation; any actual change to a stored or
  shared shape needs a migration / compatibility step and is a
  feature, not a refactor. Put it in the PR description and stop.
- **Doesn't keep going past an empty Pending list.** When the
  backlog is clean, the next action is **feature work**, not
  inventing more refactors. Tell the user the backlog is empty and
  stop.
- **Doesn't bundle items.** Each PR carries one roadmap row. The
  one-row-per-PR discipline is what makes the rollback story
  cheap and the review surface small.

## Common pitfalls

- **Forgetting to re-verify line counts.** A candidate flagged at
  1100 lines may now be 600; the severity drops accordingly. The
  rubric reads line counts as a proxy for blast radius (and the
  1000-line cap as a hard signal) — refresh them at pickup, not at
  the original sweep.
- **Refactoring the easy win when the architectural blocker is
  on the same file.** If a storage adapter needs both a contract
  fix (severity 9) and a comment cleanup (severity 1), do the
  contract fix. Bundling the comment cleanup into the same PR is
  fine; bundling 10 separate "easy wins" while leaving the blocker
  is a procrastination pattern.
- **Treating Investigated-and-skipped as a TODO list.** Those
  items were rejected for a reason. Re-read the reason before
  proposing them again. If the reason no longer applies, edit the
  Skipped entry to explain what changed and move it back to
  Pending.
- **Letting Explore mode become a refactor mode.** The PR opens,
  the rating gets written, and then the agent decides to "also
  fix it while it's here". That's a Work-mode PR, not an
  Explore-mode one. Discipline matters: one PR, one purpose.
- **Inflating severity to justify doing the work.** If the
  smell is a 3 and the rubric says "land opportunistically",
  resist the urge to round up to 5 to make it feel urgent. The
  ratings are how the next agent decides what's worth their
  time; inflating them devalues the signal.

## Skill self-improvement

After a run:

1. If a new survey angle was useful in Explore mode (e.g. "grep
   for `fetch(` to audit the no-third-party-network rule"), add it
   to the "Pick a survey angle" list above so the next agent
   doesn't have to reinvent it.
2. If a class of finding consistently rates the same (e.g. every
   domain/ purity violation ends up at 8), capture the pattern in
   the roadmap's severity rubric so the next agent doesn't have to
   derive it.
3. If a refactor exposed an unexpected risk (broke a storage
   backend, a share-fragment round-trip, a domain invariant),
   document the risk in the roadmap's plan column so the next agent
   following that plan knows what to smoke-test.
4. Commit the skill edit alongside the substantive PR — drift on
   the skill itself is the same kind of error this skill prevents.
