# Transforms

A transform is a rule that changes how your items **read** without
changing what they **say**. You write it once in Settings → Transform, and
from then on every list in that namespace is drawn with it applied. The
text in the list itself never moves: open an item to edit it and the
original is right there, and the copy you take, the file that syncs, and
the export all keep it too.

Each rule starts with a pattern — a regular expression — describing the
text to look for. Round brackets capture a piece of the match you want to
reuse; the first pair is `$1`, the second `$2`, and `$&` is the whole
match. Then you choose what a match becomes.

## Link

The common one. Say your items mention tickets as `#134`. Match
`#(\d+)` and give the address
`https://github.com/owner/repo/issues/$1`, and every `#134` in every list
becomes a link straight to that issue — tappable in the title, tappable in
a note. The link's text is whatever matched unless you set your own; put
`issue $1` in the link-text field and `#134` reads as "issue 134" instead.

The same trick works for anything with a stable address: an order number,
a customer id, a room booking, a wiki page. Only ordinary web, mail, and
phone addresses are opened — a rule that builds something else is left as
plain text rather than turned into a link.

## Text

Straight find-and-replace. Match `\bTODO\b` and replace it with `⚠️ TODO`,
or reformat a date, or expand an abbreviation your team writes but nobody
else understands. Because the replacement is a template, you can shuffle
what you captured: matching `(\d{4})-(\d{2})-(\d{2})` and replacing with
`$3/$2/$1` re-reads an ISO date the way you prefer.

## Sensitive

For text you'd rather not have readable at a glance — a door code, a phone
number, a policy number on a shared screen. The match is replaced with a
mask, and you choose how much survives:

- **Keep first and last three** — `076****123`, enough to recognise which
  number it is.
- **Keep the last four** — `******4123`.
- **Hide everything** — the same length, nothing readable.
- **Fixed width** — always the same short mask, so even the length gives
  nothing away.

This hides the text **on screen only**. The real value is still in your
list, still in the file that syncs, and still in anything you copy — it is
protection from someone glancing over your shoulder, not from someone with
the file. If the data itself needs protecting, turn on encryption in
Settings → Storage.

## Writing a rule

The editor previews as you type. Under the fields there's a sample-text
box and, below it, the result: your draft rule applied to that sample and
drawn exactly as the list will draw it. Paste in a real line from one of
your lists and you can see the rule work before you save it — and see when
it doesn't, because the editor says so instead of quietly showing you an
unchanged line.

Nobody remembers the whole regular-expression alphabet, so the pattern
field has an **Insert** button: a list of the building blocks — any digit,
one or more, a captured group, the start of the text — each with a plain
description, dropped in at the cursor when you press one.

## Several rules at once

Rules run from the top of the list downwards, and a piece of text one rule
has already claimed is left alone by the rules below it. So a rule that
turns `#134` into a link and a rule that masks long numbers can live side
by side without fighting over the same characters. Drag the arrows to
reorder them when it matters, and untick a rule to park it — the rule stays
written, it just stops being applied.

A rule that no longer makes sense as a regular expression (an unclosed
bracket after an edit, say) is flagged in the list and quietly skipped
while it's broken, so a typo can never make your lists unreadable.

## One set of rules per namespace

Work and home rarely want the same rules. A ticket reference that should
open your issue tracker is noise on a shopping list, and a rule that masks
a door code has no business rewriting a work list. So rules belong to the
namespace you wrote them in: only the namespace you're currently in has
its rules applied, and switching namespace switches the rules along with
the lists.

Once you have a second namespace, the tab grows a **Rules for** picker
above the list. It opens on the namespace you're in — the usual case is
writing rules for the lists in front of you — and switching it lets you
write Home's rules without leaving Work. Each namespace in the picker
shows how many rules it holds, so it's obvious where your rules live.
Deleting a namespace deletes its rules with it.
