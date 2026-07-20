# Home Screen widgets

A checklist is exactly the kind of thing you want to glance at without
opening an app — what's left, what's due — and to tick off in one tap.
On the native app (iOS and Android), widgets put your lists right on your
Home and Lock Screen.

## What you can add

- **List progress** — a ring showing how many items you've checked off in
  your active list, with the list's name beneath. It's the natural Lock
  Screen and StandBy shape, too.
- **Due today** — everything due today or already overdue, gathered from
  every list, so a deadline never slips past just because it was buried in a
  list you didn't open. When nothing's due, it says so calmly.
- **Check off** — the next few open items from a list, each with a real,
  tappable checkbox. Tick one straight from the Home Screen and it's done —
  no need to open the app. You can pin one of these to each of several lists
  and pick which list each shows.
- **Quick add** — a shortcut that drops you straight into adding an item to
  a list. On iOS 18 it's also available as a Control Center control and
  Action Button binding.

## How it stays current

Widgets can't see the app's private storage directly, so the app keeps them
fed with a small, up-to-date summary of your lists — the active list's
progress and next items, and what's due — refreshed every time you make a
change. Your lists themselves never leave the app; the widgets only ever get
that summary.

When you tick something off from a widget, the change is handed back to the
app and applied the next time you open it, going through exactly the same
save-and-sync path as a tap inside the app — so a widget can't clobber an
edit you made elsewhere.

Everything here is native-app only. In a plain browser there are no Home
Screen widgets, and nothing about them changes how the web app behaves.
