# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is **generated at release time from the changeset fragments**
in `.changes/unreleased/` — do not edit released sections manually. Add a
fragment per user-visible change (see `AGENTS.md` → "Releases and
changelog").

## [Unreleased]

## [1.0.0] - 2026-06-17

### Added

- **Checklist view** — A quiet, monospaced checklist you can add items to, check off, drag by the grip handle to reorder, swipe left to delete, and swipe right to archive — shipping dark by default.
- **Installable app icon** — checklist now ships a full home-screen icon set, so you can install it as a real app with a proper icon on iOS, Android, and desktop.
- **Settings & themes** — The header menu opens a Settings dialog with a theme picker — eleven presets plus a fully custom theme, four fonts, and an adjustable text size — and a developer mode for capturing logs and loading sample data.
- **Update notifications** — When a new version of checklist has been deployed, the header title fills with colour from the bottom as the update downloads, then a prompt appears so you can reload to apply it at a moment of your choosing, naming the version you're upgrading to.
- **In-app notifications** — Brief, self-dismissing toast notifications surface status messages and confirm actions whose result you can't immediately see — deleting, archiving or restoring an item, removing a list, creating or deleting a namespace, and undo / redo (which now name the action they stepped past) — themed to match the active palette.
- **Swedish translation** — The interface is now translatable and ships a Swedish translation, picked automatically from your browser's language on first visit.
- **Build version label** — A version label beneath "View source" in the side menu shows the running build — semver plus the CI build number and commit hash — so you can tell at a glance which version you're on.
- **Pull to refresh** — On touch devices you can now pull down from the top of the list to reload your checklist from storage.
- **Header menu & privacy policy** — A burger menu in the top-right corner gathers Settings, an in-app "What's new" changelog, the source on GitHub with the running build label, a new privacy policy at /privacy, and an optional Donate link.
- **Cloud storage & encryption** — A new Settings → Storage tab lets you sync your lists to your own Google Drive or Dropbox, optionally encrypt them with a passphrase (AES-GCM, never leaving your device), and resolve conflicts when two devices edit at once — with a cloud-sync status icon in the header that shows whether you're synced, saving, or need to act.
- **New-item position** — A **Settings → Lists** preference chooses whether new items are added to the top or bottom of the list.
- **Archive view & side menu** — A floating button on the left edge expands a navigation drawer that switches between your checklist and a new archive view — where archived items from every checklist are grouped under a heading for the list they came from, and can be restored to that list or deleted for good.
- **Undo & redo** — The burger menu now has Undo and Redo entries (and Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z shortcuts) that step back and forth through your recent edits, restoring items you've deleted.
- **Draggable navigation button** — Drag the floating navigation button to either side of the screen and it snaps to the nearest edge, gliding into place and remembering where you left it — it tracks your finger precisely, doesn't trigger a pull-to-refresh when dragged downward, and stays put and reachable above the on-screen keyboard instead of slipping behind it.
- **Header logo** — The app icon now sits to the left of the "checklist" wordmark in the header.
- **Namespaces** — Keep separate checklists in named namespaces — each in its own folder on Dropbox / Google Drive — so you can share one namespace's folder (say, with family) without sharing the rest, and give each one its own icon and colour (picked when you create it) that badge it in the side menu and re-skin the app logo and favicon while it's active.
- **Multiple checklists** — Keep several checklists side by side — switch between them from the side menu, add a new one (named Checklist, Checklist 2, …), and click the title in the header to rename the one you're on.
- **Local folder & markdown files** — Save your lists to a folder on your device, where each checklist and template becomes its own markdown file you can open or edit with any tool — and Dropbox and Google Drive now store the same per-list markdown files (only This device keeps a single JSON document).
- **Swipe to remove in the side menu** — Swipe a checklist or namespace row left in the side menu to reveal a trash button — removing a checklist is one tap (undoable), while removing a namespace asks for a second confirming tap.
- **Hide the menu button** — In the installed app on Android or iOS you can now hide the floating menu button from the General settings — swipe in from the edge of the screen to open the menu instead.
- **Pinned sidebar on wider screens** — On screens at least as wide as the smallest iPad the navigation now stays open as a permanent sidebar beside your list, instead of hiding behind the floating menu button.
- **Checklist item count** — Each checklist in the side menu now shows a badge with its number of not-yet-completed items, the same way the archive shows its count.
- **Settings travel with your folder** — Your appearance and list settings are now saved to a `settings.json` file at the root of your Local folder, Dropbox, or Google Drive — beside the namespace folders — so they follow you to every device that syncs the folder.
- **Disable toasts** — A General-tab setting to suppress pop-up toast notifications, leaving the "new build ready" upgrade hint untouched.
- **iCloud sync (iOS)** — The iOS app can now store its lists in iCloud, keeping them in sync across your Apple devices; pick it under Storage in the list menu.
- **Copy and paste checklists** — Copy the whole list to your clipboard as markdown from the new header button, and paste a markdown checklist into the add-item field to import its lines as items — checked boxes stay checked.
- **Achievements** — Every feature is now an unlockable, four-tier (Beginner → Intermediate → Pro → Expert) achievement — earn them as you go, see new ones pop up from the header trophy, and browse the whole tour there too.
- **Edit item text and add markdown notes** — Tap an item to edit its text in place, and give it a markdown note beneath the title (Shift+Enter on desktop, or "Add a note" in the editor) — a noted item shows a chevron you tap to reveal the rendered note, and tap again to edit.
- **Cloud sync details** — The header cloud button now opens a sync details dialog that shows what the backend is doing and, when a save fails, the exact reason — with buttons to reconnect or retry without leaving the list.
- **Archive or delete finished items in one sweep** — Long-press the add (+) button to fan out a glyph bar that archives (blue) or, with a confirming tap, deletes (red) every finished item at once.

### Changed

- **New home at checklist.niclaslindstedt.se** — The app now lives at its own domain, checklist.niclaslindstedt.se, served from the site root.
- **One menu** — The top-right burger menu has moved to the foot of the side drawer, so settings, "what's new", and the project links now live in one place.
- **Floating add button** — Adding an item is now a floating **+** button — circular and centred on phones, a clear button on wider screens — that opens an inline draft row where the item will land; tap away from an empty draft and nothing is saved.
- **Themed dropdowns** — Settings dropdowns (font, text size, and the log-level filter) now use a custom keyboard-navigable picker styled to match the app instead of the browser's native select.

### Fixed

- **Snappier long lists** — Checking, adding, removing, archiving, reordering, and undoing/redoing on a long checklist no longer re-renders every row, so each edit stays fast as the list grows.

