# Overview

How the app's subsystems and features actually behave — the "how it
works" companion to `docs/dictionary.md`.

The dictionary answers _"the user said X — which file is that?"_: it
maps every term to the most specific file and the symbols to grep for,
and stops there. **This file answers the next question** — _"I've
found the file, so how does this subsystem work, and what else does it
touch?"_ Every term in the dictionary has a matching entry here, under
the same section headings, so the two read as a pair: look the word up
in the dictionary to find the code, read the same word here to
understand it.

It is **not** a way to find code (the dictionary does that) and it is
**not** the module / persisted-shape inventory (`docs/architecture.md`
does that — the module layout, the `Snapshot` shape, the migration
runner, the storage seam). Read this to grasp a feature's behaviour and
its cross-module reach before working a request, especially to discover
the surfaces a change touches beyond the one file the request names.

**Maintain it in lockstep with the code, in the same PR.** When a
feature's behaviour changes, update its entry here — and the dictionary
row too if the file or symbols moved (usually only the overview needs
touching, since the dictionary row is just a pointer). Keep
descriptions to current behaviour and invariants, not changelog
narration ("used to…", "previously…"). Keep the inline `file.ts` /
`symbol` references so the prose stays navigable. The headings here
mirror the dictionary's sections one-to-one; add a new heading
whenever you add a dictionary row.

## Top-level UI

### App shell

`src/app/App.tsx` — the thin root component. Wires the cross-cutting
hooks (`useSettings`, `useTheme`, `useViewportHeight`,
`useStorageBackend`, `useChecklist`, `usePullToRefresh`,
`useUndoRedoShortcuts`) and publishes their state through two focused
contexts instead of threading props down: `ChecklistContext`
(`src/ui/checklist-context.ts`) carries the `useChecklist` surface plus
the derived `SyncInfo`, and `NavContext` (`src/ui/nav-context.ts`) the
drawer/view state and the floating-button position. Both context values
are memoised so a settings-only re-render keeps a stable identity and the
memoised views don't reconcile. It owns the small bits of top-level UI
state: which `view` is showing (`"checklist"` or `"archive"`), whether
the side menu is open and the button's drag flag; the settings /
changelog / namespaces dialogs are owned by the modal bus. It renders one
of `ChecklistView` / `ArchiveView` plus the always-mounted overlays
(`SideMenu`, `SettingsModal`, `ChangelogModal`,
`ConflictResolutionModal`, `UnlockGate`, `PullToRefreshIndicator`).

### Checklist view

`src/ui/ChecklistView.tsx` — the main screen. A pinned shell that never
scrolls: a header (app wordmark, the checked/total progress count, the
sync glyph, the header burger menu), an internally-scrolling list of
`ChecklistRow`s, and the floating `AddItemButton` that opens the inline
`AddItemForm` composer. Drag-to-reorder is wired here via `useListReorder`.
The view owns the `drafting` flag that mounts the composer at the
landing position (`addItemPosition`) and hides the button while it's
open. The view is prop-free:
it reads its items and actions from `useChecklistContext`
(`src/ui/checklist-context.ts`). The `SyncInfo` type defined there carries
everything `SyncStatus` needs — provider name, save status, dirty flag,
`onSave`, `onOpenDetails` — and is null for the local backend.

### Checklist row

