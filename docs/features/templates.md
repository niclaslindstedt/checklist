# Templates

Some lists you write once. Others you write again and again — the same packing
list every trip, the same release checklist every version, the same Friday shop.
A **template** is one of those lists saved as a blueprint: the shape of the
list, without any of the ticking-off.

You don't build a template from scratch. You build a checklist the way you
always do, get it right, and then keep it.

## Saving a list as a template

Find the list in the sidebar and open its actions:

- **On a computer**, right-click the list and choose **"Save as template"**.
- **On a phone or tablet**, swipe the list to the left and tap the template
  button that slides out beside the trash.

That's it — a **Templates** group appears at the bottom of the sidebar with your
new blueprint in it. The group stays hidden until you save your first one, so
nothing changes for you until you ask for it.

The original list is untouched. Saving a template copies it; it never moves,
archives, or empties the list you captured.

## What gets captured

Everything that describes *what the list is*:

- every item, in order, with its exact wording
- **sub-items**, nested exactly as you arranged them
- **[category](feature:categories) headers** and what sits under them
- **[notes](feature:notes)** attached to items
- required flags
- **[deadlines](feature:deadlines)** and how they repeat
- the list's icon and colour

And nothing that describes *one particular run through it*:

- **Nothing is checked.** Whatever you had ticked off comes across unticked —
  a blueprint is always at the start.
- **Archived items are left behind.** You'd already hidden them from the list;
  they don't come along.

## Making a new list from a template

Open the template from the sidebar and press **"New list from this"** — or, on a
computer, right-click the template and choose the same thing. You land straight
on a brand-new checklist, everything unticked, ready to work through.

Do it as often as you like. Every list you stamp out is a fresh, complete copy.

## Templates are snapshots, not links

This is the part worth knowing. A template and the lists made from it are
**completely independent**:

- Checking things off a list never changes the template it came from.
- Editing a template never changes lists you already made from it.
- Deleting a template leaves every list stamped from it exactly where it is.

So a template can't "break" your lists, and your lists can't wear a template
down. If you want a change to reach future lists, edit the template; if you want
it in a list you're using now, edit the list.

## Editing a template

Click a template in the sidebar and it opens in the normal checklist view. You
edit it exactly the way you edit a list — add items, rename them, drag to
reorder, nest sub-items, promote a category, attach a note, set a deadline.

The one difference is the checkboxes. They're drawn with a dashed outline and
can't be ticked, and a line under the header says so. A template records what
needs doing, never whether it's been done — so there is nothing to check off,
and no progress counter, archive, or "archive finished" sweep while one is open.

Rename a template by clicking its title, and give it an icon or colour with the
glyph button beside the title, the same as any list. Whatever you pick rides
along into every list you stamp out of it.

## Deleting a template

Right-click it in the sidebar (or swipe it left on a touchscreen) and delete.
As always, the lists you already made from it are untouched — and the deletion
itself can be undone.

## Where templates live

Templates are stored alongside your checklists, in the same place and by the
same [sync](feature:cloud-sync) you already use, so they travel to your other
devices with everything else. On the folder and cloud backends each template is
its own readable markdown file in a `templates/` folder, next to the
`checklists/` folder — so you can open, read, and edit one in any text editor.

Templates sit outside the folder structure your checklists are filed into: they
live in one flat group per [namespace](feature:namespaces), not inside folders.
