# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is **generated at release time from the changeset fragments**
in `.changes/unreleased/` — do not edit released sections manually. Add a
fragment per user-visible change (see `AGENTS.md` → "Releases and
changelog").

## [Unreleased]

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
- **Pull to refresh** — On touch devices you can pull down from the top of the list to reload your checklist from storage. [Learn more](feature:updates)
- **Header menu & privacy policy** — A burger menu gathers Settings, an in-app "What's new" changelog, the source on GitHub, a privacy policy at /privacy, and an optional Donate link.
- **Cloud storage & encryption** — Sync your lists to your own Google Drive or Dropbox, optionally encrypt them with a passphrase, and resolve conflicts when two devices edit at once — with a cloud-sync status icon in the header. [Learn more](feature:cloud-sync)
- **New-item position** — A **Settings → Lists** preference chooses whether new items are added to the top or bottom of the list.
- **Archive view & side menu** — A side drawer switches between your checklist and an archive view, where archived items from every list are grouped by source and can be restored or deleted. [Learn more](feature:archive)
- **Undo & redo** — Undo and Redo entries (and Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z shortcuts) step back and forth through your recent edits, restoring items you've deleted. [Learn more](feature:undo-redo)
- **Draggable navigation button** — Drag the floating navigation button to either side of the screen and it snaps to the nearest edge, stays above the keyboard, and remembers where you left it. [Learn more](feature:navigation)
- **Header logo** — The app icon now sits to the left of the "checklist" wordmark in the header.
- **Namespaces** — Keep separate checklists in named namespaces — each in its own folder on Dropbox / Google Drive — with an icon and colour that badge the side menu and re-skin the app while one is active. [Learn more](feature:namespaces)
- **Multiple checklists** — Keep several checklists side by side, switch between them from the side menu, add new ones, and rename the current one from its header title. [Learn more](feature:multiple-checklists)
- **Local folder & markdown files** — Save your lists to a folder on your device, where each checklist becomes its own markdown file — the same per-list layout Dropbox and Google Drive now use. [Learn more](feature:local-folder)
- **Swipe to remove in the side menu** — Swipe a checklist or namespace row left in the side menu to reveal a trash button — a checklist goes in one tap (undoable), a namespace asks for a confirming tap.
- **Hide the menu button** — In the installed app on Android or iOS you can hide the floating menu button and swipe in from the screen edge to open the menu instead. [Learn more](feature:navigation)
- **Pinned sidebar on wider screens** — On screens at least as wide as the smallest iPad the navigation stays open as a permanent sidebar beside your list. [Learn more](feature:navigation)
- **Checklist item count** — Each checklist in the side menu shows a badge with its number of not-yet-completed items. [Learn more](feature:multiple-checklists)
- **Settings travel with your folder** — Your appearance and list settings are saved to a `settings.json` file at the root of your folder, so they follow you to every device that syncs it. [Learn more](feature:local-folder)
- **Disable toasts** — A General-tab setting to suppress pop-up toast notifications, leaving the "new build ready" upgrade hint untouched.
- **iCloud sync (iOS)** — The iOS app can store its lists in iCloud, keeping them in sync across your Apple devices; pick it under Storage. [Learn more](feature:cloud-sync)
- **Copy and paste checklists** — Copy the whole list to your clipboard as markdown from the header, and paste a markdown checklist into the add-item field to import its lines — checked boxes stay checked. [Learn more](feature:copy-paste)
- **Achievements** — Every feature is an unlockable, four-tier (Beginner → Intermediate → Pro → Expert) achievement — earn them as you go and browse the whole tour from the header trophy. [Learn more](feature:achievements)
- **Edit item text and add markdown notes** — Tap an item to edit its text in place, and give it a markdown note beneath the title that a chevron reveals. [Learn more](feature:notes)
- **Cloud sync details** — The header cloud button opens a sync details dialog showing what the backend is doing and, when a save fails, why — with reconnect and retry buttons. [Learn more](feature:cloud-sync)
- **Archive or delete finished items in one sweep** — Long-press the add (+) button to fan out a glyph bar that archives or, with a confirming tap, deletes every finished item at once. [Learn more](feature:bulk-actions)

### Changed

- **New home at checklist.niclaslindstedt.se** — The app now lives at its own domain, checklist.niclaslindstedt.se, served from the site root.
- **One menu** — The top-right burger menu has moved to the foot of the side drawer, so settings, "what's new", and the project links now live in one place.
- **Floating add button** — Adding an item is now a floating **+** button that opens an inline draft row where the item will land; tap away from an empty draft and nothing is saved. [Learn more](feature:checklist)
- **Themed dropdowns** — Settings dropdowns (font, text size, and the log-level filter) now use a custom keyboard-navigable picker styled to match the app. [Learn more](feature:themes)

### Fixed

- **Snappier long lists** — Checking, adding, removing, archiving, reordering, and undoing/redoing on a long checklist no longer re-renders every row, so each edit stays fast as the list grows.