`src/ui/ChecklistRow.tsx` — one item line, with a three-layer
swipe-to-reveal interaction driven by `useRowSwipe`. The foreground
holds a `Checkbox`, the title (struck through when checked), and a grip
handle for vertical reordering. Swiping **left** latches open a Delete
button (two-step, so a delete is never a single flick); swiping
**right** archives the row (hidden, not destroyed). The two action
layers are gated on the swipe direction (`swipe.offset`'s sign): the
left-aligned Archive strip is visible only while sliding right, the
right-aligned Delete button only while sliding left. That gating matters
for the archive slide-off — the foreground travels the full row width to
the right, so without it the trailing-edge Delete button would be bared
as the row clears the screen on its way to the archive.

### Add-item button

`src/ui/AddItemButton.tsx` — the "add item" affordance. On small
viewports it's a circular floating action button centred at the bottom
of the screen; from the `sm` breakpoint up it relaxes into a normal,
clearly-styled accent button pinned under the list. Tapping it opens the
inline composer (`AddItemForm`) rather than adding an item directly.
`ChecklistView` hides the button while the composer is open.

### Add-item form

`src/ui/AddItemForm.tsx` — the inline composer row opened by
`AddItemButton`. It renders where the new item will land — styled like a
real `ChecklistRow` so the spot reads as the item being created — and
grabs focus so the soft keyboard comes straight up. Enter adds the item,
clears the field, and keeps focus so the user can type item after item
without re-tapping — a plain-text-editor feel. Blurring commits whatever
was typed and closes; blurring an empty field just closes, so a blank
item is never created or persisted. Where the new item lands (top or
bottom) follows the `addItemPosition` setting, surfaced on the checklist
surface for the view to place the draft row.

Pasting a markdown checklist into the field is the bulk-import path:
`onPaste` hands the clipboard text to `importItems` (see [Import
items](#import-items--paste-a-checklist)); a non-zero count means it was
a checklist (one or many `- [ ]` / `- [x]` / `- ` lines), so the default
paste is swallowed and the items are appended to the current list rather
than landing as literal text. A zero lets ordinary text paste through
untouched.

### Copy checklist

`src/ui/CopyButton.tsx` — the header glyph just left of the cloud-sync
glyph (and leftmost of the right-hand controls when no cloud backend is
active). Tapping it writes the active checklist to the clipboard as plain
task-list markdown via `checklistBodyMarkdown` (the `# Name` heading and
every `- [ ]` / `- [x]` line, checked items still checked, archived items
under `## Archived`) — **without** the persistence frontmatter the
on-disk `.md` files carry. It raises a confirmation toast and flips to a
tick for a beat so the copy reads even with toasts disabled; a failed
clipboard write raises an error toast. The body it produces round-trips
back through the paste-import path (see [Add-item form](#add-item-form)).

### Archive view

`src/ui/ArchiveView.tsx` — the same pinned shell as the checklist view,
listing archived items from **every** checklist (`archivedByChecklist`),
grouped under a header naming the list each item came from; lists with
nothing archived are omitted, and the header count is the total across
groups. Each row offers Restore (back into the item's **source** list,
not the active one) and Delete (permanent). There is no composer and no
reordering — items only ever enter the archive by being swiped-right in
the checklist view. Reached from the side menu.

### Side menu

`src/ui/SideMenu.tsx` — the navigation drawer. It has two layouts driven
by viewport width (`nav.pinned`, fed by `useMediaQuery("(min-width:
768px)")` in App — 768px is the smallest iPad, an iPad Mini in portrait).
**From the smallest iPad up it is pinned open as a permanent docked
sidebar** beside the content: no floating button, no backdrop, no
open/close — App lays it out as a flex sibling of the main view (a fixed
`w-64` panel with a single inner border, docked on whichever edge the
floating button rests on via `order-last` for the right side). **Below
that width it collapses** into a single floating menu button the user can
drag to either vertical edge (its resting spot persists in
`menuButtonPosition`). Pressing the
button slides the drawer in from that edge over a dimmed backdrop (a CSS
`animation` that plays off the mount — the `drawer-*` keyframes in
`styles/theme.css` — so there is no first-frame snap). The drawer opens
with the **namespace** section — the known namespaces (the active one
checked, click to switch), its heading carrying a trailing "+" that opens
`NamespacesModal` — then the **Checklists** switcher (every list by name,
the active one marked, click to switch + navigate; the heading's trailing
"+" appends a default-named list; each row badged with that list's count
of not-yet-completed items — active, non-archived, still unchecked —
hidden when the list is empty or fully checked off), with the Archive view
sitting at the foot of that same list (badged with the archived-item
count) rather than in a section of its own, then the Undo / Redo actions; it highlights the
active list and current view. The "+" affordances replace the full-width
"New namespace" / "New checklist" rows the drawer used to carry, and a
shared `SectionHeader` renders each heading with its optional action.
Pinned to the foot are the relocated
burger-menu links — settings, "what's new", privacy, the source on GitHub
(with the app version shown as a subtitle), and an optional donate link.
The drawer's open/current/position state comes from `useNav`
(`src/ui/nav-context.ts`, which exports the `View` type
`"checklist" | "archive"`) and the undo/redo/archive counts plus
`removeChecklist` from `useChecklistContext`; the namespace list and its
remove verb are still passed as props. Both the namespace rows and the
checklist rows support **swipe to remove** (below). Closes on Escape or
backdrop click. The floating button itself is positioned by
`useDraggableMenuButton` over the geometry in `sideMenuPosition.ts`.

### Swipe to remove (sidebar)

A left swipe on a namespace or checklist row in the side menu latches it
open to uncover a trailing trash button — the navigation-drawer counterpart
of the checklist row's swipe-to-delete. The gesture is `useSwipeReveal`
(`src/ui/hooks/useSwipeReveal.ts`), a pared-down sibling of `useRowSwipe`:
left-only, with no right-swipe outcome, so nothing is destroyed by the
swipe itself — the revealed trash button is the only way to act. The
`SwipeToRemove` wrapper in `src/ui/SideMenu.tsx` renders the button behind
a sliding foreground and owns the confirm policy:

- A **checklist** removes on a single tap of the trash (it is recoverable
  via undo, so no extra confirmation), calling `removeChecklist`.
- A **namespace** destroys a whole document in the active backend and is
  not undoable, so the trash asks for a **second confirming tap**: the
  first tap arms a confirm state (the button reads "Confirm"), the second
  commits via the `onRemoveNamespace` prop (`useStorageBackend`'s
  `removeNamespace`). Closing the row disarms the confirm step.

The two rows that must always survive never grow the affordance: the
**default namespace** (can't be removed) and the **last remaining
checklist** (the views always need one to show) render as plain rows.

### Floating menu button

The draggable launcher for the side menu. `useDraggableMenuButton`
(`src/ui/hooks/useDraggableMenuButton.ts`) follows the finger 1:1 while
dragging and snaps to the nearer edge on release; a press under the
drag threshold counts as a tap (so keyboard activation still works).
The button can be **hidden** — `SideMenu` only renders it when the nav
context's `showButton` is true. App sets that flag from the
`showMenuButton` setting, but only honours the opt-out in the installed
PWA on a phone / tablet (`useStandaloneMobile`, `src/pwa/standalone.ts`);
everywhere else the button always shows. When hidden, an inward edge
swipe opens the drawer instead (see Edge swipe to open).
The snap / clamp math is pure in `src/ui/sideMenuPosition.ts`
(`restingRect`, `clampRect`, `rectToPosition`, `MENU_BUTTON_SIZE`,
`MENU_BUTTON_MARGIN`), translating between the persisted
`MenuButtonPosition` (edge + vertical fraction) and pixel coordinates
so the position survives viewport resizes. The hook measures the
**visual viewport** (`window.visualViewport`) rather than
`window.innerWidth/innerHeight` and re-reads it on the visual
viewport's own `resize` / `scroll` events. This matters on iOS, where
the software keyboard shrinks (and can offset) the visual viewport
while leaving `innerHeight` at the full layout size: the geometry takes
the visible size plus its `offsetLeft` / `offsetTop`, so the fixed
button normalizes into whatever space the keyboard leaves above it
instead of disappearing behind it, and the drag clamp stays reachable.

### Edge swipe to open

`useEdgeSwipeOpen` (`src/ui/hooks/useEdgeSwipeOpen.ts`) is the gesture
that replaces the floating menu button when the user hides it: a
touch that starts within ~30px of the drawer's resting edge and travels
inward (more horizontally than vertically) past ~48px opens the drawer.
It mirrors `usePullToRefresh` — a document-level, touch-only listener
gated by an `enabled` flag (App enables it only while the button is
hidden and no modal or drawer already owns the screen) and suppressed
while a modal is mounted. It watches the edge matching
`menuButtonPosition.side`, so the panel always pulls in from where it
lives. Touch-only and PWA-only by design: in a normal browser tab an
edge swipe collides with the back-swipe, but a standalone window's edge
is free — which is why the opt-out is offered only there.

### Header menu

`src/ui/HeaderMenu.tsx` — the top-right burger menu. Opens a
self-anchored dropdown with Settings and Changelog ("What's new")
shortcuts, plus links to the privacy policy, the source on GitHub (with
a build label), and — only when `VITE_DONATE_URL` is set — a Donate
link. Dismisses on outside click or Escape.

### Checklist title

`src/ui/ChecklistTitle.tsx` — the header wordmark slot beside the
favicon. It shows the **active checklist's name** and doubles as the
rename affordance: clicking it swaps the text for an inline input
(Enter or blur commits a trimmed, non-empty name via
`renameChecklist`; Escape cancels). It also carries the PWA
download-fill treatment (`usePwaUpdate`'s `progress`) the standalone
wordmark used to own — the name fills with the accent colour from the
bottom while a new build's service worker downloads. `ChecklistView`
feeds it the active list's name (resolved from `checklists` +
`activeChecklistId`) and an `onRename` bound to the active id.

### Sync status

`src/ui/SyncStatus.tsx` — the header glyph that morphs to show the
cloud-sync state: an upload glyph with an accent ring when there are
unsaved edits, a spinner while saving, a green cloud-check when synced,
and a coloured cloud-alert for the conflict / auth / throttle / error
states. Tapping the upload glyph saves now (`onSave`); any other state
opens storage settings (`onOpenDetails`). Rendered only when a real
cloud backend is active — `App` passes a non-null `SyncInfo` only for
Dropbox / Google Drive, never for the local backend or while fake data
overrides the adapter.

### Modal

`src/ui/Modal.tsx` — the minimal accessible dialog primitive: a dimmed
backdrop, a centred card, Escape / backdrop-click to close, body-scroll
lock while open, and focus management (into the card on open, back to
the trigger on close). No portal — the app has a single root with no
competing stacking contexts. `SettingsModal`, `ChangelogModal`, and
`ConflictResolutionModal` build on it.

### Dropdown / custom select

`src/ui/form/SelectPicker.tsx` — the custom `<select>` replacement,
cloned from the budget project. The app uses **no native `<input>`
dropdowns**: every settings control that would otherwise be a `<select>`
(the font-family and text-size pickers on the Appearance tab, the
level filter on the Logs tab) renders a `SelectPicker` instead, so the
list of options is themed and styled consistently with the rest of the
UI. The trigger is a `role="combobox"` button wearing the `field-input`
look with a `ChevronDownIcon` caret; opening it portals a
`role="listbox"` of `role="option"` rows. Full keyboard nav (Arrow
keys / Home / End to move the highlight, Enter / Space to commit,
Escape to dismiss without committing) and a check mark on the current
value.

The popover machinery lives in `src/ui/FloatingPanel.tsx` — a portalled
shell that owns the float position (`useFloatingPosition`, which
measures the trigger and flips the panel above it when there isn't room
below), Escape dismissal (`useEscapeKey`, capture-phase so a dropdown
inside the settings `Modal` swallows the key before the dialog does),
and outside-click dismissal (`DismissBackdrop`, an invisible
full-viewport catcher that also swallows the trailing tap events iOS
would otherwise use to focus whatever sat under the dismissing tap).
These are pared-down ports of the budget project's equivalents — no
swipeable-row coordinator, and no inline body-scroll lock since the only
caller opens inside the already-locked settings `Modal`.

### Pull-to-refresh indicator

`src/ui/PullToRefreshIndicator.tsx` — the slide-down pill pinned to the
top of the viewport that surfaces the pull-to-refresh gesture. It
translates down with the pull and shows three states (pull / release /
refreshing), driven by the `state` and `pullDistance` from
`usePullToRefresh`. The gesture itself re-reads the active backend (see
Reload), the honest "pick up another device's edit" pull for the cloud
backends.

### Update toast

`src/ui/UpdateToast.tsx` — the soft "new build ready, click to reload"
prompt pinned above the safe-area inset, just under the general toast
stack. Shows the incoming version when known, a Reload button (posts
`SKIP_WAITING` to the waiting service worker), and a Dismiss button.
Mounted by `LanguageRoot`; the service-worker registration and update
polling live in `usePwaUpdate`.

### Toast

`src/ui/toast/Toast.tsx` (`ToastProvider`) plus
`src/ui/toast/useToast.ts` (`useToast`, `ToastContext`) — the
general-purpose notification stack pinned bottom-right. Variants
(`info` / `success` / `warning` / `error`) carry a coloured left
stripe keyed to the theme tokens; the visible stack is capped at three.
`useToast().push()` adds one, `dismiss()` removes it. Mounted globally
by `LanguageRoot` so any component can raise a toast. The General-tab
**Disable toasts** setting (`disableToasts`) gates the whole stack:
`push` reads the live setting and drops the toast (returning the
sentinel id `0`) when it's on. The "new build ready" upgrade hint is a
separate surface (`UpdateToast`) and is never suppressed by it.

### Action confirmation toast

The toast stack doubles as the "what just happened" channel for actions
whose result the user can't immediately see — a delete, an archive, a
restore, an undo, a namespace coming or going. The checklist hooks don't
reach for `useToast` directly: App builds a `notify` sink (`Notify`,
`src/app/notify.ts`) over `push()` and threads it through `useChecklist`
into `useChecklistEdits` / `useChecklistLists`; namespace create / delete
(which live in the storage layer, off-limits to the UI) are wrapped with
their toast in App. The message text is a `toast.*` i18n key, and the
same string is recorded as the undo-timeline label so `undo` / `redo` can
announce the action they stepped past (`Undone: Deleted "milk"`).
Immediately-visible edits (add, toggle, reorder, rename) record a label
for the timeline but raise no toast. The default `notify` is a no-op, so
the hooks stay testable without a `ToastProvider`.

## Checklist model and operations

### Snapshot

`Snapshot` (`src/domain/types.ts`) — the full persisted document: a
`templates[]` array and a `checklists[]` array. `emptySnapshot()` mints
the empty one. This is the unit every storage backend serialises (see
Serialize / parse). The UI works against one **active** checklist at a
time, chosen from `checklists[]` by the switcher (see Checklist switcher
/ multiple checklists); the template surfaces are still on the roadmap.

### Checklist

`Checklist` (`src/domain/types.ts`) — one checkable list instance:
`id`, a `templateId` (empty string for an ad-hoc list not stamped from
a template), `name`, `items[]`, and timestamps. Pure operations over it
live in `src/domain/checklists.ts`.

### Checklist item

`ChecklistItem` (`src/domain/types.ts`) — a checkable line: the base
`Item` fields (`id`, `title`, optional `notes` / `required`) plus
`checked` and an optional `archived` flag. Archived items stay in the
document but drop out of the active view (see Archive view).

### Active checklist / active list

The checklist the UI currently renders — `activeList`, resolved by
`useChecklistLists` (`use-checklist-lists.ts`) from a device-local,
in-memory `activeChecklistId`. The hook falls back to the first list
(`doc.checklists[0]`) whenever the selection points at no surviving list
— e.g. after a reload or a backend swap brought in a different document —
so a stale selection never blanks the screen. The edit verbs
(`use-checklist-edits.ts`) mutate this list by id, and the views read its
items. `withActiveList` (in `use-checklist-sync.ts`) guarantees the
document always has at least one list to show, minting a default
`"Checklist"` list (via `createChecklist`) that isn't persisted until the
first real edit, so a bare reload never writes an empty document.

### Checklist switcher / multiple checklists

`useChecklistLists` (`src/app/use-checklist-lists.ts`) owns the
document's `checklists[]` collection and the active selection — the
concern-scoped sibling of the item-level edit verbs. It exposes the
selection (`activeList`, `activeChecklistId`), a `checklists` summary
list (`{ id, name }` in document order, for the side-menu switcher), and
three verbs, each of which folds the change into the document, persists
it, and records it on the undo timeline:

- `selectChecklist(id)` — flip the in-memory active selection.
- `addChecklist()` — append a fresh, default-named list and switch to
  it. The name comes from `nextChecklistName` (`src/domain/checklists.ts`):
  `"Checklist"` if free, otherwise `"Checklist 2"`, `"Checklist 3"`, … —
  the lowest unused suffix.
- `renameChecklist(id, name)` — rename a list via the domain
  `renameChecklist` (a blank name is ignored).
- `removeChecklist(id)` — drop a list from `checklists[]`. A no-op for the
  last remaining list (the document must always carry one — `activeList`
  falls back to `checklists[0]`); removing the selected list re-points the
  selection at the first survivor. Like the other verbs it records on the
  undo timeline, so a removed list is recoverable.

The side menu (`src/ui/SideMenu.tsx`) renders the switcher: a
"Checklists" section listing every list by name (the active one marked,
a check glyph standing in for its icon), each row switching the active
list and navigating to the checklist view, with the section heading's
trailing "+" creating a new list. The header **Checklist title** is the
rename surface for the active list.

### use-checklist hook

`src/app/use-checklist.ts` (`useChecklist`) — the one place that wires
the pure domain operations to a concrete `StorageAdapter` and supplies
the side effects the domain deliberately avoids (id generation via
`crypto.randomUUID`, the clock). It is a thin composer of three
concern-scoped pieces and owns only the selectors over the active list
and the memoized `UseChecklist` surface the views consume:

- **Edit verbs** (`use-checklist-edits.ts`, `useChecklistEdits`). Each
  mutation (`addItem`, `toggle`, `remove`, `archive`, `unarchive`,
  `reorder`) applies the matching domain function, updates React state
  for an immediate re-render, records the post-edit document on the undo
  timeline (`commit` → `record`), and schedules a debounced save.
- **Persistence engine** (`use-checklist-sync.ts`, `useChecklistSync`).
  Owns the document state, the save state machine (`SaveStatus`,
  `dirty`), the debounced-save plumbing (`scheduleSave` / `flushSave` /
  `performSave`, coalescing a burst into one write per `saveDebounceMs`),
  conflict detection (`ConflictState`), and `reload` / `saveNow` /
  `resolveConflict`.
- **Undo timeline** (`use-undo-redo.ts`). The composer breaks the
  construction cycle between the timeline and the sync engine with a
  `resetHistory` ref: the engine resets the timeline whenever the
  document arrives from outside the edit path (load, reload,
  conflict-adopt), but the timeline is built after the engine because
  applying an undone snapshot needs the engine's `setDoc` /
  `scheduleSave`.

### Add item

`addItem` in `src/domain/checklists.ts` — returns a new checklist with
a fresh unchecked item appended (bottom, default) or prepended (top),
per the `position` argument the hook feeds from `addItemPosition`. The
hook trims the title and ignores an empty one.

### Import items / paste a checklist

`importItems` (the edit verb in `src/app/use-checklist-edits.ts`) parses
pasted markdown with `parseItemsFromMarkdown`
(`src/storage/markdown/codec.ts`) and appends the result to the active
list with `addItems` (`src/domain/checklists.ts`), preserving each item's
checked state, `required` flag, and notes. Existing items are kept — an
import adds to the list, never replaces it. It returns the number of
items added (zero when the text held no list lines), which the composer
uses to tell a checklist paste from ordinary text. Reached from the
[Add-item form](#add-item-form) by pasting; see also [Copy
checklist](#copy-checklist) for the inverse.

### Toggle item

`toggleItem` (`src/domain/checklists.ts`) — flips a single item's
`checked` flag. Surfaced by tapping the row's checkbox.

### Delete item

`deleteItem` (`src/domain/checklists.ts`) — permanently drops the item
from the list. Reached by swiping a row left (or Delete in the archive
view). Recoverable only via undo, which resurrects it from the prior
whole-document snapshot.

### Archive / unarchive item

`setArchived` (`src/domain/checklists.ts`) — flips an item's `archived`
flag without destroying it. `activeItems` / `archivedItems` partition a
single list into the checklist view and the archive view;
`archivedByChecklist` rolls the archived items up across the whole
snapshot into per-list groups for the archive view. Swiping a row right
archives; Restore in the archive view unarchives. Because the archive
spans every list, the restore / delete verbs (`useChecklistEdits`)
resolve the owning checklist from the document rather than the active
list.

### Reorder item

`moveItem` (`src/domain/checklists.ts`) — moves an active item to a new
index **among the visible items**, keeping archived items pinned to
their absolute slots. `toIndex` is clamped and a no-op move returns the
same checklist untouched (no `updatedAt` bump, so it never writes). The
gesture is `useListReorder`; the commit happens once on drop.

### Progress / completion

`progress` and `isComplete` (`src/domain/checklists.ts`) — `progress`
returns checked/total over the visible items (the header count is the
hook's own `checkedCount`); `isComplete` is true when every `required`
item is checked. Required-item gating has no UI surface yet.

## Templates

### Template

`Template` (`src/domain/types.ts`) — a reusable, named list of `Item`s
with a stable `id` and timestamps. Pure operations live in
`src/domain/templates.ts` (`createTemplate`, `renameTemplate`,
`addItem`, `removeItem`). The data model and domain layer are in place;
there is **no template UI yet** — templates appear only in the dev seed
and in shareable/example JSON. New template surfaces go in `src/ui/`.

### Instantiate a template

`instantiate` (`src/domain/checklists.ts`) — stamps an independent,
all-unchecked `Checklist` out of a template, copying its items and
recording the source `templateId`. The "stamp out a checklist from a
template" verb; UI on the roadmap.

## Sharing

### Share link / shareable URL

`src/share/index.ts` — encode/decode a single `Checklist` into a
URL-fragment payload: JSON → gzip (`CompressionStream`) → base64url,
placed only after `#` so it is never sent to a server.
`encodeChecklist` produces the fragment string; `decodeChecklist`
parses one back (with or without a leading `#`). The data model is in
place; the share / import UI is on the roadmap.

### Example template

`examples/<slug>.json` — sample template JSON a user can import.
Referenced from the README; the in-app import surface is on the
roadmap.

## Settings and appearance

### Settings dialog

`src/ui/settings/SettingsModal.tsx` — the tabbed settings dialog opened
from the header menu (or the sync glyph, which deep-links to the Storage
tab via `initialTab`). Tabs (`TabId`): General, Lists, Theme (appearance),
Storage, and — only when dev mode is on — Developer and Logs. Tab
labels come from i18n. Built on `Modal`.

### Settings store

`src/settings/store.ts` + `src/settings/useSettings.ts` — the persisted
appearance `Settings` (theme preset, font family, font scale, the
custom-theme overrides, `addItemPosition`, `menuButtonPosition`,
`showMenuButton`, `disableToasts`), kept in `localStorage` under `checklist:settings:v1`. `useSettings` is
apply-immediately: every `update(key, value)` writes through and
re-renders so the theme engine previews the change at once. `store.ts`
is defensive on read — a missing or corrupt field falls back to its
default rather than throwing. Note the `Settings` type deliberately
excludes the device-local dev flags (those live under `src/dev/`).
`useSettings` takes an optional **root settings store** (below): when one
is supplied (a file-based backend is active) it reconciles against the
backend's `settings.json` on mount — adopting it when present, else seeding
it from this device — and writes through on every `update`. `localStorage`
remains the synchronous first-paint cache so the theme never flashes.

### Root settings file

`src/storage/settings-store.ts` — the `SettingsStore` seam that persists
the app `Settings` as a single `settings.json` (`SETTINGS_FILE_NAME`) at the
**app-folder root**, the scoped folder a backend owns (Dropbox's `Apps/`
folder, Drive's `checklist/`, the picked local directory) — *above* the
per-namespace folders, so one settings file is shared by every namespace and
travels with the synced/shared folder. `fileSettingsStore` builds one over
any root-scoped `FileStore` (a backend's file store constructed with an empty
namespace, so its paths resolve at the app-folder root instead of inside a
namespace folder — the folder / Dropbox / Drive stores drop the blank
namespace segment). Each file-based backend exports a `create*SettingsStore`
(`createFolderSettingsStore`, `createDropboxSettingsStore`,
`createGdriveSettingsStore`); `useStorageBackend` builds the active backend's
store and exposes it as `settingsStore` (null for the browser backend, whose
canonical settings home is `localStorage`, and while a folder grant is
unresolved). It is independent of the namespace-scoped document adapter and
of encryption: settings are app-wide and stay **plaintext JSON even when the
document is encrypted**. `App` wires `useStorageBackend` before `useSettings`
and threads `storage.settingsStore` into it.

### General tab

`src/ui/settings/tabs/general.tsx` — the dev-mode toggle (which reveals
the Developer and Logs tabs), the "Disable toasts" toggle that drives
`disableToasts` (suppressing the general toast stack but not the upgrade
hint), and, **only in the installed PWA on a phone / tablet**
(`useStandaloneMobile`), the "Show menu button" toggle that drives
`showMenuButton`. List-behaviour preferences moved out to the Lists tab.

### Lists tab

`src/ui/settings/tabs/lists.tsx` — list-behaviour preferences, currently
the "add new items at top / bottom" choice that drives `addItemPosition`
(moved here from the General tab).

### Appearance / theme tab

`src/ui/settings/tabs/appearance.tsx` — the theme picker (light/dark
mode + variant), font family, text size, and — when the Custom theme is
selected — the per-colour overrides and the shape/motion controls
(corner radius, density, border width, reduce-motion). The **density**
control writes the `--density-row-px` / `--density-row-py` CSS variables
(see Theme engine) that the checklist rows and the side-menu items read
for their padding, so it now actually changes row spacing when a Custom
theme is active.

### Theme engine

`src/theme/themes.ts` (the data: `ThemePreset` — the eleven presets
plus `system` and `custom`, `FontFamilyId`, `CustomTheme`,
`FONT_SCALE_PRESETS`, the palettes and lookup tables),
`src/theme/useTheme.ts` (the engine that projects `Settings` onto
`<html>` — `data-theme`, the font CSS var, the font-scale multiplier,
and the inline custom-theme overrides), and `src/theme/fonts.ts`
(on-demand webfont loading; the default `mono` is statically bundled,
the others lazy-load). CSS tokens live in `src/styles/theme.css` and
`src/styles/palettes.css`.

## Achievements

Every user-facing feature is also an unlockable **achievement**, ported
from the budget project and scaled to the checklist. Achievements are
sorted into four **tiers** that mirror how far the user has grown into
the app — **Beginner → Intermediate → Pro → Expert** — worth 10 / 25 /
50 / 100 points respectively (`TIER_POINTS`). The full catalog is
`ACHIEVEMENTS` in `src/achievements/catalog.ts`; each entry carries a
stable write-once `id`, its `tier`, an inline-SVG `glyph` (from
`src/achievements/glyphs.tsx` — the app ships no `lucide-react`), an
optional `hasLearnMore` flag, and an unlock `trigger`. Display strings
(`name` / `condition` / optional `learnMore`) live under
`achievements.catalog.<id>` in both `src/i18n/locales/en/achievements.ts`
and `src/i18n/locales/sv/achievements.ts`.

A trigger is either **`derived`** — a predicate over `(prev, next)` of
the combined `{ snapshot, settings }` `AchState` that flips false→true,
used whenever the feature mutates the persisted document or the synced
settings (first item, first checked item, theme change, reduced motion,
…) — or **`manual`**, fired by a `unlock("<id>")` call at the chokepoint
that observes the gesture (cloud connect, clipboard copy, undo, install,
language switch, developer mode). `useAchievementWatcher`
(`src/achievements/useAchievementWatcher.ts`), mounted once in `App`,
runs the derived pass (`deriveUnlocks`, `src/achievements/derive.ts`) on
every transition and drains the in-memory manual-unlock bus
(`src/achievements/bus.ts`). It is gated on the sync engine's `loaded`
flag so loading a saved document never backfills unlocks — only deltas
the user actively produces count.

Earned progress is the `achievements` map (id → unlock timestamp) and the
`unseenAchievements` queue on the synced `Settings`
(`src/settings/types.ts`), recorded via `unlockAchievements` and cleared
via `clearUnseenAchievements` (`src/settings/useSettings.ts`); because it
rides in `Settings`, progress travels with `settings.json` across
devices. A fresh unlock raises a celebratory toast and increments the
header **trophy button** (`TrophyButton`, beside the copy / sync glyphs),
which reads the unseen count from `AchievementsContext`. Clicking the
trophy — or the "Achievements" entry in the side menu — opens the
**achievements modal** (`AchievementsModal`, via the
`{ kind: "achievements" }` modal-bus command and `AchievementsModalHost`),
a four-tier guided tour of the whole catalog; opening it clears the
unseen queue so the badge empties. Add or retire an achievement with the
`update-achievements` skill.

## Storage and sync

### Storage adapter

`StorageAdapter` (`src/storage/adapter.ts`) — the backend contract the
app talks to instead of touching `localStorage` directly. Adapters
speak bytes, not domain values (`load` / `save` / optional `loadSync`,
`getRevision`, `watch`), advertise an `AdapterCapability` set so UI
gates on capability rather than `adapter.foo !== undefined`, and carry
a `saveDebounceMs`. The error types `ConflictError`, `AuthError`, and
`RateLimitError` are defined here. New backends fill in the same
interface.

### useStorageBackend hook

`src/storage/useStorageBackend.ts` — the top-level storage wiring:
picks the active adapter from the saved preference, manages cloud OAuth
tokens, completes an OAuth redirect on load, and layers optional
at-rest encryption (`withEncryption`). Returns the active backend id /
adapter, per-provider connection status, the encryption mode, the
`locked` flag (and `unlock`), and methods to switch backend, connect /
disconnect a provider, and enable / disable encryption. It also owns the
active namespace: the inner adapter is built scoped to it, so switching
namespace swaps which document the app reads/writes, and it exposes the
namespace list plus `switchNamespace` / `createNamespace` /
`renameNamespace` / `removeNamespace`. The session passphrase is held in
memory only — never persisted, lost on reload.

### Namespaces

`src/storage/namespaces.ts` — the per-device registry of **namespaces**:
named buckets that each hold their own checklist document. The registry
(the list and the active slug) lives in `localStorage`, like the backend
preference, because the namespaces a person sees are a property of their
install, not of any one document. Every namespace has a `slug` (fixed at
creation, folder-/key-safe) and an editable display `name`; rename only
changes the name so data never has to move. The `default` namespace
always exists and can't be removed. `namespaceLocalKey` /
`namespaceCloudFolder` map a slug onto a concrete location: the default
namespace keeps the legacy `checklist:v1` key locally, every namespace
gets its own folder in the cloud (so a folder can be shared wholesale —
the `family/` folder shared with relatives). The management UI is
`NamespacesModal` (`src/ui/NamespacesModal.tsx`), reached from the cogwheel
on the namespace section header at the top of the side menu — one button
that opens the combined manage-and-create dialog (which is why it's a cog,
not a `+`).

A namespace can also carry an **appearance**: an optional `glyph` (an icon
name from `src/ui/glyphs.ts`) and an optional `color` (a CSS colour). The
colour and icon can be picked **up front** in the dialog's create form (the
pickers below the name field, passed to `createNamespace` so the namespace
lands already badged) or changed later through the picker in each row's edit
form (`setNamespaceAppearance` — applied live, not gated behind the name's
Save, so the side menu and favicon update immediately). Both fields are
optional and independent: a
colour with no glyph still tints the default folder icon. The appearance
fields are typed as bare strings in the storage layer (which mustn't
import from `ui/`); the picker validates the glyph against the known set
on the way in, and `isNamespace` rejects a present-but-non-string value so
a corrupt store can't smuggle one through. Setting appearance on the
`default` namespace materialises it into the stored list (it's otherwise
synthesised), so the customisation persists.

### Namespace glyph and favicon

The glyph catalogue lives in `src/ui/glyphs.ts`: each glyph is the inner
SVG markup of a 24×24 lucide-weight outline, so one source feeds both the
`NamespaceGlyph` component (`src/ui/NamespaceGlyph.tsx`, which wraps it in
a styled `<svg>` painting with `currentColor`) and the favicon builder
(`namespaceGlyphDataUri`, which renders the app's dark rounded-square badge
with the glyph stroked in the chosen colour and serialises it to a data
URI). The pickers are `ColorPalette` (`src/ui/ColorPalette.tsx`, palette in
`src/ui/namespace-colors.ts`) and `GlyphGrid` (`src/ui/GlyphGrid.tsx`,
whose leading cell is the default **folder** glyph — picking it is "no
custom icon", drawn as the folder, so the folder is omitted from the rest
of the grid to avoid a duplicate).

In the **side menu** a customised namespace renders its own glyph tinted to
its accent — only the glyph is coloured, never the row text — while an
untouched one keeps the plain check (active) / folder (inactive) icon. When
the active namespace has a glyph, that glyph (in its colour) **replaces the
app logo**: `namespace-favicon.ts` resolves the logo `src`
(`namespaceLogoSrc`) for both the header wordmark slot (threaded through
`ChecklistContext` as `logoSrc`, read by `ChecklistView`) and the
browser-tab favicon (`applyFaviconHref`, run from an effect in `App`). A
namespace with only a colour keeps the bundled mark — the favicon is
replaced only when a glyph is picked.

### Storage tab

`src/ui/settings/tabs/storage.tsx` — the UI for picking the backend
(This device / Dropbox / Google Drive), connecting / disconnecting a
cloud provider, and turning on at-rest encryption with a passphrase
(with the too-short / mismatch validation). Deep-linked from the sync
glyph.

### Local backend / This device

`src/storage/local/index.ts` (`BrowserLocalStorageAdapter`) — the
default backend, persisting the document to `localStorage`. The default
namespace keeps the historical key `checklist:v1`; other namespaces are
keyed `checklist:v1:<slug>` (there are no folders locally, so namespacing
is just a key change — `deleteLocalNamespace` removes one). It implements
the synchronous `loadSync` fast path (so the first paint shows stored
data, no empty-list flash) and saves immediately (`saveDebounceMs` 0).
The underlying `Storage` is injectable so tests pass an in-memory stub.

### Local folder backend

`src/storage/folder/index.ts` (`createFolderAdapter`) — a file-based
backend over the **File System Access API**: the user picks a directory
and each checklist and template is saved there as its own markdown file,
so the lists are browsable, git-trackable, and editable by any other
tool. The picked directory handle is persisted in IndexedDB
(`src/storage/folder/handle-store.ts`) so the OS-level grant survives
reloads, gated by a fresh `queryPermission` on boot; a revoked grant
surfaces a Reconnect cue and falls back to the browser store so editing
keeps working. Namespaces are subfolders of the picked directory
(`<picked>/<namespace>/…`). The backend is only offered in browsers that
expose `showDirectoryPicker` (`isFolderBackendAvailable`, Chromium-only
today). The adapter is built on the shared **markdown file store** below;
per-file `lastModified` timestamps drive conflict detection. The hook's
`connectFolder` / `reconnectFolder` / `disconnectFolder` own the
lifecycle (pick + seed, re-grant, mirror-back-to-browser).

### Markdown file store

`src/storage/directory-adapter.ts` (`createDirectoryAdapter`) is the
shared engine the three file-based backends (local folder, Dropbox,
Google Drive) run on. It wraps a small `FileStore`
(`src/storage/file-store.ts` — `list` / `read` / `write` / `remove` over
relative paths) into a full `StorageAdapter`, so the markdown
representation, the conflict logic, and the encrypted/legacy fallback are
written once. The codec (`src/storage/markdown/codec.ts`) turns a
`Snapshot` into one file per entry (`checklists/<stem>.md`,
`templates/<stem>.md`) using standard `- [ ]` / `- [x]` task syntax with
YAML frontmatter for ids and timestamps, and back again (item ids are
regenerated deterministically, so loads are idempotent). On `save` it
writes changed files, deletes removed ones, and computes an aggregate
revision from the directory's per-file revisions to detect drift
(`ConflictError`). An **encrypted** store can't be expressed as markdown,
so it lands whole in a single `checklist.json` envelope — which is also
where the pre-markdown legacy cloud document is read from and migrated to
markdown on the next plaintext save.

### Dropbox backend

`src/storage/dropbox/index.ts` — the Dropbox adapter, talking to the v2
HTTP API directly. It implements a `FileStore` (`list_folder`, download,
upload, `delete_v2`) over `/<namespace>/` inside the app's scoped folder
and hands it to the markdown file store, so each list is a markdown file
under `/<namespace>/checklists/` (`deleteDropboxNamespace` removes the
whole folder). Uses PKCE OAuth with refresh tokens and a silent
access-token refresh on 401 (then `AuthError`); a 429 surfaces as
`RateLimitError`. `isDropboxConfigured()` gates the connect button on the
build-time app key.

### Google Drive backend

`src/storage/gdrive/index.ts` — the Google Drive adapter, using the
Drive v3 REST API with the GIS token client (popup flow, no client
secret, `drive.file` scope, so it only sees files it created). It
implements a `FileStore` over `checklist/<namespace>/` — resolving and
caching the nested folder ids Drive needs — and hands it to the markdown
file store, so each list is a markdown file under
`checklist/<namespace>/checklists/` (`deleteGdriveNamespace` removes the
folder). The GIS script is lazy-loaded only when the user connects.
`isGdriveConfigured()` gates the connect button.

### iCloud backend (iOS)

`native/src/storage/icloudStorageAdapter.ts` — the React Native app's
iOS-only backend, storing the document in Apple's iCloud key-value store
(`NSUbiquitousKeyValueStore`, via `react-native-icloudstore`) under the same
per-namespace key the on-device backend uses. It implements the shared
`StorageAdapter` contract (so `useChecklist` drives it unchanged) and is the
one backend in the native app that advertises the `watch` capability: iCloud's
`onStoreDidChange` event fires when another device pushes an edit, the adapter
re-reads its key, and `App.tsx` calls `reload()` so the change appears live.

It is **only exposed on iOS**. `native/src/storage/backends.ts` is the single
platform gate — `availableBackends()` lists the on-device backend everywhere
and appends iCloud only when `Platform.OS === "ios"`, requiring the iCloud
adapter module (and its native dependency) lazily so it never loads on
Android/web. The choice is persisted per device in AsyncStorage
(`native/src/storage/backendPreference.ts`) and surfaced as a **Storage**
picker in the list-switcher sheet (`native/src/components/ListSwitcher.tsx`),
which renders only when more than one backend is available — i.e. only on iOS.
iCloud key-value sync needs the
`com.apple.developer.ubiquity-kvstore-identifier` entitlement (`app.json`) and
a native build; it is inert in Expo Go.

### At-rest encryption / unlock

`src/storage/encrypting/index.ts` (`withEncryption`) wraps any adapter
with password-based AES-GCM at the byte boundary (dropping `loadSync`,
since decrypt is async); the password is held by reference so it can be
changed at runtime. `src/storage/crypto.ts` is the pure envelope:
PBKDF2-SHA256 (600k iters) → AES-GCM-256, fresh salt + IV per write,
with a JSON discriminator (`isEncryptedEnvelope`) so encrypted and
plaintext documents share one storage slot. When encryption is on but
no passphrase is held (fresh load / reload), `UnlockGate`
(`src/ui/UnlockGate.tsx`) is the full-screen gate that blocks the app
until the user supplies the passphrase.

### OAuth (PKCE)

`src/storage/oauth-pkce.ts` — the shared, stateless OAuth 2.0 PKCE
helpers (verifier / challenge generation, flow tracking via
`sessionStorage`, provider routing, code → token exchange, refresh)
used by both cloud adapters.

### Serialize / parse

`src/storage/serialize.ts` — the seam where an adapter's opaque bytes
become a domain `Snapshot` and back. `serialize` writes canonical text
(JSON with a top-level `version` + trailing newline); `parse` runs the
migration chain and falls back to `emptySnapshot()` on corrupt /
absent / version-mismatched bytes, so a bad document never crashes the
app.

### Migrations

`src/storage/migrations.ts` — the forward-only migration chain that
upgrades a parsed raw document to `LATEST_VERSION` (currently 1).
`migrate` treats a missing `version` as v0 and runs the v0→v1 bootstrap
(guaranteeing both top-level arrays exist); a future version throws.

### Sync status / save state

The `SaveStatus` union (`idle` / `saving` / `saved` / `error` /
`conflict` / `auth-error` / `throttled`) from `use-checklist-sync.ts`
(re-exported via `use-checklist.ts`) drives the `SyncStatus` glyph.
`dirty` tracks unsaved edits; `saveNow` flushes the debounced save
immediately.

Saves are **serialized**: at most one write is in flight against the
backend at a time. An edit that arrives while a save is in flight
doesn't start its own write — it queues in `pendingDoc`, and because
every save serialises the *whole* document, the newest queued snapshot
covers every one before it, so the in-flight save drains the queue in a
single follow-up write (based on the revision it just learned) when it
returns. Without this a second save would base on a revision the first
is about to bump and the backend would reject it as a `ConflictError` —
the device colliding with its *own* just-completed write on a slow link.
A `saveGeneration` counter, bumped whenever the document is replaced
wholesale (backend swap, reload, conflict-adopt), lets a save that
resolves against a vanished baseline drop its result instead of writing
it back.

### Reload / pull-to-refresh

`useChecklist.reload` re-reads the active backend and replaces what's on
screen, resetting the undo history to the freshly-loaded baseline. It's
a near-no-op round trip for the local backend but the real "pick up
another device's edit" pull for the cloud backends. The gesture is
`usePullToRefresh` (touch-only, suppressed while a modal owns the
screen); the visual is `PullToRefreshIndicator`.

### Conflict resolution

A conflict here means a genuine **cross-device** divergence — another
device pushed a newer revision between this device's last load and its
save. (A device can no longer conflict with itself: saves are serialized
so a mid-flight edit queues rather than racing the in-flight write — see
"Sync status / save state".) When a save loses that race, the adapter
throws `ConflictError` and the hook turns it into a `ConflictState`.
`ConflictResolutionModal` (`src/ui/ConflictResolutionModal.tsx`) is the
non-dismissable prompt: it summarises the local and remote documents
side by side and makes the user pick. "Keep mine" re-saves this
device's bytes based on the remote revision; "Keep theirs" adopts the
remote bytes as the new baseline (no write-back, so it doesn't bounce
the conflict). Resolved via `useChecklist.resolveConflict`.

## Undo / redo

### Undo / redo

`src/app/use-undo-redo.ts` (`useUndoRedo`) — an in-memory timeline of
**whole-document snapshots** (capped at 50 past entries). Each entry
(`HistoryEntry`) pairs the post-edit snapshot with a short **action
label** — the "actions history" — so the timeline knows not just what
the document looked like but what the edit *was*. `use-checklist` calls
`record(snapshot, label)` after every edit; `undo` / `redo` walk the
cursor, apply the target snapshot via `setData` (which both swaps the
visible document and persists it, so a revert survives a reload), and
**return the label** of the action they stepped past. `use-checklist`
turns that into an action-confirmation toast (`Undone: Deleted "milk"`)
since the document otherwise swaps silently. `reset` clears the history
whenever a document arrives from outside the edit path (initial load,
backend swap, conflict resolution) so undo can't jump to a vanished
state. Recording the whole document (not a diff) is what lets undo
resurrect a deleted item. Reachable from the side menu and via
`useUndoRedoShortcuts` (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z / Ctrl+Y), which
bails out when focus is in an editable field so native field-level undo
still works.

## Dev mode

### Dev mode / fake data

`src/dev/useDevMode.ts` (`useDevMode`) holds two device-local flags —
`devMode` (whether the Developer / Logs settings tabs show) and
`captureLogs` — at module scope with a pub/sub layer and cross-tab
sync; turning dev mode off forces capture off. `src/dev/useDevSeed.ts`
(`useDevSeed`) backs the "Fake data" toggle as in-memory-only state (no
localStorage write), so a reload always drops back to the real backend.
When it's on, `App` swaps in an ephemeral seed adapter
(`createDevSeedAdapter`, `src/storage/dev-seed/index.ts`) preloaded by
`buildSeedSnapshot` (`src/dev/seed.ts`) — two sample templates and one
sample checklist — so `useChecklist` reloads sample data without
touching real data. Toggles live in the Developer settings tab.

### Logger / log capture

`src/dev/logger.ts` — the in-app logger: a bounded ring buffer (500
entries) with no console sink. `createLogger(scope)` returns an
`info` / `warn` / `error` logger; when "Capture logs" is on the buffer
mirrors to localStorage so it survives a reload. The Logs settings tab
(`src/ui/settings/tabs/logs.tsx`) renders it with a level filter and
copy / clear actions.

## i18n

### Translations / language

`src/i18n/index.ts` — the tiny custom i18n runtime: English is bundled
as default + fallback, other languages code-split and load on demand
(`ensureCatalog`), and lookups stay synchronous by falling back to
English. `useT()` returns the typed translation function (with `{name}`
interpolation over `MessageKey`); `tFor()` is the non-React lookup.
`src/i18n/locale.ts` defines the supported langs (`Lang` = `en | sv`)
and initial-language detection; `src/i18n/language-preference.ts`
mirrors the choice to localStorage (and broadcasts `LANGUAGE_EVENT`) so
the shell renders in the right language from first paint;
`src/i18n/LanguageRoot.tsx` is the top-level wrapper that provides the
language, mounts the toast provider + update toast, and gates the first
paint until the initial catalog loads. Catalog namespaces live under
`src/i18n/locales/<lang>/` (app, changelog, common, menu, nav, pwa,
settings, sync, toast).

## PWA

### Service worker / app update

`src/pwa/usePwaUpdate.ts` (`usePwaUpdate`) — the single source of truth
for the PWA update lifecycle, shared by `UpdateToast` and the header
wordmark fill. Registers the service worker via `workbox-window`, tracks
download progress by polling the precache against the manifest total
(0..100), and exposes `needRefresh`, the `incomingVersion`, `reload`
(posts `SKIP_WAITING`), and `dismiss`. The manifest and icons are
configured in `vite.config.ts` (see the `tune-pwa-icons` skill).

### Standalone-mobile detection

`src/pwa/standalone.ts` — `isStandaloneMobile()` (and the
`useStandaloneMobile()` hook that reads it once into state) is true only
when the app runs as an installed PWA (standalone display mode, or iOS's
`navigator.standalone`) on Android or iOS. It's what gates the
"Show menu button" opt-out and the edge-swipe gesture to that one
context where the replacement gesture has a free screen edge.

### Changelog / what's new

`src/ui/changelog/ChangelogModal.tsx` — the "What's new" dialog reached
from the header menu, listing every shipped release newest-first
(version, date, the Added/Changed/Fixed/… sections). The data is the
repo's `CHANGELOG.md`, inlined by Vite as a raw string
(`src/ui/changelog/data.ts`) and parsed by the pure, DOM-free
Keep-a-Changelog parser `parseChangelog` (`src/ui/changelog/parse.ts`).

### Privacy page

`src/ui/PrivacyPage.tsx` — the standalone privacy policy served at
`/privacy`, stating the app is local-only with no backend, accounts,
analytics, or tracking. Deliberately short and English-only (a legal
page, not chrome).

## Workflows / verbs the user might say

### Add an item

Tap the floating `AddItemButton`, type into the inline `AddItemForm`
composer that opens, and press Enter (or tap away to commit). Lands at
the top or bottom per `addItemPosition`; an empty draft is discarded.

### Check / uncheck an item

Tap the row's checkbox (`toggleItem`). The title strikes through and the
header count updates.

### Delete an item

Swipe a `ChecklistRow` left to latch open Delete, then tap it
(`deleteItem`), or use Delete in the archive view. Recoverable via undo.

### Archive an item

Swipe a `ChecklistRow` right (`setArchived(…, true)`). The item leaves
the active view but stays in the document; find it in the archive view.

### Restore an item

Open the archive view (side menu) and tap Restore
(`setArchived(…, false)`).

### Reorder items

Drag a row by its grip handle (`useListReorder` → `moveItem`). Commits
once on drop.

### Remove a checklist

Open the side menu, swipe a checklist row left to uncover its trash, and
tap it (`removeChecklist`). One tap removes — it's recoverable via undo.
The last remaining list shows no trash (the views always need one).

### Remove a namespace

Open the side menu, swipe a namespace row left to uncover its trash, tap
it once to arm the confirm, then tap again to commit (`removeNamespace` via
`useStorageBackend`). The two taps guard a destructive, non-undoable delete
of the namespace's document in the active backend. The default namespace
shows no trash. The same delete also lives in the namespaces dialog.

### Undo / redo

Side-menu Undo / Redo, or Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z / Ctrl+Y.
Walks the whole-document timeline.

### Pull to refresh

Drag down from the top of the list (`usePullToRefresh` →
`useChecklist.reload`) to re-read the backend — meaningful for the cloud
backends.

### Open settings

Header burger menu → Settings, or tap the sync glyph (deep-links to the
Storage tab).

### Switch storage backend

Settings → Storage → pick This device / Dropbox / Google Drive, then
connect the cloud provider via OAuth.

### Turn on encryption

Settings → Storage → enable encryption and set a passphrase. Future
loads gate behind `UnlockGate` until the passphrase is supplied.

### Resolve a conflict

When another device saved first, `ConflictResolutionModal` makes you
choose Keep mine / Keep theirs.

### Share a list

Encode a checklist to a `#`-fragment URL (`encodeChecklist`). Data model
in place; the share UI is on the roadmap.

### Use a template

Stamp a checklist out of a reusable template (`instantiate`). Data model
in place; the template UI is on the roadmap.

## Conventions for editing this file

- One H3 per dictionary term, under the H2 that mirrors the dictionary
  section. The heading is the primary term (slash-aliases go in the
  prose); qualify a name that collides with another section's term.
- Explain current behaviour and invariants — control flow, the data it
  reads / writes, the surfaces it touches. Not changelog narration
  ("used to…", "previously…", PR numbers).
- Keep the inline `file.ts` / `symbol` references so the prose stays
  navigable; the dictionary row carries the same path as the lookup
  key.
- Every term added here gets a matching `dictionary.md` row (and vice
  versa) **in the same PR** as the code change. The two move together.
- Deep module / persisted-shape mechanics that aren't about a single
  user-facing concept belong in `docs/architecture.md`, not here.
