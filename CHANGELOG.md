# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is **generated at release time from the changeset fragments**
in `.changes/unreleased/` — do not edit released sections manually. Add a
fragment per user-visible change (see `AGENTS.md` → "Releases and
changelog").

## [Unreleased]

## [1.6.0] - 2026-10-18

### Changed

- **Sign-up wording** — Where the app talks about signing up, it now says plainly that there is nothing to sign up for and nothing to sign in to.

### Fixed

- **Phone app privacy page** — In the phone app, the privacy page now describes the phone app alone: everything it runs comes inside the download, it sends nothing when it starts, and its only network traffic is the iCloud sync you turn on.

### Removed

- **What's new in the phone app** — The phone app no longer has its own What's new, because its version history now lives in the App Store's What's New, while the website and the desktop app keep theirs.

## [1.5.0] - 2026-10-17

### Added

- **Count categories** — The checked / total counter and the sidebar's badge now leave category headers out, so a grouped list finishes at n/n — Settings → Lists → "Count categories" puts them back.
- **Transforms** — Settings → Transform lets each namespace have its own rules that rewrite how your items read — turning a reference like `#134` into a link to that issue, swapping one phrase for another, or masking a code as `076****123` — without changing the text your lists actually store. [Learn more](feature:transforms)
- **Not before** — An item can now be held back until a day you choose: its checkbox stays shut and it waits at the bottom of the list under a plain gray date saying when it opens up, set from the deadline sheet — now renamed **Timing** — which won't offer a due date earlier than that day.
- **Date sorting** — Items with a due date now lead the list and held-back items sink below the rest of your open work, both soonest-first and both switchable in Settings → Lists.
- **Scheduled resets** — Swipe a list right in the sidebar (or right-click it) and tap the clock to make it uncheck itself on a schedule — every so many days, weeks or months, or on chosen weekdays, at a time of day you pick — optionally popping the fresh list up the next time you open the app; the template button now lives on that same right swipe. [Learn more](feature:scheduled-resets)
- **Repeat without a due date** — A repeat no longer needs a deadline to hang on: set one on its own and checking the item off simply rests it until the cadence comes around, when it returns unchecked at the top of the list — and a new **daily** repeat picks the time of day it comes back.
- **Checklist on the desktop** — Checklist now has a desktop download for Windows, macOS and Linux, attached to every release. It is the same app with a window around it, it needs no network, and it keeps its own checklists on your machine. [Learn more](feature:desktop-app)
- **Dropbox in the desktop app** — The desktop app can now connect Dropbox: signing in opens your usual browser, and the app picks up the result once you approve.
- **Required items** — Mark an item required from its menu: it wears a "required" tag, can't be archived until it's checked, and once every required item is checked the list shows a check beside its name.
- **Hide the menu button in the phone app** — The phone app now offers Settings → General → Show menu button, as the installed web app does: turn it off and swipe in from the screen's edge to open the menu.

### Changed

- **Faster first load** — The app now runs on Preact instead of React, cutting the download it needs before it can show you anything by about a quarter — a shorter wait on a cold start and on every update, and less to store offline.
- **Instant About and Privacy pages** — The About and Privacy pages are now built as finished pages rather than assembled in your browser, so they appear the moment they load and can be read by link previews and anything else that doesn't run scripts.
- **Quicker to open** — The app now loads only what it needs to show you your list, fetching dialogs like Settings and What's new the first time you open them — so it starts faster, and a screen you never visit costs you nothing.
- **Naming a list** — A list you create now opens its name field ready to type, and on a phone pressing a list's name raises the keyboard with it — and a press anywhere in the list puts it away again.
- **App icon** — The home-screen and launcher icon now sits on a near-black background so it blends in with the other icons on a dark home screen.
- **The macOS download is signed and notarized** — The macOS app is now signed with a Developer ID certificate and notarized by Apple, so it opens like any other app instead of being refused on first launch until it is allowed in System Settings.
- **US spelling** — The English interface now spells and speaks the American way — "Color", "Capitalize items", "organize", items you "check off" rather than "tick off", a repeat that "comes around" — to match the App Store listing. The categories guide's shopping list is sorted by the grocery store and the pharmacy rather than by two Swedish chains.
- **The website asks search engines not to index it** — People should find checklist through its App Store page and apps.agilator.se, so every page of checklist.niclaslindstedt.se now carries a `noindex` robots tag, and the sitemap, structured data and `llms.txt` are gone.
- **Dates follow your device** — In English, due dates, times, the time fields and the calendar now follow your device's region — "Sep 27", "7:00 AM" and weeks from Sunday in the US, "27 Sept", "07:00" and weeks from Monday in Britain — while Swedish stays Swedish.

### Fixed

- Checking an item off no longer leaves its row stuck open for editing — unstruck, and still behaving as the active row even after you pressed something else — and a checked item now stays locked until you uncheck it, though its note still opens to read.
- Tapping the add button now raises the keyboard with the new-item field on a phone or tablet, instead of leaving the field focused but the keyboard down until you tapped it a second time.
- A Dropbox item typed just as the session's access token expired no longer disappears when the app silently reconnects.
- The **+** on a category header now shows the click pointer on hover, like every other button in a list, instead of the plain arrow.
- **The privacy policy covers the app as well as the website** — The policy said the app is served by GitHub Pages. That is true of the website; the App Store and Google Play app serves its own copy on the device and sends no such request. The policy now says both, and links to the one the store listing uses.
- The floating menu button keeps clear of the notch and the home indicator: it can no longer rest or be dragged under the status bar, the Dynamic Island or the home indicator on an iPhone.
- **The iOS app fills the screen edge to edge, like the installed PWA** — The App Store build framed the page inside the safe area, leaving flat bands above and below it, so the side menu stopped short of the status bar and the home indicator. The page now runs full-bleed on iOS and pads itself around the notch and home indicator exactly as the PWA does.
- **The iOS app no longer closes at launch** — The wrapper subscribed to iCloud changes through a method the iCloud key-value module does not have, which threw as soon as the page mounted and closed the app. It now listens for the module's change event, so remote iCloud edits reach the list and the app opens.

### Removed

- **Google Drive sync** — Google Drive is no longer one of the places a checklist can be kept. This
  device, a folder you pick, Dropbox and iCloud remain.
  
  If you had Drive connected, the app falls back to this device. Your lists stay
  in their app folder in your own Drive, where you can read, export or delete
  them as you would any other file — nothing is removed from your account.
- **No Donate link in the phone and desktop apps** — The side menu's Donate entry is the website's alone now: the App Store and desktop apps leave it out, link and all, because an app from a store may not point at a payment page outside it.
- **No achievements in the phone and desktop apps** — Achievements, the trophy row, unlock toasts and their Settings switch are the website's alone now; the App Store and desktop apps leave them out, and anything earned on the website is kept.
- **No links to the source in the phone and desktop apps** — The App Store and desktop apps no longer link to the source code or its releases: the side menu's source row is the website's alone, and the in-app privacy page gives the support address, support@agilator.se, as its contact. The website keeps its links.
- **Phone app storage** — The phone app keeps your lists on this device or, on an iPhone or iPad, in your own iCloud — the only two places its Storage settings offer — and a phone that synced them anywhere else now keeps its last copy on the device, leaving the other copy where it was.

## [1.4.0] - 2026-08-07

### Added

- **Empty the archive** — The archive view's header now has a button that permanently clears the whole archive — every archived item and archived list at once — behind a confirm, with undo to bring it all back.
- **Archive typeahead** — Typing a new item now suggests matching titles from the list's archived items — fuzzy-matched, highlighted, and ranked so titles that start with what you typed lead, then by how often you've used them — press one to re-add it instantly.
- **Archived drawer** — Swipe up at the foot of a list to reveal a drawer of just that list's archived items, and restore or delete them without leaving the list.
- **Deadlines** — Give an item a due date (and an optional repeat like every 2 weeks) from the tap-friendly calendar on the clock revealed by a left swipe — tap its heading to jump straight to any month or year — and dated items gather at the bottom of the list under a color-coded date row that warms from yellow to orange to red as the day nears, and checking off a recurring one rolls it to its next occurrence. [Learn more](feature:deadlines)
- **iCloud sync** — In the iOS app you can now sync your lists across your Apple devices through iCloud — no account, no sign-in, and no server of ours in the middle — chosen under Settings → Storage. [Learn more](feature:icloud-sync)
- **Home Screen widgets** — On the native app, add checklist widgets to your Home or Lock Screen — a progress ring, what's due today across your lists, a quick-add shortcut, and an interactive list you can check items off from with a single tap without opening the app. [Learn more](feature:widgets)
- **Collapsible menu footer** — A thin chevron rail above the side-menu footer folds Donate, the trophy, About, and Settings away — handing the freed space to your checklist — and tap it again to bring them back; the choice is remembered per device.
- **Deadline reminders** — On the native app, an item with a due date now fires a local notification when it comes due — even with the app closed — with optional day-before and week-before nudges, and repeating deadlines that re-arm themselves. [Learn more](feature:deadline-reminders)
- **Categories** — Promote an item that has sub-items to a category — a slim header with its own (+) button that groups the items under it and stays put when you archive or delete every finished item. [Learn more](feature:categories)
- **Templates** — Save any checklist as a reusable template — sub-items, categories, notes, required flags and deadlines all captured, every box unchecked — then stamp a fresh, independent list out of it whenever you need one. [Learn more](feature:templates)
- **Copy one category** — On a list with categories the copy button now asks what to copy — the whole list, or just one category's items.
- **Clickable links in notes** — A web address in an item's note — pasted plainly or written as a markdown link — is now a real link that opens the page instead of the note's editor.
- **Browser navigation** — Opening one list after another now leaves a trail the browser's Back and Forward buttons walk, and the address bar names the list you have open so you can bookmark it and come straight back.

### Changed

- **Native app** — The iOS and Android app now embeds the full web app and runs it offline, so it has every feature the web version does instead of a subset.
- **Footer button spacing** — The side-menu footer and its collapse rail sit snug at the foot of the drawer — handing the reclaimed bottom safe-area space to your checklist list — while the side-menu and full-screen settings dialog both keep a comfortable thumb-reach margin below their footer buttons.

### Fixed

- **Delete while adding** — Deleting a swiped item while the add-item composer is open now removes the item and keeps the composer open, instead of silently dropping the delete and closing the composer.
- **Add button after delete** — The green add-item button no longer disappears when you delete the very item you just added while the add-item composer is still open.
- **Checks stick on open** — Checking items right after opening a list no longer risks them silently un-checking when a slow cloud read finishes — an edit made while the backend load is still in flight is now kept instead of overwritten.
- Applying an app update now saves your unsaved changes first, so an item added just before updating is no longer lost.
- **List icons in the sidebar** — The navigation drawer now shows each checklist's own icon and accent color on its row, instead of the same generic list mark for every list.
- **Full-height on iOS home screen** — The installed iOS app now paints all the way to the bottom of the screen instead of leaving a dead black band above the home indicator — your list and the side-menu drawer get the full screen height, the checklist and archive surfaces run edge-to-edge with the header sitting snug under the Dynamic Island and the list stretching down to the bottom.
- **Sidebar header alignment** — The navigation drawer's top heading now lines up with the checklist page's own header instead of sitting a few pixels lower.
- The sync details dialog now shows the real Dropbox app folder name, so the
  file location and the "Open in Dropbox" link point at the folder your lists
  actually live in.
- Dropping a dragged item in the empty space below the list now lands it at the bottom of the list rather than tucking it under whichever category owns the last row.
- Holding a checklist item on a phone or tablet no longer highlights the whole page behind the menu it opens — text selection now stays where it is useful, in the item title and note editors.

## [1.3.0] - 2026-07-01

### Added

- **Include archived in copy** — A Lists setting (off by default) that appends a list's archived items to the markdown the copy button puts on your clipboard.
- **Drag a folder to another namespace** — Drag a whole folder onto another namespace to move the folder and every list inside it there at once.
- **Capitalize items** — A Lists setting (off by default) that capitalizes the first letter of each item as you type it, so "buy milk" is added as "Buy milk".
- **Check all / Uncheck all** — Press the header's checked/total count to open a dropdown that checks or unchecks every item in the list at once.
- **Search** — Find any checklist, item, note, or sub-item across every list from the action bar — matches highlight as you type, and you can search with fuzzy text, wildcards, or a regex. [Learn more](feature:search)
- **List icons and colors** — Tap the mark beside a checklist's title to give that list its own icon and accent color, shown in the header so you can tell your lists apart at a glance.
- **Swipe the sidebar away** — Swipe the open navigation drawer back toward its resting edge to slide it shut, the gesture counterpart to swiping it open.

### Fixed

- **Capitalized new items** — New checklist items now capitalize their first letter on a mobile keyboard, even when the previous item didn't end with a period.
- **Long-press add button no longer mis-fires** — Lifting your finger after long-pressing the add (+) button to reveal the archive / delete bar no longer fires one of those buttons on iOS — the action now waits for a deliberate, separate tap.
- **Safer encryption toggle** — Turning encryption off no longer risks losing checklists when a cloud backend rate-limits the change — it rides out the throttle and keeps the encrypted copy intact until every list is safely rewritten.
- **Long item titles wrap** — A checklist item whose title is too long for one line now wraps onto the next instead of being clipped with an ellipsis.

## [1.2.1] - 2026-06-24

### Fixed

- **Drag-and-drop reliability** — Filing a checklist into a folder no longer freezes mid-air when you release away from the row or when a sync conflict surfaces mid-drag.

## [1.2.0] - 2026-06-24

### Added

- **Collapsible archive groups** — Tap a checklist's header in the archive to collapse or expand its archived items.

### Changed

- **Tidier side menu** — The namespace list now folds away (showing just the active one), a collapsed folder still peeks the active list inside it, only the checklist list scrolls so the menu's controls stay put, New list / New folder / Archive and Undo / Redo share one tidy action panel that sits flush with even spacing on every side, and the source, privacy, and "what's new" links moved into an About menu.
- **Unlock status and cipher animation** — The unlock screen now flashes what it's doing while it checks your passphrase and decrypts your lists, and the encryption status bars swap the spinner for a scrambling cipher animation.

### Fixed

- **Clearer drop targets when dragging a list** — Dragging a checklist now highlights the folder under your finger and frames the no-folder area, so it's clear where the list will land.
- **Restore icon** — The archive's restore button now uses a cleaner circular-arrow glyph whose arrowhead meets the arc flush.
- **Drag-to-reorder freezing on desktop** — Reordering a checklist item with a mouse no longer leaves the row stuck floating mid-drag when you release the button away from the grip handle.

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
- **Drag lists to organize** — Drag a checklist onto a folder, another namespace, or the archive to move it there — with a press-and-hold pickup on touchscreens.

### Changed

- **Clickable toasts with a countdown ring** — Click a toast to dismiss it immediately, and watch a circular ring fill clockwise to show how long it has left before it disappears on its own.
- **Namespaces sync across devices** — Your list of namespaces now travels with the cloud or folder backend: connecting Dropbox, Google Drive, or a local folder on a new device adopts the namespaces already there and uploads any it had locally, so your namespaces follow you instead of starting fresh on each device.
- **Privacy policy covers storage backends** — The privacy policy now documents the optional Local folder, Dropbox, and Google Drive backends, OAuth token storage, and end-to-end encryption — clarifying that lists leave your device only when you explicitly connect a cloud backend.
- **Bulk delete is one tap** — Deleting all finished items from the add (+) long-press now happens on the first tap with no confirm step, since the sweep is undoable.
- **Redesigned settings dialog** — Settings now opens with icon-marked tabs — a left rail on desktop and a header section menu on mobile — each tab grouped into labeled sections, and edits apply only when you press Save, with Cancel to discard and Reset to defaults to start over (appearance changes still preview live while you choose).
- **Achievement unlock popup as a centered card** — The "achievement unlocked" notification now appears as a compact centered card instead of a full-screen sheet on mobile, so a single new trophy no longer fills the whole screen.
- **Erase items with Backspace** — Editing an item down to a blank line now deletes it instead of keeping an empty row, and pressing Backspace on an emptied line — or in an empty add-item draft — backs editing up into the line above so you can keep erasing items in one stroke.
- **Achievements moved to the side menu** — The trophy moved out of the checklist header into a side-menu row that colors and badges itself with the count of new unlocks.
- **Background-less tab favicon** — The browser-tab favicon now shows the bare green check with no dark background, while the app and home-screen icons keep their badge.
- **Cloud sync details as a centered card** — The cloud sync details dialog now opens as a compact centered card instead of a full-screen sheet on mobile, so its short status no longer fills the whole screen.
- **Item count** — The list header's checked / total count is now a tidy badge with a progress ring that fills as you check items, and a new **Show item count** toggle on Settings → Lists lets you hide it.
- **Undo / redo buttons** — The side menu's Undo and Redo now sit as a compact pair of side-by-side buttons pinned to the foot of the drawer, just above the footer divider, so they stay within thumb's reach instead of taking two full rows in an Edit section.
- **Redesigned update-ready prompt** — The "update ready" prompt now leads with a clear headline over the incoming version and applies the update from a primary **Update** button.
- **Accent highlight for the active list and namespace** — The active checklist and namespace in the side menu are now marked by an accent-tinted highlight and left border instead of a swapped-in checkmark, so their own icon always stays visible.
- **Bigger checkbox tap target** — The checkbox on each list item now has a larger touch area — easier to tap on a phone — while the box itself looks exactly the same size.
- **Aligned add-item composer** — The "Add item…" field now shows a dimmed checkbox placeholder so its text lines up exactly with where the new item will land in the list.
- **Cloud sync command center** — The cloud-sync glyph now always opens a redesigned details dialog — showing the backend and at-rest encryption state side by side, a one-tap Reload, and (in developer mode) a sync log (newest entries first, and now naming a dropped connection plainly instead of a cryptic "Load failed") — and tapping the glyph is the single, predictable way in whatever the sync state.
- **Clearer note indicator** — Items that carry a note now show a note glyph instead of a chevron — gray while the note is hidden and highlighted while it's revealed, so you can tell at a glance which items have more to read.

### Fixed

- **Resilient cloud autosave** — Cloud sync now waits out a backend rate limit and resumes on its own, retries a transient network hiccup with exponential backoff, and — when a save does fail outright — re-pushes it when you hit Try again, instead of getting stuck or flashing a sync error.
- **Multi-paragraph item notes** — Item notes that span more than one paragraph are no longer truncated to their first paragraph when a list is saved to and reloaded from a folder, Google Drive, or Dropbox.
- **Keyboard staying up in modals** — Typing in a modal field (such as the unlock passphrase) no longer dismisses the on-screen keyboard on every keystroke.
- **Changelog formatting** — The "What's new" changelog now renders its **bold** lead-ins and `code` spans as formatted text instead of showing the raw markdown asterisks and backticks.
- **Bulk archive / delete on iOS** — The fan-out archive and delete buttons behind the add (+) long-press now respond to taps on iOS, where they were being covered by the dismiss overlay so every tap closed the menu instead of running the action.
- **Unlock prompt within reach on mobile** — The passphrase unlock prompt now appears as a single centered card on a plain background — no full-screen sheet or dimmed dialog chrome — keeping the unlock button within thumb's reach on a phone.
- **Bulk actions match the add button on desktop** — The archive / delete buttons behind the add (+) long-press now adopt the flat, tinted desktop styling of the add button and stay centered under it instead of drifting toward the docked sidebar.
- **Symmetric Donate heart** — The Donate menu's heart glyph is now drawn from a balanced, symmetric shape instead of a lopsided hand-rolled path.
- **Undo shortcuts ignored while the side menu is open** — Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z no longer reach through an open side menu to undo or redo changes to the list behind it.
- **Cleaner "Open in" sync button** — The cloud-sync details "Open in Dropbox" button no longer trails an "(encrypted)" suffix — it names the destination service, not the at-rest encryption state.
- **Disabling encryption removes the encrypted file** — Turning encryption off now always rewrites your lists as plaintext and deletes the leftover `checklist.json` envelope, even when a stale plaintext copy was shadowing it on a synced folder or cloud.
- **No more accidental swipe-back in the iOS PWA** — Swiping in from the screen edge to open the sidebar in the installed iOS app no longer triggers the system's "swipe to go back" gesture and yanks the app off-screen.
- **Centered update prompt beside the sidebar** — The "new build ready" reload prompt now centers over the content area instead of the whole window, so it no longer sits off-center next to the pinned sidebar on wide screens.
- **Editing items on mobile** — Editing an item on a phone now keeps the row lined up with the rest of the list, opens the editor from a tap anywhere along the row (not just on the text), moves editing straight to another item when you tap it without the keyboard dropping or the add button flashing back, lets you check its checkbox while editing, scrolls it into view above the keyboard only when it's actually hidden, and without the page or its frozen header jerking, hides the add button while you type, eases the note field open, and leaves only the system keyboard bar on screen instead of stacking a second one over it.
- **Drag-and-drop reliability** — Dragging an item now lets you drop it back into its original spot between two other rows, and a sync conflict that surfaces mid-drag no longer freezes the screen.
- **Instant reload on cloud backends** — Reloading the app on a Dropbox or Google Drive backend now paints the last-seen list right away from the on-device copy instead of flashing an empty list while the live data loads from the cloud.
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

- **Checklist view** — A quiet, monospaced checklist you fill, check off, reorder by dragging the grip handle, and swipe to delete or archive — dark by default. [Learn more](feature:checklist)
- **Installable app icon** — checklist ships a full home-screen icon set, so you can install it as a real app with a proper icon on iOS, Android, and desktop.
- **Settings & themes** — A Settings dialog with eleven theme presets plus a fully custom theme, four fonts, an adjustable text size, and a developer mode. [Learn more](feature:themes)
- **Update notifications** — When a new version is deployed the header title fills with color as it downloads, then a prompt lets you reload to the named new version when it suits you. [Learn more](feature:updates)
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
- **Namespaces** — Keep separate checklists in named namespaces — each in its own folder on Dropbox / Google Drive — with an icon and color that badge the side menu and re-skin the app while one is active. [Learn more](feature:namespaces)
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
