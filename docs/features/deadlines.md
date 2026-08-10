# Deadlines

Some items aren't just "do this" — they're "do this *by then*". You can
give any checklist item a due date, and the app keeps that date in front
of you as it approaches.

## Setting a date

Swipe an item to the left and, alongside the trash button, you'll find a
clock. Tap it to open **Timing**: choose a due date, and if the task comes
back around, how often it repeats — every so many weeks, months, or
years. Save, and the item is dated. On a computer the same options live
in the item's right-click menu.

The date picker is a small calendar. Step month by month with the arrows,
or tap the month-and-year heading to jump straight there: once for a grid
of months, again for a grid of years — so a date years away is a couple of
taps, not a long scroll.

To clear a date later, open Timing again and use "Clear timing" — that
empties every field at once, including any repeat you'd set, since a
repeat needs a date to anchor it.

## The date row

A dated item wears a slim date row just above its title, lined up with the
words rather than with the checkbox, in a smaller font so it reads as a
caption rather than a second line of content.

The row is deliberately wordless — a small glyph and a date, nothing else.
The two glyphs are mirror images, and the mirror is the whole message: a
bar with the clock to its right (`|—◷`) marks the day work *starts*, and a
clock with the bar to its right (`◷—|`) marks the day it's *due*. The bar
is the boundary, and it sits on the side the boundary is.

The due-date row also shows a repeat summary like "every 2 weeks" when the
item recurs, and it changes colour as the day gets closer:

- **Muted** while the deadline is more than a week away.
- **Yellow** once it's within a week.
- **Orange** on the last day — due today or tomorrow.
- **Red** once it's overdue, with an "Overdue" tag so you can't miss it.

So a glance down the list tells you what's comfortably ahead and what
needs attention now.

## Where dated items sit

Dated items lead the list, sorted by due date with the soonest (and
anything overdue) first, so the dates read down the screen in the order
they fall due and the next thing to worry about is the first thing you
see. Your undated, whenever-you-get-to-them items follow underneath.

You can turn that off in Settings → Lists ("Sort due dates to the top"),
along with its counterpart for held-back items. Neither one rearranges the
list itself — they're just how it's shown, so switching one off puts every
item straight back where you put it.

## Holding an item back

The top field in the same Timing sheet is **Not before** — the earliest
day the item may be ticked off. It answers the opposite question from a
due date: not "when must this be done by", but "when can this be started
at all". The form that isn't published until the first of the month, the
follow-up call you shouldn't make before next week, the repair you can't
book until the part arrives.

Set one, and the item's checkbox goes quiet — drawn but not pressable —
and a plain grey date above the title says when it opens up. That date
carries no colour at all, because nothing is late: the item is simply not
yours to do yet. Everything else about the row still works as usual —
you can edit it, note it, nest it, drag it, archive it — only ticking it
off is out of reach.

On the day itself the hold lifts. The date disappears, the box becomes an
ordinary box, and what's left is just an item like any other. Nothing is
left behind to tidy up. A held-back item also sits out the "Check all"
sweep and doesn't get ticked when you check a parent item above it, so a
bulk action can never finish work you've deliberately postponed.

## Where held-back items sit

Held-back items sink to the bottom of your unchecked work — below
everything you *can* do, above everything you've already finished — soonest
first. They're still there to be seen and edited; they're just out of the
way until their day comes.

Because they cluster by date, a run of items sharing one day states that
day **once**, at the top of the run. The rest of the run simply carries on
underneath: their locked checkboxes already say they're waiting, so
repeating the same date on every line would be noise. Set a different day
and a fresh date appears, starting a new group.

This sort is Settings → Lists → "Sort held-back items to the bottom", on
unless you turn it off.

The two dates are independent. An item can be held back with no due date,
due with no hold, or both — the two glyphs then sit side by side above the
title, the hold in grey and the due date in its usual colour. An item
that's both gated and due sinks with the held-back ones: a due date says
when work must be finished, but a hold says it can't be started at all,
and there's nothing useful to do at the top of a list about a task you
can't touch yet.

## Repeating tasks

When an item repeats, checking it off doesn't tick it away — it rolls the
due date forward to the next occurrence and leaves the item unchecked, so
the task simply reappears with its new date. Water the plants every two
weeks, renew a subscription every year, take out the bins every week:
check it done, and it's already scheduled for next time. If a repeating
task slipped and is several periods overdue, checking it catches the date
back up to the next future occurrence on its original cadence.

Both dates travel with your lists across devices, and on the file and
cloud backends they're written into the markdown in a plain, readable
form — `*(not before 2026-07-01)*` and `*(due 2026-07-20, every 2
weeks)*` — so they're visible even if you open the file in another
editor.
