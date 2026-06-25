# Search

Search looks across **every** checklist at once, so you never have to
remember which list you put something on. Open it from the magnifier on the
action bar — the bottom row of the navigation drawer, just to the right of
undo and redo. On a phone it fills the screen; on a wider window it opens as a
centred panel.

## What it searches

As you type, the app builds an index over your lists and matches against:

- **list names** — the title of each checklist,
- **items** — every line in every list,
- **notes** — the longer body text attached to an item, and
- **sub-items** — nested children, however deep they sit.

Results are grouped by the list they belong to, and the part that matched is
highlighted right in the result so you can see _why_ it came up. Archived
lists and archived items are left out, since a result jumps you to the live
list.

## How to phrase a query

The search box understands four ways of asking, from loosest to most precise:

- **Plain text** is a case-insensitive match anywhere in the text — `milk`
  finds “Buy milk”.
- **Fuzzy** kicks in automatically when plain text finds nothing: the letters
  of your query just have to appear in order, so `grcl` still surfaces
  “Grocery list”.
- **Wildcards** — `*` stands for any run of characters and `?` for a single
  one, so `car*` matches “Carrots” and `sun?creen` matches “sunscreen”.
- **A regular expression** — wrap the pattern in slashes, like `/sun\w+/`, for
  the full power of JavaScript regex. If the expression doesn’t compile, the
  app tells you rather than silently finding nothing.

## Jumping to a result

Tap a list to open it, or tap a matched item to open its list **and** scroll
straight to that line — it flashes briefly so your eye lands in the right
place. Clear the box (or close the panel) and you’re back where you started.
