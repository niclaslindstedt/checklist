---
name: update-achievements
description: "Use when the achievements catalog is stale relative to a newly-shipped (or removed) user-facing feature — or when a fresh achievement needs adding, a trigger rewriting, or the achievements modal touched. The achievements modal is a four-tier (Beginner → Intermediate → Pro → Expert) guided tour where every feature is also an unlockable trophy. This skill covers how to add a new achievement, slot it into the right tier, phrase it (English AND Swedish), and wire its trigger so the unlock fires when the user does the thing."
---

# Updating the achievements catalog and modal

**Governing spec sections:** §21.6 (achievements are a drift-prone artifact that mirrors the user-facing feature surface).

The achievements system, ported from the budget project, lives in three
places that must stay in lockstep:

- **The catalog** — `src/achievements/catalog.ts`: each entry's `id`
  (stable, write-once), `tier`, `glyph`, optional `hasLearnMore` flag, and
  unlock `trigger`. No display strings here. Glyphs are inline SVG
  components in `src/achievements/glyphs.tsx` — the app stays
  dependency-free (no `lucide-react`), so a new glyph means a small SVG in
  that file, not a package import.
- **The i18n strings** — `achievements.catalog.<id>.{name,condition,
  learnMore?}` in **both** `src/i18n/locales/en/achievements.ts` and
  `src/i18n/locales/sv/achievements.ts`. The Swedish file is typed against
  the English one (`AchievementsCatalog`), so a missing key is a compile
  error; `tests/achievements/catalog.test.ts` also checks parity and that
  every `condition` ends with a period.
- **The renderer** — `src/ui/achievements/AchievementsModal.tsx` reads the
  catalog by `id` and pulls strings via `t()`. New entries appear
  automatically without touching it.

When a user-facing feature ships and the catalog isn't updated, the
achievements list silently lies about what the app can do.

## Tracking mechanism

`.agent/skills/update-achievements/.last-updated` contains the git commit
hash from the last successful run. Empty means "never run" — fall back to
the repository's initial commit.

```sh
BASELINE=$(cat .agent/skills/update-achievements/.last-updated)
[ -z "$BASELINE" ] && BASELINE=$(git rev-list --max-parents=0 HEAD | tail -1)
```

## Discovery process

The catalog tracks **user-visible** features, which is exactly what the
changeset workflow already classifies: a user-visible PR drops a fragment
in `.changes/unreleased/<unix-ts>-<slug>.md` (collated into `CHANGELOG.md`
at release). Use that trail — it filters out refactors, build tweaks, and
dependency bumps before you see them.

1. List commits and changed files since the baseline:

   ```sh
   git log --oneline "$BASELINE"..HEAD
   git diff --name-only "$BASELINE"..HEAD -- src/ .changes/
   ```

2. Walk the changeset fragments (and any `CHANGELOG.md` sections released
   since the baseline) for the user-visible features they name.

3. **Classify each candidate:**
   - **Add a new achievement** when a brand-new user-facing surface lands
     (a new gesture, modal, setting, backend, picker).
   - **Edit an existing achievement** when a shipped condition / learn-more
     is now wrong (renamed setting, moved menu path).
   - **Remove a catalog entry + i18n keys** when the feature is gone —
     stable ids are write-once, so deletion is the move, never repurposing.
   - **Skip** for bug fixes, layout polish, internal refactors, a11y that
     isn't a discoverable surface, build tweaks, dependency bumps.

### Where each feature lives (source map)

| Source | Answers |
|---|---|
| `src/i18n/locales/en/*.ts` | What is the feature called in the UI? Exact menu paths? |
| `src/ui/*.tsx`, `src/ui/settings/tabs/*.tsx` | Where does the user trigger it? Which settings are configurable? |
| `src/app/use-checklist*.ts` | The edit / list / sync verbs — each a potential trigger (add, toggle, archive, reorder, rename, undo, …). |
| `src/domain/*.ts` | What concepts exist (Template, Checklist, Item, Snapshot)? |
| `src/storage/*` | Which backends / encryption / namespaces / markdown / share options exist. |
| `src/dev/*`, `src/pwa/*`, `src/theme/*` | Dev mode, fake data, install / standalone, themes / fonts / motion. |

## The tier rubric

Every achievement belongs to one of four tiers, decided by *what the user
already had to understand* to reach it — not by internal complexity.

| Tier | The user is … | Slot an achievement here when it … |
|---|---|---|
| **Beginner** | New. Just opened the app. | Is core to using the app at all — add an item, tick it, a note, a theme — needs zero setup and works on a single list. |
| **Intermediate** | Has a working list. Wants more of them, organised. | Adds structure: multiple lists, archive, reorder, copy / paste, font, the floating-button spot. Still local, still manual. |
| **Pro** | Wants it to sync and travel. | Reaches outside the single device: namespaces, local folder, cloud backends, pull-to-refresh, conflict resolution, silencing toasts. |
| **Expert** | Wants to bend the app. | Not required for daily use: encryption, custom themes, reduced motion, hiding the nav button, developer mode, sample data, language. |

