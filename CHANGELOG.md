# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is **generated at release time from the changeset fragments**
in `.changes/unreleased/` — do not edit released sections manually. Add a
fragment per user-visible change (see `AGENTS.md` → "Releases and
changelog").

## [Unreleased]

## [1.1.0] - 2026-06-23

### Added

- **Disable achievements** — A **Disable achievements** toggle on Settings → General switches the achievements system off — no unlock tracking, no celebratory toasts, and the trophy button is hidden — while keeping anything you've already earned.
- **Learn more in the changelog** — Big features in the "What's new" changelog now carry a **Learn more** link that opens an in-app guide to the feature from its top, with a back button that returns you to your place in the release list.
- **Working offline** — Cloud-backed lists now keep a copy on your device, so you can unlock, read, and edit them with no connection — even when encryption is on — and your changes sync back automatically when you're online again, with a Check connection button that re-pings the server and tells you what it found.
- **Enter starts the next item** — Pressing Enter while editing an item now commits it and opens a fresh draft row directly below that item, so you can rattle off a whole list from the keyboard and slot new entries in wherever you are — just press a row and hit Enter — while the add button still appends at the top or bottom.
- **Disable item notes** — A Lists-tab toggle switches item notes off for title-only checklists, keeping any notes you've already written.
- **Shift+Enter to add an item with a note** — Pressing Shift+Enter in the add-item composer now creates the item and jumps straight into editing its body, so a thought that needs more than a one-line title flows on without re-tapping the new row.
- **Showcase homepage** — A no-login page at /home introduces the app, describes what it does, and explains why it requests Google Drive or Dropbox access — and links to the privacy policy.
- **Sort checked items to the bottom** — A Lists-setting that sinks checked items below the unchecked ones — most recently checked first, sliding smoothly into place (with an Appearance toggle to make the re-sort instant) — without reordering the list itself.
- **Language** — Switch the app between English and Swedish from a flag picker on the General settings tab.
- **Encryption progress feedback** — Turning encryption on or off now shows a live status bar of what it's doing and spins the button while it works, and a failed attempt becomes a tappable status line that opens the full log so you can see what went wrong.
- **Sub-items** — Drag one item onto another to nest it as a sub-item — or, while editing an item, tap "Add sub-item" to start adding straight underneath it (Enter keeps adding within that sub-list); sub-items read as a smaller, indented child list, parents fold their children, and checking a parent checks the whole group.
- **Right-click menus** — On a computer, right-click a checklist item or a list in the sidebar to archive or delete it — including archiving a whole list, restorable from the archive.
- **Folders** — Group your checklists into named, collapsible folders within a namespace — and on the file and cloud backends each folder is a real directory of markdown files you can browse with any tool.
- **Drag lists to organise** — Drag a checklist onto a folder, another namespace, or the archive to move it there — with a press-and-hold pickup on touchscreens.

### Changed

- **Clickable toasts with a countdown ring** — Click a toast to dismiss it immediately, and watch a circular ring fill clockwise to show how long it has left before it disappears on its own.
- **Namespaces sync across devices** — Your list of namespaces now travels with the cloud or folder backend: connecting Dropbox, Google Drive, or a local folder on a new device adopts the namespaces already there and uploads any it had locally, so your namespaces follow you instead of starting fresh on each device.
- **Privacy policy covers storage backends** — The privacy policy now documents the optional Local folder, Dropbox, and Google Drive backends, OAuth token storage, and end-to-end encryption — clarifying that lists leave your device only when you explicitly connect a cloud backend.
- **Bulk delete is one tap** — Deleting all finished items from the add (+) long-press now happens on the first tap with no confirm step, since the sweep is undoable.
- **Redesigned settings dialog** — Settings now opens with icon-marked tabs — a left rail on desktop and a header section menu on mobile — each tab grouped into labelled sections, and edits apply only when you press Save, with Cancel to discard and Reset to defaults to start over (appearance changes still preview live while you choose).
- **Achievement unlock popup as a centered card** — The "achievement unlocked" notification now appears as a compact centered card instead of a full-screen sheet on mobile, so a single new trophy no longer fills the whole screen.
- **Erase items with Backspace** — Editing an item down to a blank line now deletes it instead of keeping an empty row, and pressing Backspace on an emptied line — or in an empty add-item draft — backs editing up into the line above so you can keep erasing items in one stroke.
- **Achievements moved to the side menu** — The trophy moved out of the checklist header into a side-menu row that colours and badges itself with the count of new unlocks.
- **Background-less tab favicon** — The browser-tab favicon now shows the bare green check with no dark background, while the app and home-screen icons keep their badge.
- **Cloud sync details as a centered card** — The cloud sync details dialog now opens as a compact centered card instead of a full-screen sheet on mobile, so its short status no longer fills the whole screen.
- **Item count** — The list header's checked / total count is now a tidy badge with a progress ring that fills as you check items, and a new **Show item count** toggle on Settings → Lists lets you hide it.
- **Undo / redo buttons** — The side menu's Undo and Redo now sit as a compact pair of side-by-side buttons pinned to the foot of the drawer, just above the footer divider, so they stay within thumb's reach instead of taking two full rows in an Edit section.
- **Redesigned update-ready prompt** — The "update ready" prompt now leads with a clear headline over the incoming version and applies the update from a primary **Update** button.
- **Accent highlight for the active list and namespace** — The active checklist and namespace in the side menu are now marked by an accent-tinted highlight and left border instead of a swapped-in checkmark, so their own icon always stays visible.
- **Bigger checkbox tap target** — The checkbox on each list item now has a larger touch area — easier to tap on a phone — while the box itself looks exactly the same size.
- **Aligned add-item composer** — The "Add item…" field now shows a dimmed checkbox placeholder so its text lines up exactly with where the new item will land in the list.
- **Cloud sync command centre** — The cloud-sync glyph now always opens a redesigned details dialog — showing the backend and at-rest encryption state side by side, a one-tap Reload, and (in developer mode) a sync log (newest entries first, and now naming a dropped connection plainly instead of a cryptic "Load failed") — and tapping the glyph is the single, predictable way in whatever the sync state.
- **Clearer note indicator** — Items that carry a note now show a note glyph instead of a chevron — grey while the note is hidden and highlighted while it's revealed, so you can tell at a glance which items have more to read.

### Fixed

- **Resilient cloud autosave** — Cloud sync now waits out a backend rate limit and resumes on its own, retries a transient network hiccup with exponential backoff, and — when a save does fail outright — re-pushes it when you hit Try again, instead of getting stuck or flashing a sync error.
- **Multi-paragraph item notes** — Item notes that span more than one paragraph are no longer truncated to their first paragraph when a list is saved to and reloaded from a folder, Google Drive, or Dropbox.
- **Keyboard staying up in modals** — Typing in a modal field (such as the unlock passphrase) no longer dismisses the on-screen keyboard on every keystroke.
- **Changelog formatting** — The "What's new" changelog now renders its **bold** lead-ins and `code` spans as formatted text instead of showing the raw markdown asterisks and backticks.
- **Bulk archive / delete on iOS** — The fan-out archive and delete buttons behind the add (+) long-press now respond to taps on iOS, where they were being covered by the dismiss overlay so every tap closed the menu instead of running the action.
- **Unlock prompt within reach on mobile** — The passphrase unlock prompt now appears as a single centered card on a plain background — no full-screen sheet or dimmed dialog chrome — keeping the unlock button within thumb's reach on a phone.
- **Bulk actions match the add button on desktop** — The archive / delete buttons behind the add (+) long-press now adopt the flat, tinted desktop styling of the add button and stay centred under it instead of drifting toward the docked sidebar.
- **Symmetric Donate heart** — The Donate menu's heart glyph is now drawn from a balanced, symmetric shape instead of a lopsided hand-rolled path.
- **Undo shortcuts ignored while the side menu is open** — Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z no longer reach through an open side menu to undo or redo changes to the list behind it.
- **Cleaner "Open in" sync button** — The cloud-sync details "Open in Dropbox" button no longer trails an "(encrypted)" suffix — it names the destination service, not the at-rest encryption state.
- **Disabling encryption removes the encrypted file** — Turning encryption off now always rewrites your lists as plaintext and deletes the leftover `checklist.json` envelope, even when a stale plaintext copy was shadowing it on a synced folder or cloud.
- **No more accidental swipe-back in the iOS PWA** — Swiping in from the screen edge to open the sidebar in the installed iOS app no longer triggers the system's "swipe to go back" gesture and yanks the app off-screen.
- **Centered update prompt beside the sidebar** — The "new build ready" reload prompt now centers over the content area instead of the whole window, so it no longer sits off-center next to the pinned sidebar on wide screens.
- **Editing items on mobile** — Editing an item on a phone now keeps the row lined up with the rest of the list, opens the editor from a tap anywhere along the row (not just on the text), moves editing straight to another item when you tap it without the keyboard dropping or the add button flashing back, lets you tick its checkbox while editing, scrolls it into view above the keyboard only when it's actually hidden, and without the page or its frozen header jerking, hides the add button while you type, eases the note field open, and leaves only the system keyboard bar on screen instead of stacking a second one over it.
- **Drag-and-drop reliability** — Dragging an item now lets you drop it back into its original spot between two other rows, and a sync conflict that surfaces mid-drag no longer freezes the screen.
- **Instant reload on cloud backends** — Reloading the app on a Dropbox or Google Drive backend now paints the last-seen list straight away from the on-device copy instead of flashing an empty list while the live data loads from the cloud.
- **Spurious cloud sync conflicts** — Editing a list synced to Dropbox or Google Drive on a flaky connection no longer raises false "remote changed" conflicts when the only writer is your own device, even across reloads, reconnects, and offline edits while you keep adding entries.
- **Remembered open list** — Reloading the app or installing an update now reopens the list you were last looking at instead of snapping back to the first one, and each namespace remembers its own selection.
- **Drag without refreshing** — Reordering items or dragging a list to a folder no longer triggers pull-to-refresh at the same time.
- **Cloud sync in the installed app** — The installed app no longer intercepts Dropbox and Google Drive requests through its offline cache, which on some devices made every file download or upload fail with a "Load failed" error and stranded you on the local copy even with a working connection.
- **Resilient cloud loading on a flaky link** — Reading or saving a cloud list now retries each individual file a few times when a request drops, so a single flaky download no longer fails the whole sync and strands you on the local copy when the connection is actually working.
- **Enter accepts the autocorrect suggestion** — Pressing Enter to add an item on a soft keyboard now accepts the pending autocorrect suggestion first — just as tapping Space does — so the corrected word lands instead of the raw keystrokes.

## [1.0.1] - 2026-06-17

### Changed

- **In-app confirmation dialogs** — Destructive confirmations (such as deleting a namespace) now open a themed in-app dialog instead of the browser's native confirmation popup.

### Fixed

- **Long-press the (+) on iOS** — Suppressed text selection and the iOS long-press callout on the list so holding the add button to fan out the bulk actions no longer pops up the system Copy / Look Up / Translate menu.
- **Preview/branch PWA isolation** — Installing the app from the `/preview/` or `/branch/` slot now runs that slot's build instead of silently falling through to production, and each installs as its own distinctly named home-screen app.

## [1.0.0] - 2026-06-17

### Added

- **Checklist view** — A quiet, monospaced checklist you fill, tick off, reorder by dragging the grip handle, and swipe to delete or archive — dark by default. [Learn more](feature:checklist)
- **Installable app icon** — checklist ships a full home-screen icon set, so you can install it as a real app with a proper icon on iOS, Android, and desktop.
- **Settings & themes** — A Settings dialog with eleven theme presets plus a fully custom theme, four fonts, an adjustable text size, and a developer mode. [Learn more](feature:themes)
- **Update notifications** — When a new version is deployed the header title fills with colour as it downloads, then a prompt lets you reload to the named new version when it suits you. [Learn more](feature:updates)
- **In-app notifications** — Brief, self-dismissing toasts confirm actions whose result you can't immediately see — deleting, archiving, restoring, removing a list, namespace changes, and undo / redo — themed to match the active palette.
- **Swedish translation** — The interface is now translatable and ships a Swedish translation, picked automatically from your browser's language on first visit.
- **Build version label** — A version label beneath "View source" in the side menu shows the running build — semver plus the CI build number and commit hash.
- **Pull to refresh** — On touch devices you can pull down from the top of the list to reload your checklist from storage.
- **Header menu & privacy policy** — A burger menu gathers Settings, an in-app "What's new" changelog, the source on GitHub, a privacy policy at /privacy, and an optional Donate link.
- **Cloud storage & encryption** — Sync your lists to your own Google Drive or Dropbox, optionally encrypt them with a passphrase, and resolve conflicts when two devices edit at once — with a cloud-sync status icon in the header. [Learn more](feature:cloud-sync)
- **New-item position** — A **Settings → Lists** preference chooses whether new items are added to the top or bottom of the list.
- **Archive view & side menu** — A side drawer switches between your checklist and an archive view, where archived items from every list are grouped by source and can be restored or deleted. [Learn more](feature:archive)
- **Undo & redo** — Undo and Redo entries (and Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z shortcuts) step back and forth through your recent edits, restoring items you've deleted.
- **Draggable navigation button** — Drag the floating navigation button to either side of the screen and it snaps to the nearest edge, stays above the keyboard, and remembers where you left it. [Learn more](feature:navigation)
- **Header logo** — The app icon now sits to the left of the "checklist" wordmark in the header.
- **Namespaces** — Keep separate checklists in named namespaces — each in its own folder on Dropbox / Google Drive — with an icon and colour that badge the side menu and re-skin the app while one is active. [Learn more](feature:namespaces)
- **Multiple checklists** — Keep several checklists side by side, switch between them from the side menu, add new ones, and rename the current one from its header title.
- **Local folder & markdown files** — Save your lists to a folder on your device, where each checklist becomes its own markdown file — the same per-list layout Dropbox and Google Drive now use. [Learn more](feature:local-folder)
- **Swipe to remove in the side menu** — Swipe a checklist or namespace row left in the side menu to reveal a trash button — a checklist goes in one tap (undoable), a namespace asks for a confirming tap.
- **Hide the menu button** — In the installed app on Android or iOS you can hide the floating menu button and swipe in from the screen edge to open the menu instead.
- **Pinned sidebar on wider screens** — On screens at least as wide as the smallest iPad the navigation stays open as a permanent sidebar beside your list.
- **Checklist item count** — Each checklist in the side menu shows a badge with its number of not-yet-completed items.
- **Settings travel with your folder** — Your appearance and list settings are saved to a `settings.json` file at the root of your folder, so they follow you to every device that syncs it.
- **Disable toasts** — A General-tab setting to suppress pop-up toast notifications, leaving the "new build ready" upgrade hint untouched.
- **iCloud sync (iOS)** — The iOS app can store its lists in iCloud, keeping them in sync across your Apple devices; pick it under Storage.
- **Copy and paste checklists** — Copy the whole list to your clipboard as markdown from the header, and paste a markdown checklist into the add-item field to import its lines — checked boxes stay checked.
- **Achievements** — Every feature is an unlockable, four-tier (Beginner → Intermediate → Pro → Expert) achievement — earn them as you go and browse the whole tour from the header trophy. [Learn more](feature:achievements)
- **Edit item text and add markdown notes** — Tap an item to edit its text in place, and give it a markdown note beneath the title that a chevron reveals. [Learn more](feature:notes)
- **Cloud sync details** — The header cloud button opens a sync details dialog showing what the backend is doing and, when a save fails, why — with reconnect and retry buttons.
- **Archive or delete finished items in one sweep** — Long-press the add (+) button to fan out a glyph bar that archives or, with a confirming tap, deletes every finished item at once. [Learn more](feature:bulk-actions)

### Changed

- **New home at checklist.niclaslindstedt.se** — The app now lives at its own domain, checklist.niclaslindstedt.se, served from the site root.
- **One menu** — The top-right burger menu has moved to the foot of the side drawer, so settings, "what's new", and the project links now live in one place.
- **Floating add button** — Adding an item is now a floating **+** button that opens an inline draft row where the item will land; tap away from an empty draft and nothing is saved.
- **Themed dropdowns** — Settings dropdowns (font, text size, and the log-level filter) now use a custom keyboard-navigable picker styled to match the app.

### Fixed

- **Snappier long lists** — Checking, adding, removing, archiving, reordering, and undoing/redoing on a long checklist no longer re-renders every row, so each edit stays fast as the list grows.
