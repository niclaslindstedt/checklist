# Bulk actions on finished items

When a list is mostly ticked off, clearing it one row at a time is tedious. The
floating **+** button hides a second job: **long-press** it and it fans out a
small half-circle bar of bulk actions, then morphs back the moment you're done.

## How it works

1. **Long-press the `+` button.** Hold it for about half a second. The `+`
   shrinks and fades as a curved glyph bar scales in around the same spot.
2. **Archive everything finished.** Tap the **blue** action to send every
   checked item to the [archive](feature:archive) in one pass — kept, not
   destroyed.
3. **Delete everything finished.** Tap the **red** action to clear every
   checked item in one pass. A single tap does it — there's no confirm step,
   because the sweep is undoable if you didn't mean it.

Both actions touch only **finished** items (checked and still in the list), so
anything you haven't ticked stays put. The buttons are dimmed and inert when
nothing is finished. Tapping outside the bar, pressing `Escape`, or running
either action snaps the `+` straight back into place. The long-press is the
only way in, so the bulk actions stay invisible until you reach for them.