Points are tier-uniform: Beginner 10 · Intermediate 25 · Pro 50 ·
Expert 100 (`TIER_POINTS`). Don't define per-achievement overrides.

Tie-breakers: an action that fits two tiers lives in the lower one; skip
any feature with no clean unlock trigger (passive observations, transient
menu states) — the catalog must never carry an id the user can't earn.

## Naming and phrasing

- **`name`** — playful, 1–3 words, capitalised: *First Steps*, *Cloud
  Walker*, *Paranoid Mode*, *Completionist*.
- **`condition`** — second person, present tense, ending with a period:
  "Add your first item.", "Connect a cloud backend.". Reads as the answer
  to "how do I unlock this?".
- **`learnMore`** *(optional, when `hasLearnMore: true`)* — one short
  paragraph expanding the why or naming adjacent features. Omit the key
  entirely when the condition is self-explanatory.

No code references in user-visible text, no tier-leaks (a Beginner
condition can't assume Pro context), no emoji.

## How a new achievement gets added

1. **Author the catalog entry** in `src/achievements/catalog.ts`: pick a
   stable camelCase `id`, drop it into the right tier section, set the
   `glyph`, and (if it has a body) `hasLearnMore: true`. If no existing
   glyph fits, add a small inline SVG to `src/achievements/glyphs.tsx`
   (trace Lucide's 24×24 grid for weight) and import it.

2. **Add the i18n keys** in **both** `src/i18n/locales/en/achievements.ts`
   and `src/i18n/locales/sv/achievements.ts` under `catalog.<id>`:

   ```ts
   newId: {
     name: "Pithy Name",
     condition: "Imperative one-liner ending with a period.",
     learnMore: "Optional body — omit when hasLearnMore is false.",
   },
   ```

3. **Pick and wire the trigger:**
   - **`derived`** when the feature mutates the persisted document or the
     synced settings. Write a predicate over `(prev, next)` of the combined
     `{ snapshot, settings }` `AchState`, and declare a `slices` extractor
     naming the state island it reads (`s.snapshot`, `s.settings.theme`, …)
     so the watcher skips it cheaply on unrelated changes. Patterns:
     `(prev, next) => !hasX(prev.snapshot) && hasX(next.snapshot)` for
     "first time", `(p, n) => p.settings.foo !== n.settings.foo` for a
     setting change. Add a `hasX` helper at the top of the catalog if you
     need a new inspector.
   - **`manual`** when the trigger is an event outside that state (cloud
     connect, clipboard copy, undo, install, language switch). Add
     `import { unlock } from "../achievements/bus.ts"` (or the relative
     equivalent) and call `unlock("<id>")` at the chokepoint. The bus
     dedupes, so double-fires are safe. **A manual entry with no
     `unlock("<id>")` call site never fires** — and the catalog test fails.

4. **Cover it in tests** — `tests/achievements/derive.test.ts` for a
   derived predicate; the catalog test already proves every manual id is
   wired and every entry has English + Swedish copy. Run `make test`.

### Pitfall: declared-but-unwired manual triggers

List every wired id and intersect with the manual catalog entries:

```sh
grep -rhoE 'unlock(Achievement)?\("[a-zA-Z0-9_]+"\)' src/ \
  --include="*.ts" --include="*.tsx" | sort -u
```

(The storage hook aliases the bus import as `unlockAchievement` because it
already exposes an encryption `unlock` verb — both spellings count.)

## Update checklist

- [ ] Read baseline from `.last-updated`; run `git log` / `git diff --name-only`.
- [ ] For each user-visible candidate, add / edit / remove an achievement
      following the four-step process. Removals drop the catalog entry AND
      the `catalog.<id>` block from both locale files.
- [ ] Verify every manual id has a wired `unlock("<id>")` (grep recipe above).
- [ ] Run `make fmt`, `make lint`, `make test`, `make build`.
- [ ] Write the new baseline:

      git rev-parse HEAD > .agent/skills/update-achievements/.last-updated

## Verification

1. Every candidate from the discovery run is reflected in the catalog, or
   intentionally skipped because it isn't user-facing.
2. Every catalog `trigger` is wired (derived predicate or `unlock` call).
3. `make fmt`, `make lint`, `make test`, `make build` all pass — including
   `tests/achievements/catalog.test.ts` (id uniqueness, manual wiring,
   en/sv parity).
4. `.last-updated` holds the commit the catalog now covers.

## Skill self-improvement

After a run, grow the **source map** when a new component / hook / module
lands that doesn't fit a row, and grow the predicate helpers in
`catalog.ts` when a "first time" detection needs an inspector that doesn't
exist yet. Record any naming ruling that took more than a minute. Commit
the skill edit alongside the catalog edits.
