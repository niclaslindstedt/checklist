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
everything `SyncStatus` and the cloud-sync details modal need — backend,
namespace, provider name, save status, failure detail, dirty flag,
`onSave`, `onOpenDetails`, `onReconnect`, `onCheckConnection` — and is null
for the local backend.

### Checklist row

`src/ui/ChecklistRow.tsx` — one item line, with a three-layer
swipe-to-reveal interaction driven by `useRowSwipe`. The foreground
holds a `Checkbox`, the title (struck through when checked), a body-hint
note glyph (only on items that carry a note — muted while the body is
collapsed, accent-coloured while it's revealed), and a grip handle for
vertical reordering. Swiping **left** latches open a Delete button
(two-step, so a delete is never a single flick); swiping **right**
archives the row (hidden, not destroyed). The two action layers are
gated on the swipe direction (`swipe.offset`'s sign): the left-aligned
Archive strip is visible only while sliding right, the right-aligned
Delete button only while sliding left. That gating matters for the
archive slide-off — the foreground travels the full row width to the
right, so without it the trailing-edge Delete button would be bared as
the row clears the screen on its way to the archive.

**Editing the text — reveal, then edit.** An item with a markdown
**body** (`notes`) shows a note glyph to the right of its title (muted when
the body is hidden, accent-coloured while it's revealed). Tapping the
title (or the glyph) expands the body **rendered as markdown** (via
`renderMarkdown`, see [Markdown renderer](#markdown-renderer)); a
`pointerdown` outside the row collapses it again. While expanded, tapping
the title opens the in-place editor (`ChecklistRowEditor`, see
[Edit item](#edit-item)) on the **title**, and tapping the body opens it
on the **body** (a tap on a link inside the note follows the link
instead). An item with **no** body has nothing to reveal, so a title tap
edits straight away — where "Add a note" / Shift+Enter adds one. So a
note reads as markdown until you open it for editing, where it shows as
raw plain text. The title tap is swallowed after a swipe (the
`useRowSwipe` `onClickCapture` guard), so a drag never drops into edit.
The whole row line is the tap target, not just the title glyphs: a click
on the row that doesn't land on a real control (the checkbox, caret,
note glyph, grip, or the title button) is treated as a title tap, so the dead
space beside the text and the row's vertical padding open the editor too
instead of just blurring an open one. The row line also `preventDefault`s
its `mousedown` (the same trick the editor `Checkbox` uses): pressing a row
while another row's editor is open would otherwise blur-commit that editor,
shrink it (its affordance row disappears), and slide every row below it up —
so the trailing click would miss the row that moved and the keyboard would
drop. Holding focus until the click lands keeps the tap on target; the newly
opened editor then takes focus and the previous one commits, so editing moves
field-to-field and the keyboard never disappears.

### Edit item

`src/ui/ChecklistRowEditor.tsx` — the in-place editor a row swaps to. It
keeps the row's `Checkbox` so the line still reads as the same item (and
the whole row is tinted `bg-surface-2` to signal the active edit); an empty
disclosure-caret slot in front of the checkbox keeps the editor lined up with
every other row instead of sliding left. The checkbox stays live while
editing — its press is `preventDefault`ed (the `Checkbox` `onMouseDown` hook)
so tapping it ticks the item without blurring the title field (which would
otherwise commit and close the editor, since iOS doesn't focus the label on
tap). The title is one line (a native `<input>`), the body an optional note
beneath it (a native `<textarea>`), both plain text. The native fields mean
iOS draws its own keyboard accessory bar (previous / next / Done) above the
keyboard, and that is the only bar on screen — the app no longer draws its
own. While an editor is open the row reports its id up (`onActiveEditorChange(id,
active)`) so `ChecklistView` hides the add button (`editingId`) and it doesn't
crowd the keyboard. The report carries the row id on both open and close, and
`resolveActiveEditor` (`src/ui/activeEditor.ts`) only clears the id on a close
that matches it: when editing moves straight to another row, the incoming row
claims the id first and the outgoing row's trailing close (its field blurs only
once the new one has focus) is ignored — otherwise the add button would flash
back over the keyboard mid-switch. The editor reveals itself above the keyboard
on mount (and again
when the keyboard's appearance resizes the visual viewport), since the
visual-viewport-pinned shell stops iOS from auto-scrolling the field up. It
does this by adjusting the scroll position of the **list container alone**
(`scrollParent` walks up to the `overflow-y-auto` list), never `scrollIntoView`
— which also scrolls the window / visual viewport and so drags the pinned
header along with it, a 20-30px jump every time an editor opens. It moves the
container the minimum needed, and only when the editor is actually clipped, so
a row already on screen stays put (e.g. on a Backspace hand-off to the line
above); only one hidden behind the keyboard moves, just far enough to clear it.
The field is focused with `{ preventScroll: true }` (`focusAtEnd`) so the
**browser's own** scroll-into-view never fires either — for a field near a
clipped edge that page-level scroll jerks the whole viewport, pinned header and
all; suppressing it leaves the list-container scroll as the only reveal.
Revealing the body with "Add a note" eases it open with a short grow + fade
(`note-reveal` in `theme.css`) rather than popping in with a hard reflow.
Enter in the title commits
and immediately opens a fresh
add-item draft **directly below the row just edited**
(`onAddAfter(item.id)`, wired to the view's `startAfterDraft`): the new
item lands as that row's next sibling, at its own depth, so adding items
walks straight down from wherever you're working instead of jumping to the
top or bottom — that top/bottom landing is reserved for the floating add
button (`addItemPosition`). Each entry in that run inserts after the
previous one (the composer advances its anchor to the id `addItemAfter`
returns), so a streak of Enters stays in order. **Shift+Enter** (or the "Add a note" affordance shown when there's
no body yet) reveals and focuses the body field so a note can be added
without leaving the keyboard instead of starting a new item. ⌘/Ctrl+Enter
commits from the body (a bare Enter is a newline there); Escape cancels;
blurring the whole editor commits whatever was typed (a `done` ref guards
against a blur that trails an Escape firing a second outcome). The verb
behind it is `editItem` (`src/domain/checklists.ts` →
`use-checklist-edits.ts`): only the supplied fields are touched, the
title is trimmed (a blank title is ignored so an item always keeps a
headline), the body is trimmed and an emptied body drops the `notes` key,
and a no-op edit is dropped without writing. A title change unlocks the
**Wordsmith** achievement; adding a body unlocks **Note to Self** through
its derived predicate.

**Don't keep empty lines.** An item edited down to nothing — a blank title
and no body left — is deleted rather than committed, so a wiped-out line
never lingers: blurring such an editor (or committing it) routes through
`ChecklistRow`'s `submitEdit` to the silent `removeEmpty` verb instead of
`editItem`. **Backspace** at the start of an already-empty title (with no
body) goes further: it removes the line and reopens the line above in its
title editor with the cursor at the end (`onBackspaceEmpty` →
`ChecklistView.backspaceEmpty` → `removeEmpty` + an `autoEditTitle` handoff
to the previous row), so holding backspace walks up the list erasing lines.
The add-item composer (`AddItemForm`) backs up the same way: **Backspace** in
the still-empty draft dismisses it and reopens the line directly above where
it was spliced in (`onBackspaceEmpty` → `ChecklistView.backspaceDraft`),
covering all three composer positions — the top/bottom draft, the after-an-
item draft, and the sub-item draft. At the top line there's nothing above to
back into, so the keypress falls through and the empty line is only cleaned
up on blur. `removeEmpty`
(`use-checklist-edits.ts`) raises no toast — the row vanishes where the
cursor already is — but still records an undo step labelled
`toast.emptyItemRemoved`, so a mis-erase is recoverable.

### Markdown renderer

`src/ui/markdown/renderMarkdown.tsx` — a tiny, dependency-free renderer
that turns a markdown string into React nodes. The app inlines its icons
rather than pull in lucide, and likewise renders the small markdown
subset an item body needs itself instead of adding `marked` /
`react-markdown`. It returns React elements — never a raw HTML string fed
to `dangerouslySetInnerHTML` — so it is **XSS-safe by construction**: any
markup a user types lands as literal text, and link targets are
scheme-checked (`http(s)`, `mailto`, relative; `javascript:` / `data:`
fall back to inert text) before becoming an `href`. Supported: headings
(demoted two levels, capped at h6), unordered / ordered lists,
blockquotes, fenced code blocks, and inline bold, italic, `code`,
strikethrough, and links. It backs the expanded body in a checklist row.

### Add-item button

`src/ui/AddItemButton.tsx` — the "add item" affordance. On small
viewports it's a circular floating action button centred at the bottom
of the screen; from the `sm` breakpoint up it relaxes into a normal,
clearly-styled accent button pinned under the list. A plain tap opens the
inline composer (`AddItemForm`) rather than adding an item directly.
`ChecklistView` hides the button while the composer is open.

**Long-pressing** the button (held past ~450 ms) fans it out into a
floating row of bulk actions centred on the same spot — the (+) shrinks
and fades as the row scales in, so it reads as the button morphing into
its alternatives. On mobile the row is a single rounded bar split into two
glyph half-circles, sized to the FAB; from the `sm` breakpoint up it
relaxes to mirror the add button's desktop form — two free-standing
`rounded-md` buttons tinted in their action colour rather than a solid
pill. The row is portalled to `document.body` (to clear the
`DismissBackdrop`'s stacking context) and centred on the (+)'s *measured*
box rather than a hard-coded `left: 50%`, so it tracks the in-flow desktop
button even when the pinned sidebar offsets the content column. The row
carries two buttons: **Archive finished** and
**Delete finished**, both acting on every finished (checked, still-active)
item at once via `archiveFinished` / `deleteFinished` (see [Archive /
delete finished](#archive--delete-finished)). Both fire on the first tap;
the delete carries no confirm step, since the sweep is undoable. Running
either action, tapping outside (a
`DismissBackdrop`), or pressing Escape transitions straight back to the
(+). The bulk buttons are disabled when nothing is finished. The long-press
gesture is the only entry point, so the actions stay invisible until
deliberately summoned.

### Add-item form

`src/ui/AddItemForm.tsx` — the inline composer row opened by
`AddItemButton`. It renders where the new item will land — styled like a
real `ChecklistRow` so the spot reads as the item being created — and
grabs focus so the soft keyboard comes straight up. Its leading columns
mirror a row's: a "+" fills the caret slot and a dimmed, inert checkbox
fills the checkbox slot, so the typed text lines up exactly with the item
titles below and previews where the new item's checkbox will sit. Enter adds the item,
clears the field, and keeps focus so the user can type item after item
without re-tapping — a plain-text-editor feel. On a soft keyboard an Enter
that arrives while the IME is still composing an autocorrect suggestion is
deferred (via `onCompositionEnd`) so the add accepts the corrected word —
exactly as tapping Space would have — instead of committing the raw
keystrokes. **Shift+Enter** instead
adds the item and jumps straight into editing its body — mirroring the
in-row editor, where Shift+Enter on a title reveals the note field — so a
thought that needs more than a one-line title flows on without re-tapping
the new row; the composer hands the new item's id to its row (via
`addItem`'s return and `autoEditBody` on `ChecklistRow`), which opens its
body editor focused and ready. With item notes switched off there's no
body to edit, so Shift+Enter falls back to a plain add. Blurring commits
whatever was typed and closes; blurring an empty field just closes, so a
blank item is never created or persisted. Where the new item lands (top or
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
every `- [ ]` / `- [x]` line, checked items still checked) — **without**
the persistence frontmatter the on-disk `.md` files carry. Whether the
archived items come along under a `## Archived` section is governed by the
**Include archived in copy** setting (`includeArchivedInCopy`, off by
default — see [Include archived in copy](#include-archived-in-copy)); the
flag is passed to `checklistBodyMarkdown` as its `includeArchived`
argument, which still defaults to `true` so the on-disk `.md` file keeps
the whole archive. It raises a confirmation toast and flips to a tick for
a beat so the copy reads even with toasts disabled; a failed clipboard
write raises an error toast. The body it produces round-trips back through
the paste-import path (see [Add-item form](#add-item-form)).

### Archive view

`src/ui/ArchiveView.tsx` — the same pinned shell as the checklist view,
listing archived items from **every** active checklist
(`archivedByChecklist`), grouped under a header naming the list each item
came from; lists with nothing archived are omitted. Above the item groups
sits an **Archived lists** section (`archivedChecklists`) listing whole
checklists that have been archived as a unit (see
[Archive a checklist](#archive-a-checklist)); the header count is the
total across item groups plus archived lists. Each row offers Restore
(an item goes back into its **source** list, not the active one; a list
goes back into the switcher) and Delete (permanent). On a desktop pointer
the row actions live in the [right-click menu](#right-click-menu); on
touch they're inline buttons. Each item-group header is a disclosure
button (carrying its item count and a chevron) that collapses just that
list's items; the collapsed set is local, default-expanded view state and
doesn't travel with the document. There is no composer and no reordering —
items only ever enter the archive by being archived in the checklist
view. Reached from the side menu.

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
`styles/theme.css` — so there is no first-frame snap). **Only the
checklist list scrolls.** The drawer is a fixed-height flex column whose
namespace header, Checklists heading, action panel (the create/navigate
and Undo / Redo buttons), and footer all stay put (`shrink-0`); the
checklist region between them is the
single growing part (`flex-1 min-h-0 overflow-y-auto`), so a long list
scrolls under stationary chrome instead of pushing the footer off-screen.
The drawer opens with the **namespace** section — a **collapsible**
heading (`SectionHeader`'s `collapsible`/`expanded`/`onToggle`) that folds
the seldom-changed list away by default, showing only the active namespace
beneath it so the user keeps context; clicking the heading reveals every
namespace (the active one checked, click to switch), and its trailing
cogwheel opens `NamespacesModal`. Then the **Checklists** switcher (every
list by name, the active one marked, click to switch + navigate; each row
badged with that list's count of not-yet-completed items — active,
non-archived, still unchecked — hidden when the list is empty or fully
checked off), with the Archive view living on the action panel below rather
than in a section of its own. That action panel — the **button island** — is **one bordered block**
just above the footer's divider: a top row of New list / New folder /
Archive and a bottom row of Undo / Redo, split by a divider so the five
icon buttons read as a single coherent unit (`BarButton`s; undo/redo dim
and go inert at the ends of the timeline). It is `shrink-0` and its
bottom inset matches its left/right inset, so it sits flush as a fixed
island that the checklist list scrolls behind rather than pushing away. It highlights the
active list and current view. A shared `SectionHeader` renders each heading
with its optional action. Pinned to the foot are the relocated burger-menu
rows — an optional donate link, the trophy, an **About** dropdown, and
settings (last, under the thumb). The About row — a plain footer row with
no chevron — toggles the project links — "what's new", the source on
GitHub (with the app version as a subtitle), and privacy — in a
`FloatingPanel` that flips **upward** (there is no room below at the foot
of the drawer). The drawer's open/current/position state
comes from `useNav`
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
**default namespace** (can't be removed) and the **last remaining active
checklist** (the views always need one to show) render as plain rows.

On a **desktop pointer** the checklist rows drop the swipe gesture
entirely for the [right-click menu](#right-click-menu) instead, which
also offers **Archive** alongside Delete (see
[Archive a checklist](#archive-a-checklist)). Namespace rows keep the
swipe (a mouse drag still works).

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
edge swipe collides with the back-swipe, so the button-hiding opt-out is
offered only in the installed PWA. The standalone window has no browser
chrome, but iOS still keeps its own edge swipe-back gesture alive there —
see "Suppress edge swipe-back" for how that native navigation is cancelled
so it doesn't fight the drawer.

### Suppress edge swipe-back

`useSuppressEdgeSwipeBack` (`src/ui/hooks/useSuppressEdgeSwipeBack.ts`)
cancels the operating system's edge swipe-back / -forward navigation
inside the installed PWA. iOS keeps its left-edge "swipe to go back"
gesture alive even in a standalone home-screen app (Android's gesture nav
does the same from either border), so a rightward swipe from the screen
edge — the natural motion to pull the drawer in — would instead pop the
PWA's history and yank the app off-screen. The hook is a document-level,
touch-only listener (a sibling of `useEdgeSwipeOpen`): when a single touch
starts within ~30px of either side border and then travels more
horizontally than vertically, it calls `preventDefault()` on the move,
which suppresses the native navigation without disturbing the drawer's own
open gesture. App gates it on `isStandaloneMobile`, so a normal browser tab
— which has real chrome and history — keeps its back-swipe untouched.

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
states. Whatever the state — including mid-save — tapping it always opens
the cloud-sync details modal (`onOpenDetails`, see "Cloud sync modal"),
the command centre where Save now / Reconnect / Reload / Check connection
live. The glyph never doubles as a save button and is never disabled, so
it's one predictable way in (the old tap-to-save-when-dirty / disabled-
while-saving behaviour was the "why won't it tap?" trap). Rendered only
when a real cloud backend is active — `App` passes a non-null `SyncInfo`
only for Dropbox / Google Drive / the local folder, never for the browser
backend or while fake data overrides the adapter.

### Cloud sync modal

`src/ui/SyncDetailsModal.tsx` (hosted by
`src/app/modals/SyncDetailsModalHost.tsx`, opened by the bus command
`{ kind: "sync-details" }`) — the cloud-sync **command centre** the header
glyph always opens, the one place that answers "what is sync doing right
now". Ported from the notes project's redesigned modal (#118) over
checklist's original, it lays out, top to bottom:

- **Status** — the headline state (saving / error / throttled / offline /
  in-sync) and, when a save failed, **why**: the `error` state shows the
  failure reason captured verbatim into `statusDetail` (set in
  `use-checklist-sync.ts` from the thrown error's `message`), so a broken
  save is no longer a silent red icon. Alongside the status card sits a
  compact **Reload** glyph (`SyncInfo.onReload`, re-reads the backend
  whatever the state). Below it: a Reconnect button on `auth-error`
  (`SyncInfo.onReconnect`, re-issues OAuth for Dropbox / Google Drive), a
  Save now / Try again button, and — while `offline` — a **Check
  connection** button (`SyncInfo.onCheckConnection`, see
  [Check connection](#check-connection)) that re-probes the backend and
  shows the outcome as a live status line.
- **Details** — a two-column grid pairing the backend (cloud / folder
  glyph) with the at-rest **Encryption** state (On / Off, read off the
  provider label's `(encrypted)` suffix), then the on-disk file location.
- **Sync log** — a collapsible panel, shown **only in developer mode**,
  reading the cloud-sync scopes straight from the in-memory log ring buffer
  (`getLogs` / `subscribeToLogs`, filtered to a `SYNC_LOG_SCOPES`
  allowlist). Entries render newest-first, so the most recent round-trip
  sits at the top where a reader looks first (the Copy button still emits
  them oldest-first, the natural order to read a pasted log). The log is a
  developer diagnostic — for a regular user logging is disabled entirely
  (see [Logger / log capture](#logger--log-capture)), so the panel is
  hidden; a developer sees it whether or not capture is on (capture only
  governs persistence across reloads, not the live buffer).

An "Open in <provider>" link (omitted for the local folder, which has no
URL) closes it out; the provider path / URL are derived from
`SyncInfo.backend` + `namespace` via the backends' web-URL helpers
(`dropboxWebUrl`, `gdriveWebUrl`). Its content is short and opens no soft
keyboard, so it renders as a compact `centered` card on every viewport
rather than the full-screen mobile sheet.

### Modal

`src/ui/Modal.tsx` — the minimal accessible dialog primitive: a dimmed
backdrop, a centred card, Escape / backdrop-click to close, body-scroll
lock while open, and focus management (into the card on open, back to
the trigger on close). No portal — the app has a single root with no
competing stacking contexts. `SettingsModal`, `ChangelogModal`, and
`ConflictResolutionModal` build on it. The default shell fills the
screen on mobile and centres on desktop; pass `centered` for a compact
card on every viewport (used by `ConfirmDialog`), `size` for its
max-width, and `role="alertdialog"` for interruptive confirmations.

A modal **stack** lets dialogs nest: each open `Modal` registers itself,
and Escape only dismisses the one on top, so a `ConfirmDialog` raised
from inside another modal closes itself without also tearing down the
modal underneath. (Backdrop clicks need no equivalent guard — the
topmost backdrop covers the viewport, so a click can only reach it.)

### Confirmation dialog

`src/ui/ConfirmDialog.tsx` — the in-app replacement for the browser's
`window.confirm`: a compact centred `Modal` (`role="alertdialog"`) with
a title, an optional description, and a Confirm / Cancel pair. `tone`
`"danger"` paints the confirm button red and swaps the neutral
question-mark title glyph (`HelpCircleIcon`) for a warning triangle
(`AlertTriangleIcon`); `cancelLabel` defaults to the shared
`common.cancel` string. Confirming paints a spinner in the button (a
two-frame defer lets it show before a heavy handler such as deleting a
namespace blocks paint) and blocks further dismissal while the action is
in flight so it can't be double-fired. Dependency-free — the icons come
from the inline `icons.tsx` set rather than `lucide-react`. The first
caller is the namespace-delete affordance in `NamespacesModal`.

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

### Right-click menu

`src/ui/ContextMenu.tsx` (`ContextMenu`) with its state helper
`useContextMenu` (`src/ui/hooks/useContextMenu.ts`) — the **desktop
right-click actions menu** for list rows. It's the desktop counterpart of
the touch swipe gestures: the same archive / delete (and restore) actions
that hide behind a swipe on touch surface here on a device with a real
secondary click. Whether a surface offers it is gated by
`useDesktopPointer` (`src/ui/hooks/useMediaQuery.ts`), a thin wrapper over
`useMediaQuery("(hover: hover) and (pointer: fine)")` — true for a mouse /
trackpad, false for a coarse touch screen (a hybrid touch laptop reports
`hover` and so opts in while still supporting touch).

Unlike `FloatingPanel`, the menu anchors at the **pointer**, not a trigger
element: a row's `onContextMenu` calls `open(items, event)`, stashing the
click coordinates and the actions, and the view renders `<ContextMenu>`
while the state is set. The menu portals to `document.body`, reuses the
shared `DismissBackdrop` (outside-tap closes it) and `useEscapeKey`
(Escape closes it), and clamps itself back inside the viewport after it
measures so it never spills off a screen edge. Each row supplies its own
actions, so the same menu serves item rows (Archive / Delete), archived
item rows (Restore / Delete), archived-list rows (Restore / Delete), and
the sidebar's checklist rows (Archive / Delete) — see
[checklist row](#checklist-row), [archive view](#archive-view),
[swipe to remove](#swipe-to-remove-sidebar), and
[Archive a checklist](#archive-a-checklist).

### Pull-to-refresh indicator

`src/ui/PullToRefreshIndicator.tsx` — the slide-down pill pinned to the
top of the viewport that surfaces the pull-to-refresh gesture. It
translates down with the pull and shows three states (pull / release /
refreshing), driven by the `state` and `pullDistance` from
`usePullToRefresh`. The gesture itself re-reads the active backend (see
Reload), the honest "pick up another device's edit" pull for the cloud
backends.

### Update toast

`src/ui/UpdateToast.tsx` — the soft "Update ready" prompt pinned above
the safe-area inset, just under the general toast stack. A plain headline
sits over the truncated incoming version (shown when known); a primary
**Update** button (a `RestoreIcon` glyph, posts `SKIP_WAITING` to the
waiting service worker) carries the apply affordance, alongside a Dismiss
button. Mounted by `LanguageRoot`; the service-worker registration and
update polling live in `usePwaUpdate`. Because it renders outside App's flex
layout, on a wide screen it centres over the *content* area rather than
the whole window — App publishes the pinned sidebar's footprint as the
`--app-content-{left,right}` CSS variables (see `useSidebarInset`) and the
toast pulls its centring band in by that much.

### Toast

`src/ui/toast/Toast.tsx` (`ToastProvider`) plus
`src/ui/toast/useToast.ts` (`useToast`, `ToastContext`) — the
general-purpose notification stack pinned bottom-right. Each toast is a
single button: clicking or pressing it anywhere dismisses it
immediately, rather than waiting out its duration. A circular countdown
ring at the far left (`ToastTimerRing`, animated by the `.toast-timer-arc`
rule in `theme.css`) fills clockwise over the toast's lifetime and the
toast auto-dismisses the instant the ring closes — the same `durationMs`
drives both the CSS sweep and the dismiss timer. Variants
(`info` / `success` / `warning` / `error`) colour the ring with the theme
tokens; the visible stack is capped at three. `useToast().push()` adds
one, `dismiss()` removes it. Mounted globally by `LanguageRoot` so any
component can raise a toast. The General-tab **Disable toasts** setting
(`disableToasts`) gates the whole stack: `push` reads the live setting and
drops the toast (returning the sentinel id `0`) when it's on. The "new
build ready" upgrade hint is a separate surface (`UpdateToast`) and is
never suppressed by it.

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
`useChecklistLists` (`use-checklist-lists.ts`) from a device-local
`activeChecklistId`. That selection is mirrored to a per-namespace cursor
in localStorage (`getActiveChecklistId` / `setActiveChecklistId` in
`storage/namespaces.ts`, keyed `checklist:list:active:<slug>`) so a reload
or an app update lands back on the same list instead of snapping to the
first one; switching namespace restores that namespace's own cursor. The
hook falls back to the first list (`doc.checklists[0]`) whenever the
selection points at no surviving list — e.g. a stale cursor whose list was
archived or removed on another device, or a backend swap that brought in a
different document — so a stale selection never blanks the screen. The edit verbs
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
- `removeChecklist(id)` — drop a list from `checklists[]`. A no-op when it
  would leave no **active** list behind (the document must always carry one
  to show); removing the selected list re-points the selection at the first
  active survivor. Like the other verbs it records on the undo timeline, so
  a removed list is recoverable.

The `checklists` summary lists only the **active** (non-archived) lists, so
the switcher hides any archived as a whole (see
[Archive a checklist](#archive-a-checklist)).

The side menu (`src/ui/SideMenu.tsx`) renders the switcher: a
"Checklists" section listing every active list by name (the active one
marked by an accent-tinted highlight and left border rather than a
swapped-in check glyph), each row switching the
active list and navigating to the checklist view, with the section
heading's trailing "+" creating a new list. The header **Checklist
title** is the rename surface for the active list.

### Archive a checklist

A whole checklist can be archived as a unit — the list-level counterpart
of [archiving an item](#archive--unarchive-item). The persisted shape
carries an optional `archived` flag on `Checklist` (`src/domain/types.ts`);
the pure op `setChecklistArchived` (`src/domain/checklists.ts`) sets or
clears it, and the selectors `activeChecklists` / `archivedChecklists`
split the document by it. `archivedByChecklist` skips any wholly-archived
list, so its items never double up as an item group in the archive.

`useChecklistLists` (`src/app/use-checklist-lists.ts`) exposes the verbs:
`archiveChecklist(id)` moves a list out of the switcher (re-pointing the
selection at a surviving active list, raising a toast, and recording on
the undo timeline) and `unarchiveChecklist(id)` brings it back and selects
it. Both refuse to leave **zero** active lists — `archiveChecklist` no-ops
on the last active list, and `removeChecklist` won't delete it either — so
the views always have one to render. The archived lists surface in the
[archive view](#archive-view)'s "Archived lists" section
(`archivedChecklists`), each with Restore / Delete. Archiving the first
list unlocks the **Tidy Shelves** [achievement](#achievements) via a
derived predicate over the document gaining an archived list. The trigger
on desktop is the sidebar checklist row's
[right-click menu](#right-click-menu) (Archive / Delete).

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

### Archive / delete finished

`archiveChecked` / `deleteChecked` (`src/domain/checklists.ts`) — the bulk
counterparts to `setArchived` / `deleteItem`: each sweeps **every finished
(checked, still-active) item** in one pass, leaving archived items
untouched. Both no-op (return the same checklist, so they never write) when
nothing is finished. The edit verbs `archiveFinished` / `deleteFinished`
(`src/app/use-checklist-edits.ts`) wrap them, raise an "Archived / Deleted
{count} finished" toast, record one undoable step, and fire the
`springClean` / `cleanSweep` achievements. They're reached from the
add-button's long-press action row (see [Add-item
button](#add-item-button)).

### Reorder item

`moveItem` (`src/domain/checklists.ts`) — moves an active item to a new
index **among the visible items**, keeping archived items pinned to
their absolute slots. `toIndex` is clamped and a no-op move returns the
same checklist untouched (no `updatedAt` bump, so it never writes). This
is the flat-list helper; the live drag gesture (which can also nest)
commits through `moveItemInto` — see [Sub-items](#sub-items--nested-items).

### Sub-items / nested items

Items form a **tree**: every `ChecklistItem` may carry a `children` array
(`src/domain/types.ts`), so a checklist row can hold its own sub-checklist
to any depth. The whole feature is the same **drag** gesture as reordering,
extended with a drop *zone*: `useListReorder`
(`src/ui/hooks/useListReorder.ts`) splits the row the finger is over into
bands — the top / bottom edges drop the dragged item **before** / **after**
it, and the **wider middle band drops it _into_ that row as a sub-item**
(`DropMode` = `"before" | "after" | "into"`; the middle band is deliberately
the larger half so dragging squarely *onto* a row reliably nests it, which
matters most under a thumb on a phone).

While dragging, the picked-up row is **lifted clean out of the list flow**
and floated under the finger as a **smaller, translucent copy** (`rowStyle`
returns an absolute, `scale(0.92)`, low-opacity transform — small enough to
see the rows behind it; the `<ul>` is `position: relative` so the copy
positions against the list, its `top` captured at pointer-down). A
full-size **ghost preview** — a dashed, accent-tinted marker of the dragged
item (`DragGhostRow`, `src/ui/DragGhostRow.tsx`) — snaps into the exact spot
the item will land, **indented a level for an _into_ drop**, while the
surrounding rows open a gap for it. The view places it with
`ghostPlacement` (`src/ui/dragGhostPlacement.ts`), a pure function that maps
the live drop target to a `{ index, depth }` in the flattened rows (walking
past the target's visible subtree for _after_ / _into_, exactly as
`moveItemInto` will). When a **parent** is dragged its descendant rows are
hidden for the duration — the subtree travels as one, stood in for by the
floating copy plus ghost. For an _into_ drop the target row also lights up
with an accent ring so the parent-to-be is obvious; sibling (_before_ /
_after_) drops draw **no** line on the target row — the ghost is the single
landing indicator, since an "after-a-parent" line on the target's own edge
would sit between it and its children rather than below the whole subtree.
On release the view commits `reorder(draggedId, targetId, mode)` →
`moveItemInto` (`src/domain/checklists.ts`), which lifts the dragged item
**with its own subtree** and re-inserts it; dropping onto itself, onto one
of its own descendants, or in a spot that doesn't change the arrangement is
a no-op (so the gesture leaves no undo step). The view's `canDrop` predicate
keeps a row from offering itself or a descendant as a target.

Rows render from `flattenForDisplay(items, collapsed)`
(`src/domain/checklists.ts`), which walks the tree into ordered
`{ item, depth, hasChildren }` rows; `ChecklistRow` indents by `depth` and,
when `hasChildren`, shows a **disclosure caret** (`CaretRightIcon`,
`src/ui/icons/action.tsx`) — deliberately a different glyph from the note-body
chevron — that collapses/expands the sub-list. A nested row (`depth > 0`) also
reads as a **genuine child line**: its title steps down to `text-sm`, its note
body to `text-xs`, and its checkbox draws the smaller `size="sm"` square (the
`Checkbox` `size` prop shrinks only the drawn box, not the tap padding) — so a
sub-item looks subordinate while staying just as easy to hit. Collapse is **local view
state** in `ChecklistView` (a `Set` of collapsed ids, expanded by default),
exactly like a revealed note body, so it isn't persisted.

A parent's **checked state cascades**: `toggleItem` checks (and stamps
`checkedAt` on) or unchecks its entire subtree, so checking a parent reads as
the whole group done. The other operations recurse too — `editItem`,
`deleteItem` (drops the subtree), `setArchived` (the flag rides one node; its
subtree hides with it and the archive view lists the archived *root*),
`archiveChecked` / `deleteChecked`, and the **sort-checked-to-the-bottom**
order, which sorts within each sub-list independently
(`sortCheckedToBottom` recurses). The header **checked / total** count
(`visibleCount`, `checkedCount`) spans the flattened tree. The on-disk
**markdown codec** nests sub-items with two-space indentation per level (a
note continuation is told apart from a nested task line by whether the
indented line itself parses as an item); templates stay flat.

Dragging isn't the only way to build the tree. The in-row editor
(`ChecklistRowEditor`) carries an **"Add sub-item"** button beside "Add a
note": it commits the edit and asks the view to open a composer **nested
under** that item (`onAddChild` → `startChildDraft` in `ChecklistView`,
which also expands the parent so the draft isn't hidden behind a collapsed
caret). The composer is the same `AddItemForm`, indented by a `depth` prop
and bound to `addItem(title, parentId)` (the edit verb and `addItem` /
`addItems` domain ops take an optional `parentId` that appends into the
parent's `children`, falling back to a top-level add if the id is gone). It
splices into the flattened rows at `childDraftIndex` — right under the
parent for a `"top"` add-position, after the whole subtree for `"bottom"` —
matching where the new child actually lands. **Enter while editing a nested
row keeps the chain inside the sub-list**: Enter opens the "after this row"
draft (`onAddAfter(item.id)` → `startAfterDraft`), which inserts the new
item as the edited row's next sibling at its own depth — for a sub-item
that means another sibling sub-item under the same parent, so finishing one
flows into the next instead of jumping back out. (The explicit "Add
sub-item" button is still the way to step *into* a row and start a fresh
child.) Both the drag gesture and the button unlock the **Nest Egg**
achievement; a plain sibling reorder keeps **Reshuffle**.

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
Storage, and — only when dev mode is on — Developer (plus Logs, once log
capture is enabled). Each tab
carries an inline-SVG marker glyph (`TAB_ICONS`). On desktop the tabs sit in
a labelled left rail (a WAI-ARIA tablist with roving tabindex + arrow-key
navigation); on mobile that rail collapses into a header burger button —
the burger plus the active tab's icon and label form one toggle that opens
the section list in a `FloatingPanel`. Tab labels come from i18n. Built on
`Modal`. Mirrors the budget project's settings chrome.

The settings the dialog owns (theme, font, list behaviour, the General
toggles) are edited against a local **draft** and committed only on **Save**;
**Cancel** drops the draft and **Reset to defaults** rewrites the owned
fields of the draft (leaving the achievements map and the menu-button
position the dialog doesn't edit). While the dialog is open it streams the
live draft up through `onPreviewAppearance` so the theme engine previews
appearance edits before they're saved (see "Settings store"); the
device-local controls (developer mode, log capture, fake data) and the
storage connections still apply immediately — they don't live in the
persisted `Settings` document the draft snapshots.

### Settings store

`src/settings/store.ts` + `src/settings/useSettings.ts` — the persisted
appearance `Settings` (theme preset, font family, font scale, the
custom-theme overrides, `addItemPosition`, `menuButtonPosition`,
`showMenuButton`, `disableToasts`, `disableItemNotes`), kept in `localStorage` under `checklist:settings:v1`. `useSettings`
exposes `update(key, value)` (one field) and `replace(producer)` (a whole
document in one write); both write through and re-render so the theme engine
follows at once. The settings dialog edits a local draft and flushes it via
`replace` on Save, previewing appearance edits live through a separate
channel (`App`'s `appearancePreview` → `useTheme`) so the store stays the
single source of truth and a cancel just drops the draft. `store.ts`
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

### Root namespace registry

`src/storage/namespace-store.ts` — the `NamespaceRegistryStore` seam that
persists the device's **list of namespaces** as a single `namespaces.json`
(`NAMESPACES_FILE_NAME`) at the **app-folder root**, beside `settings.json`
and the per-namespace folders. It is the namespace counterpart of the root
settings file: `fileNamespaceStore` builds one over any root-scoped
`FileStore`, and each file-based backend exports a `create*NamespaceStore`
(`createFolderNamespaceStore`, `createDropboxNamespaceStore`,
`createGdriveNamespaceStore`). `useStorageBackend` builds the active
backend's store as `namespaceStore` (null for the browser backend, whose
only namespace home is `localStorage`, and while a folder grant is
unresolved) and runs a **reconcile** when a file backend is (re)selected:
it loads the backend's `namespaces.json`, merges it with this device's list
via `mergeNamespaceLists` (the backend wins any slug both sides know; this
device's local-only namespaces are carried over), writes the result back to
`localStorage`, and — when the device had local-only namespaces
(`hasLocalOnlyNamespaces`) — pushes the merged list back up. A missing
remote file is seeded from this device, so the first device to connect
publishes its list. Every create / rename / appearance / remove verb also
write-throughs to `namespaceStore`, the same way `useSettings` mirrors
`settings.json`. Stays plaintext JSON even when the documents are
encrypted (a namespace's name/icon isn't secret, and the list must be
readable before the unlock gate renders).

### General tab

`src/ui/settings/tabs/general.tsx` — the dev-mode toggle (which reveals
the Developer tab, and the Logs tab once log capture is on), the "Disable
toasts" toggle that drives
`disableToasts` (suppressing the general toast stack but not the upgrade
hint), the "Disable achievements" toggle that drives
`disableAchievements` (switching the achievements system off — see
**Achievements**), and, **only in the installed PWA on a phone / tablet**
(`useStandaloneMobile`), the "Show menu button" toggle that drives
`showMenuButton`. List-behaviour preferences moved out to the Lists tab.

### Lists tab

`src/ui/settings/tabs/lists.tsx` — list-behaviour preferences: the "add
new items at top / bottom" choice that drives `addItemPosition` (moved
here from the General tab), the **Sort checked items to the bottom**
toggle (`sortCheckedToBottom`), the **Disable item notes** toggle
(`disableItemNotes`), and the **Show item count** toggle
(`showItemCount`).

### Sort checked items to the bottom

The **Sort checked items to the bottom** toggle on the Lists tab
(`sortCheckedToBottom` on the synced `Settings`) sinks the checked items
below the still-unchecked ones in the active view, with the most recently
checked item heading the checked group. It is a **view-only sort**: the
stored document order is never reordered, so unchecking an item drops it
straight back where it sat. The recency order is read from `checkedAt` on
each `ChecklistItem` — stamped by `toggleItem` on the false→true flip and
cleared on uncheck (`src/domain/types.ts`, `src/domain/checklists.ts`).
`useChecklist` derives the displayed list through `displayItems(list,
sortCheckedToBottom)` (which delegates to `sortCheckedToBottom(items)`),
and drag-to-reorder still works because `reorder` routes through
`moveDisplayedItem`, which translates a drop index expressed against the
displayed order back into a document move. Turning it on unlocks the
**Sink or Swim** achievement. Persists only on the JSON (this-device)
backend; the markdown-backed folder / cloud stores don't round-trip
`checkedAt`, so after a reload the checked group falls back to document
order there.

### Animate sorted items

When checked-sorting is on, checking an item moves its row past the
still-unchecked ones in a single frame. The **Animate sorted items**
toggle on the Appearance tab (`animateSortChecked` on the synced
`Settings`, on by default) makes that re-sort glide instead: `ChecklistView`
feeds `useReorderFlip` (`src/ui/hooks/useReorderFlip.ts`) the
`animateReorder` context flag — true only when both `sortCheckedToBottom`
**and** `animateSortChecked` are on — and the hook runs a FLIP transition
(measure the new row offsets in a `useLayoutEffect` before paint, diff them
against the previous commit's snapshot via the pure `reorderFlips` helper,
and play each moved row from its old offset to rest through the Web
Animations API). It stays out of the pointer drag-to-reorder gesture
(`useListReorder` owns the row transforms then, so the hook is suspended for
the drag and skips the first commit after it) and honours reduce-motion —
both the in-app Custom-theme toggle (`data-reduce-motion` on `<html>`) and
the OS `prefers-reduced-motion` preference short-circuit the animation,
since Web Animations aren't covered by the reduce-motion stylesheet guard.

### Disable item notes

The **Disable item notes** toggle on the Lists tab
(`disableItemNotes` on the synced `Settings`) switches the markdown body
beneath an item's title off across the checklist — items become
title-only. The flag rides the checklist context (`disableItemNotes` on
`ChecklistContextValue`, set by `App` from the settings) to every
`ChecklistRow`, which then treats the item as bodyless: the note glyph
and the rendered markdown never show, and the in-place
`ChecklistRowEditor` drops its note textarea, the "Add note" affordance,
and the Shift+Enter reveal so editing only touches the title. Notes
already written stay in the document untouched — flipping the toggle back
off brings them back. Unlocks the **Bare Bones** achievement.

### Show item count

The header progress badge (`ItemCount`, `src/ui/ItemCount.tsx`) shows the
**checked / total** fraction beside the copy and sync glyphs, wrapped in a
small ring that fills as items get checked and flips to the success accent
once every item is done. Sized and bordered (`h-9`) to sit on the same row
as those glyphs so the header reads as one control group rather than a
stray number. The **Show item count** toggle on the Lists tab
(`showItemCount` on the synced `Settings`, on by default) hides the badge
for a cleaner header; the flag rides the checklist context
(`showItemCount` on `ChecklistContextValue`, set by `App` from the
settings) to `ChecklistView`, which drops the badge when it's off. Hiding
it unlocks the **Lost Count** achievement.

Pressing the badge opens a small **bulk-action dropdown** (a `FloatingPanel`
menu anchored to the badge's right edge, so it opens down-and-to-the-left
and stays on screen) with **Check all** and **Uncheck all** — a one-tap way
to tick off (or clear) the whole list instead of toggling each row. Each
action runs the `checkAll` / `uncheckAll` edit verb
(`src/app/use-checklist-edits.ts`), which calls the pure `setAllChecked`
(`src/domain/checklists.ts`) — it sweeps every active (non-archived) item,
cascading through sub-items and stamping / clearing `checkedAt`, and no-ops
when the list already matches. The menu greys out **Check all** once
everything is checked and **Uncheck all** when nothing is, and the badge
stays a static, non-interactive readout when there are no items. Using
**Check all** unlocks the **All In** achievement.

### Include archived in copy

The **Include archived in copy** toggle on the Lists tab
(`includeArchivedInCopy` on the synced `Settings`, **off** by default)
governs whether the [copy button](#copy-checklist) appends the archived
items — the `## Archived` section — to the markdown it puts on the
clipboard. With it off, a copied list is just its active `- [ ]` / `- [x]`
lines; turning it on copies the archive too. The flag rides the checklist
context (`includeArchivedInCopy` on `ChecklistContextValue`, set by `App`
from the settings) to `ChecklistView`, which hands it to `CopyButton` as
its `includeArchived` prop; that prop becomes the `includeArchived`
argument to `checklistBodyMarkdown`. The argument defaults to `true`, so
the only caller that opts out is the copy path — the on-disk `.md` file
(`checklistToMarkdown`) always writes the full archive, since there the
archive is the live store, not an export. Turning the setting on unlocks
the **Copy the Archive** achievement.

### Capitalise items

The **Capitalise items** toggle on the Lists tab (`capitalizeItems` on
the synced `Settings`, **off** by default) capitalises the first letter
of a newly entered item title. With it on, typing `buy milk` and
committing stores `Buy milk`, and the entry fields capitalise the first
letter **live** as you type. This is a deterministic, cross-platform
capitalisation done in the app — it doesn't rely on the mobile keyboard's
own `autocapitalize` behaviour, which iOS does not re-evaluate when a new
item's field is focused programmatically after Enter — so it works the
same on a phone and a desktop browser. Only the first letter is touched
(via the pure `capitalizeFirst` in `src/domain/text.ts`), so an
intentional `iPad` later in the title is left alone. The flag rides the
checklist context (`capitalizeItems` on `ChecklistContextValue`, set by
`App` from the settings) to `ChecklistView`, which threads it to the
[add-item composer](#add-item-form) (`AddItemForm`'s `capitalize` prop)
and, through `ChecklistRow`, to the [in-place editor](#edit-item)
(`ChecklistRowEditor`'s `capitalize` prop); each applies it both in the
field's `onChange` and at the commit boundary. Imports and pastes are left
untouched — only typed titles are capitalised. Turning the setting on
unlocks the **Capital Idea** achievement.

### Appearance / theme tab

`src/ui/settings/tabs/appearance.tsx` — the theme picker (light/dark
mode + variant), font family, text size, the always-visible **Motion**
section (the **Animate sorted items** toggle — see "Animate sorted items"),
and — when the Custom theme is selected — the per-colour overrides and the
shape/motion controls
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
devices. A fresh unlock raises a celebratory toast and lights up the
**trophy row** (`TrophyButton`) — a side-menu item sitting among the
footer actions (settings, "what's new", the project links) at the foot of
the drawer — which reads the unseen count from `AchievementsContext`. Its
glyph is coloured (the `flag` accent) with a count badge when there are
unseen unlocks, and greyed out otherwise. The row opens one of two
modals, matching budget: when **quiet** (nothing unacknowledged) it opens
the **achievements tour** (`AchievementsModal`, via the
`{ kind: "achievements" }` command and `AchievementsModalHost`) — the
four-tier browse of the whole catalog; when **lit** it instead opens the
**unlock-notification modal** (`AchievementUnlockModal`, via
`{ kind: "achievements-unlock" }` and `AchievementsUnlockModalHost`)
listing just the new unlocks, and closing that clears the unseen queue so
the badge empties. Add or retire an achievement with the
`update-achievements` skill.

The whole system can be switched off from **Settings → General** via the
**Disable achievements** toggle (`disableAchievements` on the synced
`Settings`). When off, the watcher's `enabled` flag is false: both passes
no-op — derived unlocks are skipped and the manual bus is
drained-and-discarded so nothing queued mid-disable fires later — and the
side-menu `TrophyButton` (reading `enabled` from `AchievementsContext`)
renders nothing, removing the only entry point into the modals. Earned
progress in the `achievements` map is left untouched, and re-enabling
re-establishes the baseline like a fresh load so the deltas produced
while off are never backfilled.

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

### Folders

**Folders** group checklists *within* a single namespace — the organising
layer below namespaces. The model is pure data in `src/domain/types.ts`: a
`Folder` is `{ id, name, createdAt }`, a `Checklist` carries an optional
`folderId` linking it to one, and the `Snapshot` carries a `folders[]`
registry. The registry is kept on the snapshot (not derived from the lists)
so an **empty folder** — one no list references yet — persists; everything is
absent rather than empty/null when unused, so an older document needs no
migration. The pure operations live in `src/domain/folders.ts`
(`createFolder`, `renameFolder`, `setChecklistFolder`, `checklistsInFolder`,
`removeFolder` — which un-groups the lists inside rather than destroying them).

The app-state verbs hang off `src/app/use-checklist-lists.ts` alongside the
list verbs: `folders` (a `FolderSummary[]` with per-folder active counts),
`createFolder`, `renameFolder`, `removeFolder`, `moveChecklistToFolder`, and
`addChecklistInFolder` (mint a list already filed inside a folder). They flow
to the side menu through the checklist context like every other list verb.

In the side menu (`src/ui/SideMenu.tsx`) each folder renders as a collapsible
`FolderRow` (caret + folder glyph + name + count, plus a `+` that adds a list
straight into it); the grouped lists nest under it when expanded, ungrouped
lists follow, and a compact action panel at the foot carries **New list**,
**New folder**, and **Archive** alongside **Undo** / **Redo** (`BarButton`s,
replacing the old section-header `+` and full-width Archive row). When a
folder is **collapsed** it still surfaces the **active list** if that list is
filed inside it — peeked as a single nested row — the same courtesy the
namespace section pays the active namespace, so the open list never vanishes
behind a fold. `FolderEditRow` is the inline name input for creating or
renaming a folder. Moving an existing list into a folder is a **drag gesture**
(see *Drag a list…* below), not a menu entry; the collapse state is
device-local component state, not persisted.

On the **file/cloud backends** a folder is a *real directory*. The codec
(`src/storage/markdown/codec.ts`) files a grouped list into
`checklists/<folder-slug>/<stem>.md` (`folderDirSegment` / `checklistFilePath`)
and writes a `folder: <id>` line into the list's frontmatter — and that
**frontmatter link is authoritative**: the physical directory is only a
browsable projection, so two folders that slug alike never lose a list. The
folder *names* (and empty folders) ride a plaintext `folders.json` registry
sidecar the directory adapter keeps (`FOLDERS_FILE_NAME` in
`src/storage/directory-adapter.ts`): on load it's folded back into the
snapshot's `folders[]`; on save it's rewritten only when the registry changed.
A folder rename therefore never rewrites the list files. When at-rest
encryption is on, the whole document — folders included — stays in the single
`checklist.json` blob and the plaintext sidecar is cleared, so nothing about
the folders leaks on disk; per-folder encrypted directories are a later step.
The serialize seam (`src/storage/serialize.ts`) validates the registry both
inside a document and as a standalone sidecar (`parseFolders` /
`serializeFolders`), dropping malformed entries and duplicate ids. Two
achievements ride the feature: **Pigeonholed** (create a folder) and **Filed
Away** (move a list into one).

### Drag a list between folders, namespaces, and the archive

A checklist row in the side menu is **draggable**: pick it up and drop it onto
a folder to file it, onto the ungrouped zone to take it back out, onto another
**namespace** to send it there, or onto the **Archive** button to archive it.
This is the only way lists move between folders and namespaces — the old
right-click/swipe "move to folder" affordances are gone; the swipe strip now
carries only delete, and the right-click menu only archive + delete.

A **whole folder header is draggable too**, but its only meaningful target is
another **namespace**: dropping a folder onto a namespace row relocates the
folder *and every list filed inside it* there, group intact (over a folder, the
ungrouped zone, or the archive it's inert). The two payloads ride the same
machinery — the dragged thing is carried as one string, with a folder encoded
under the `FOLDER_DRAG_PREFIX` via `folderDragId` and split back out by
`parseDragId` at the drop, so the resolver routes a folder to the
folder-move and a bare id to the per-list path. While a folder is in flight the
drop targets gate their highlight on `DragKindContext` (a folder lights up only
namespace rows), and the drag chip swaps in a folder icon.

Two pointer paths back one gesture, ported from the `notes` sibling
(`src/ui/checklist-drag.tsx` + `src/ui/checklist-drag-context.ts`):

- **Desktop** uses native HTML5 drag (`draggable` + `dragstart`/`drop`). The
  row stamps its id onto `dataTransfer` (`CHECKLIST_DND_TYPE`); each drop target
  wires `onDragOver`/`onDrop` and lights an accent highlight while a list hovers
  it (`dropTarget` state in `SideMenu.tsx`).
- **Touch** has no HTML5 drag, so `useTouchChecklistDrag` provides the
  equivalent: a **press-and-hold** (320 ms, aborting if the finger travels first
  so it doesn't fight swipe-to-delete or scroll) picks the list up, captures the
  pointer, blocks page scroll, and hit-tests `elementFromPoint` against the
  `data-checklist-drop` attribute each target carries. A floating **chip**
  (`ChecklistDragProvider`'s ghost) tracks the fingertip, and the hovered
  target reads `useChecklistDropKey` to paint the same highlight. A folder's
  accent tint must sit on its **opaque foreground layer** (the swipe surface in
  `FolderRow`), not on the wrapper behind it — otherwise the surface fill hides
  it and a hovered folder never lights up on touch.

**Ending the gesture reliably.** Only `onPointerDown` lives on the row;
`useTouchChecklistDrag` binds `pointermove`/`pointerup`/`pointercancel` to
**`window`** for the rest of the drag (dropped on cleanup). Keeping them on the
row instead would lean on the pointer capture `engage` requests — but capture is
best-effort (some engines refuse it mid-gesture, and a pen/touch point can drift
off the row), and a release the row never sees would leave the lifted list
frozen mid-air. Off `window` the release is caught wherever the pointer ends up;
a `pointercancel` aborts without filing. This mirrors the item-reorder drag
(`useListReorder`), which already binds to `window` for the same reason.

That covers a release that lands anywhere, but not the screen being seized while
the finger is _still down_ — a background save colliding with another device
raises the non-dismissable conflict modal over the list mid-drag. For that,
`App` hands `ChecklistDragProvider` an `aborted` prop
(`checklist.conflict !== null`); on its rising edge the provider clears the chip
and bumps `DragAbortContext`, which each active `useTouchChecklistDrag` watches
to tear its gesture down (so the lifted list can't hover over the modal, and a
later release can't commit a move into the unresolved conflict), and which the
native HTML5 drop zones in the side menu watch via `useChecklistDragAbort` to
clear a lift that `dragend` would otherwise never resolve once the dragged row
unmounts.

Hovering the **ungrouped zone** (`CHECKLIST_DROP_ROOT`) frames the no-folder
region with an accent border rather than just tinting it: folders always render
above the loose lists, so the framed area below them is exactly where the list
will land when dropped outside every folder (with no folders it's the whole
list).

Both paths commit through one resolver: `ChecklistDragProvider`'s `onDrop`
(exposed to the desktop handlers via `OnDropContext` so neither path forks the
logic). It hands the dragged **id** (bare, or folder-prefixed) and the target
**key** to `onChecklistDrop` in `src/app/App.tsx`, which first splits the id
with `parseDragId`: a **folder** drop resolves only on a `ns:<slug>` key (the
folder-to-namespace move) and is a no-op elsewhere; a **checklist** maps the
key to an action — `CHECKLIST_DROP_ROOT` / a folder id → `moveChecklistToFolder`,
`CHECKLIST_DROP_ARCHIVE` → `archiveChecklist`, `ns:<slug>` → the cross-namespace
move.

The **cross-namespace move** is the only genuinely new write. Because each
namespace is its own document, App writes the list into the *target*
namespace's document first — `storage.moveChecklistToNamespace` builds an
adapter scoped to the target slug (the `makeInner` factory in
`useStorageBackend.ts`, wrapped in the active encryption envelope), loads,
prepends the list (its folder link dropped, since the target has its own
folders), and saves — and only on success drops the list from the *source*
document via `detachChecklistToNamespace` (`use-checklist-lists.ts`). A failed
target write (offline cloud, locked store) leaves the list where it is. The
source move refuses to strip a namespace of its last active list, since the
views always need one to show. The gesture unlocks the **Relocated**
achievement.

Moving a **whole folder** across namespaces works the same way, scaled up to
the group: `storage.moveFolderToNamespace` loads the target document, prepends
every list filed in the folder (each *keeping* its `folderId`, unlike the
per-list move) and registers the folder there with `addFolder`, then saves;
only on success does `detachFolderToNamespace` (`use-checklist-lists.ts`) drop
the folder and its lists from the source in one undoable step. App refuses the
move when it would leave the source namespace with no active list, and an empty
folder simply relocates its registry entry. The gesture unlocks the **Moving
Day** achievement.

### Namespaces

`src/storage/namespaces.ts` — the registry of **namespaces**: named
buckets that each hold their own checklist document. `localStorage` is the
synchronous home the registry is read from (first paint and adapter
construction need the list before any network resolves), but on a file
backend it is no longer the canonical store: the **list** of namespaces is
mirrored to `namespaces.json` at the app-folder root (see the *Root
namespace registry* entry) so it travels with the synced/shared folder and
lands on every device that connects the backend — the namespace list now
follows the user across devices the way `settings.json` does. The
**active** slug stays per-device: which list you're looking at is a local
cursor, not shared state. Every namespace has a `slug` (fixed at creation,
folder-/key-safe) and an editable display `name`; rename only changes the
name so data never has to move. The `default` namespace always exists and
can't be removed. `namespaceLocalKey` / `namespaceCloudFolder` map a slug
onto a concrete location: the default namespace keeps the legacy
`checklist:v1` key locally, every namespace gets its own folder in the
cloud (so a folder can be shared wholesale — the `family/` folder shared
with relatives). The management UI is
`NamespacesModal` (`src/ui/NamespacesModal.tsx`), reached from the cogwheel
on the namespace section header at the top of the side menu — one button
that opens the combined manage-and-create dialog (which is why it's a cog,
not a `+`). Deleting a namespace from a row in that dialog opens an in-app
`ConfirmDialog` (danger tone) rather than a browser `window.confirm`, since
the removal wipes the namespace's data from the active backend.

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
untouched one keeps the plain folder icon. The active namespace is marked
by the row's accent-tinted highlight and left border (and the icon's accent
tint), not by a swapped-in checkmark. When
the active namespace has a glyph, that glyph (in its colour) **replaces the
app logo**: `namespace-favicon.ts` resolves the header wordmark slot
(`namespaceLogoSrc`, threaded through `ChecklistContext` as `logoSrc` and
read by `ChecklistView`) and the browser-tab favicon
(`namespaceFaviconSrc`, applied via `applyFaviconHref` from an effect in
`App`). The two agree for a picked glyph, but differ for the default
no-glyph mark: the header keeps the dark rounded badge (`favicon.svg`)
while the in-tab favicon shows the bare, background-less check
(`favicon-mark.svg`) — the PWA app icons, generated from `favicon.svg`,
keep their opaque badge. A namespace with only a colour keeps the bundled
mark — the favicon is re-badged only when a glyph is picked.

### Storage tab

`src/ui/settings/tabs/storage.tsx` — the UI for picking the backend
(This device / Dropbox / Google Drive), connecting / disconnecting a
cloud provider, and turning on at-rest encryption with a passphrase
(with the too-short / mismatch validation). Deep-linked from the sync
glyph. Turning encryption on or off is the heaviest thing the tab does
(key derivation, re-wrapping every list, re-saving), so the toggle
buttons spin while it runs and a one-line **encryption status bar**
flashes the phase it's on — `Reading…`, `Deriving encryption key…`,
`Encrypting…`, `Saving…`, `Finalizing…` — fed by the `onProgress`
callback the [storage backend hook](#usestoragebackend-hook) reports each
phase through. The messages flash by too fast to read in full by design;
they're there to show *something is happening* during the
otherwise-silent key-derivation pause. On success the bar vanishes and
the heading's "Encryption is on / off" is all that's left. On failure the
bar turns red and becomes a button that opens the
[encryption log modal](#encryption-log-modal) with the whole phase
sequence plus the error that stopped it.

### Encryption log modal

`EncryptionLogModal` (`src/ui/settings/EncryptionLogModal.tsx`) — the full
log behind a failed [encryption status bar](#storage-tab). The status line
only ever shows the single phase it's on; when a turn-on / turn-off
throws, the red status line becomes tappable and opens this modal, which
replays every phase (timestamped) and the terminating error — the
[Logs tab](#logs) experience scoped to the one operation that just broke,
so a passphrase or storage error is legible on a phone without reaching
for devtools.

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
markdown on the next plaintext save. Because every save re-lists the
directory first, a **format conversion** (toggling encryption) cleans up
after itself in either direction: writing the envelope clears every
`*.md`, and writing markdown clears the `checklist.json` — so a toggle
can't strand the old representation beside the new one (which the next
load would otherwise read back).

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
`isGdriveConfigured()` gates the connect button. A 401 surfaces as
`AuthError`; a rate limit — which Drive signals mostly as **403** with a
`userRateLimitExceeded` / `rateLimitExceeded` reason (and sometimes a bare
429), not Dropbox's clean 429 — surfaces as `RateLimitError` so the same
throttle-and-resume path engages. A genuine 403 permission error stays a
plain error.

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
until the user supplies the passphrase. While it checks the passphrase
and decrypts, the gate flashes a phase status line — named in
unlock-specific terms ("Checking your passphrase…", "Decrypting your
lists…", "Unlocking your lists…") via `UNLOCK_STEP_MESSAGE_KEY`
(`src/ui/encryption-progress.ts`) — beside a `CipherGlyph`
(`src/ui/CipherGlyph.tsx`): a short run of monospace cipher characters
that continuously re-scramble in place of a spinner, evoking bytes being
enciphered. The same shared `STEP_MESSAGE_KEY` map and `CipherGlyph` drive
the [storage tab](#storage-tab)'s encryption status bar, so the toggle and
the gate name the same phases identically. `CipherGlyph` honours
reduce-motion both ways (the OS `prefers-reduced-motion` preference and the
in-app toggle the theme engine mirrors onto
`<html data-reduce-motion="true">`), holding a static frame when motion is
off.

Toggling the mode rewrites the document at rest: `enableEncryption`
re-wraps the existing lists into ciphertext and `disableEncryption`
decrypts them back. Disabling always re-saves the surfaced document as
plaintext — even when a stale plaintext copy shadows the blob and the load
returns that instead of the envelope — so the
[markdown file store](#markdown-file-store) clears the superseded
`checklist.json` and no ciphertext lingers behind. Both
`enableEncryption` / `disableEncryption` (and `encryptText` /
`decryptEnvelope` underneath) take an optional `onProgress` callback that
fires once per phase (`reading → derivingKey →
encrypting`/`decrypting → saving → finalizing`); the
[storage tab](#storage-tab) feeds it into its status bar. `unlock` threads
the same callback through (`reading → derivingKey → decrypting →
finalizing`) so the unlock gate can flash its status line.

### Offline cache / local copy

`src/storage/cache/index.ts` (`withLocalCache`) wraps the cloud adapters
(Dropbox, Google Drive) so the document can be unlocked, read, and edited
with no connection — on a plane, in a tunnel. It mirrors every successful
load / save into this device's `localStorage` (keyed by
`localCacheKey(backend, namespace)`), and on a raw network failure serves
the cached bytes instead, marked `offline: true`; it never masks the
typed signals (`Auth` / `Conflict` / `RateLimit`), which keep their
upstream handling. Because the mirror already lives in `localStorage`, the
wrapper also advertises and implements `loadSync`, handing that
(possibly-stale) copy back synchronously so a reload paints the last-seen
list instantly instead of an empty one while the live `load()` round-trips
to refresh it — the same no-flash fast path the local backend has, now
extended to the cloud backends. `withEncryption` strips the `loadSync`
capability back off (decryption is async), so the instant first paint
applies to an unencrypted cloud backend; an encrypted one still waits for
the async unlock/decrypt. It sits **below** `withEncryption`
(`cloudAdapter → withLocalCache → withEncryption → app`), so the cache
holds the encrypted envelope when encryption is on (never plaintext) and
the canonical JSON when it isn't — and because it is the `inner` the
unlock gate verifies the passphrase against, **unlocking works offline**
against the cached envelope. An offline save stashes the attempted bytes
locally (on the last good revision) and re-throws, so the sync engine
keeps the edit queued; its `online` listener re-flushes the queue when
connectivity returns. `useChecklist.offline` drives the header's
struck-through cloud glyph (`CloudOffIcon`) and the sync-details modal so
a stale local copy never reads as "synced". When the backend is
unreachable **and** nothing is cached yet (a brand-new device offline),
the load throws `OfflineUnavailableError`, which `UnlockGate` maps to a
"you're offline" message instead of the misleading "wrong passphrase".
Opening the lists while offline unlocks the **Off the Grid** achievement.

What the app *counts* as offline lives in `isOfflineError`: a raw `fetch`
`TypeError` (the request never reached the host — DNS failure, refused
connection, airplane mode). It deliberately does **not** consult
`navigator.onLine`, whose `false` readings are unreliable across platforms
(Linux network-manager quirks, VPNs, captive portals) and used to declare
the app offline while connectivity was fine. The typed adapter signals
(`Auth` / `Conflict` / `RateLimit`) are never offline; a plain backend
error (a 5xx surfaced generically) isn't either.

### Check connection

Because the offline state is a heuristic — and because nothing automatic
clears it until the next save lands or a pull-to-refresh succeeds — the
sync-details modal (`SyncDetailsModal`) shows a **Check connection** button
whenever `offline` is true, so the user can actively re-test reachability
and see *what's happening* rather than tapping a button that seems inert.
It calls `useChecklist.checkConnection` (`src/app/use-checklist-sync.ts`),
which fires `StorageAdapter.probe` — a lightweight reachability call (a
directory listing with no file bodies, implemented once in
`createDirectoryAdapter` so all three file backends share it and exposed
through the `withLocalCache` / `withEncryption` wrappers). The result is a
`ConnectionProbeResult` the button renders as a live status line: `online`
(the probe reached the backend — the engine re-reads the live document,
clearing `offline`, and flushes any edit queued during the outage),
`offline` (still unreachable — the user stays on the local copy), or
`auth-error` (the backend answered but refused the session, which is the
opposite of offline — the flag clears and the modal routes to the
**Reconnect** button). Each outcome is phrased in `sync.check*` strings
(English and Swedish).

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

A failed save doesn't immediately go red. The retry policy lives in the
pure, unit-testable `src/storage/save-retry.ts` (`backoffDelayMs`,
`isRetryableSaveError`, `MAX_TRANSIENT_SAVE_RETRIES`); the sync engine
owns the timers:

- **Rate limit (`RateLimitError`, HTTP 429).** The status flips to
  `throttled` (orange glyph, not red), the failed snapshot is re-queued,
  and a resume timer is armed for the backend's `retryAfterMs` *floored*
  against the equal-jitter backoff curve and *escalated per consecutive
  429*, so a server returning a tiny (or zero) cooldown can't pull the
  app into a tight resend loop. There is deliberately **no budget** —
  giving up on a rate limit would stop autosave, which is worse than
  waiting — so the throttle path keeps retrying until a save lands. Edits
  made during the cooldown coalesce into the single resume save.
- **Transient hiccup (any other error — 5xx, raw network failure).** The
  status stays `saving` while the save is re-queued and retried with the
  same backoff curve up to `MAX_TRANSIENT_SAVE_RETRIES` times; only after
  the budget is exhausted does it surface a hard `error` with the
  captured reason.

`ConflictError` and `AuthError` keep their dedicated handling and are
never retried this way. The consecutive-throttle and transient-retry
counters reset to zero the moment a save succeeds, and the armed resume
timer is cancelled on backend swap, reload, and unmount so it can never
fire into a fresh baseline.

### Reload / pull-to-refresh

`useChecklist.reload` re-reads the active backend and replaces what's on
screen, resetting the undo history to the freshly-loaded baseline. It's
a near-no-op round trip for the local backend but the real "pick up
another device's edit" pull for the cloud backends. The gesture is
`usePullToRefresh` (touch-only, suppressed while a modal owns the
screen, while the floating menu button is being dragged, and while a
checklist or item is being drag-reordered — each drag reports itself
through `ReportDragActivityContext` so a downward drag can't arm a
refresh at the same time); the visual is `PullToRefreshIndicator`.

### Conflict resolution

A conflict here means a genuine **cross-device** divergence — another
device pushed a newer revision between this device's last load and its
save. (A device can no longer conflict with itself: saves are serialized
so a mid-flight edit queues rather than racing the in-flight write — see
"Sync status / save state".) The directory adapter goes one step further
to suppress **phantom** conflicts: on a flaky link a save can commit to
the backend while its response is lost, so the device never learns the
new revision and the next save sees the aggregate revision "move" even
though no other device touched the data. To tell its own write apart from
another device's, the adapter keeps a history of the documents it has
tried to write (each projected through the same markdown round trip so
regenerated item ids line up, then normalised to an order-independent
canonical form and reduced to a compact fingerprint — `comparable` /
`fingerprint` / `recentWrites`). The order normalisation matters because
`load` rebuilds a snapshot in the backend's file-listing order while the
document being written carries the in-memory order from the offline cache,
so the same content would otherwise serialize to a different array order
and never match. The history is **persisted** per (backend, namespace) via
`writeLog` (a tiny list of fingerprints in `localStorage`, see
`browserWriteLog`) so it survives a reload: the lost-response writes are
made offline, and the device typically reloads — re-creating the adapter
and loading a *stale* revision from the offline cache — before it next
reaches the backend, so a purely in-memory history would forget the very
write that moved the revision. Before
raising `ConflictError` it reconstructs the remote document and checks it
against that history: if the remote already holds exactly the bytes about
to be written, the earlier write is what moved the revision, so it adopts
the new revision and reports success; if the remote matches an *earlier*
write (the lost-response one) while the user has since edited further —
so the local document has moved ahead of what landed — it writes the
newer bytes over the moved revision instead of conflicting. Only a remote
that matches none of this device's own writes is a genuine cross-device
divergence. When a save loses that race, the adapter throws
`ConflictError` and the hook turns it into a `ConflictState`.
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
resurrect a deleted item. Reachable from the side menu's side-by-side
undo/redo button pair at the foot of the drawer and via
`useUndoRedoShortcuts` (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z / Ctrl+Y), which
bails out when focus is in an editable field so native field-level undo
still works, and is silenced entirely while the side menu is open (but
not when it's pinned as a docked sidebar) so the drawer owns the
keyboard.

## Dev mode

### Dev mode / fake data

`src/dev/useDevMode.ts` (`useDevMode`) holds two device-local flags —
`devMode` (whether the Developer settings tab shows) and `captureLogs`
(which both mirrors the log to localStorage and gates the Logs settings
tab — it only shows while dev mode is on *and* capture is enabled) — at
module scope with a pub/sub layer and cross-tab sync; turning dev mode
off forces capture off. `src/dev/useDevSeed.ts`
(`useDevSeed`) backs the "Fake data" toggle as in-memory-only state (no
localStorage write), so a reload always drops back to the real backend.
When it's on, `App` swaps in an ephemeral seed adapter
(`createDevSeedAdapter`, `src/storage/dev-seed/index.ts`) preloaded by
`buildSeedSnapshot` (`src/dev/seed.ts`) — two sample templates and one
sample checklist — so `useChecklist` reloads sample data without
touching real data. Toggles live in the Developer settings tab.

### Logger / log capture

`src/dev/logger.ts` — the in-app logger: a bounded ring buffer (500
entries) with no console sink. Logging is a developer-only diagnostic —
a push only records while **developer mode or capture is on**; with both
off (a regular user) the logger is a no-op, since no surface (the Logs
settings tab, the sync-details log panel) is reachable to read it.
`useDevMode` keeps the logger's view of dev mode in step via
`setDevModeEnabled`. `createLogger(scope)` returns an
`info` / `warn` / `error` logger; when "Capture logs" is on the buffer
also mirrors to localStorage so it survives a reload, and the Logs
settings tab — gated on capture being enabled — appears. The Logs
settings tab (`src/ui/settings/tabs/logs.tsx`) renders it with a level
filter and copy / clear actions.

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
`src/i18n/locales/<lang>/` (app, changelog, common, language, menu, nav,
pwa, settings, sync, toast).

The user switches language from the **flag picker** on the General
settings tab: `src/ui/LanguagePicker.tsx` renders the UK and Swedish
flags as inline SVGs (not emoji, so rendering is deterministic across
OSes) inside a `radiogroup`, with the active flag accented and the other
dimmed. It's a controlled component (`value` + `onChange`); the General
tab feeds it `useLang()` and wires `onChange` straight to
`writeLanguagePreference`, which persists the choice and broadcasts
`LANGUAGE_EVENT` for `LanguageRoot` to apply live. The same broadcast
fires the `polyglot` achievement. The picker's own labels come from the
`language.*` namespace; the section heading and hint are
`settings.general.language` / `languageHint`.

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
Each bullet's inline markdown (the **bold** lead-in, `code` spans) is
rendered with `renderInlineMarkdown` from the item-note renderer
(`src/ui/markdown/renderMarkdown.tsx`) rather than printed raw. A bullet
carrying a `[Learn more](feature:<slug>)` link drills into the matching
feature doc in place (see "Feature docs / Learn more").

### Feature docs / "Learn more"

`docs/features/<slug>.md` — long-form, English-only markdown explaining
one large feature. `src/ui/changelog/feature-docs.ts` inlines every doc
into the bundle with `import.meta.glob` (mirroring how `data.ts` inlines
`CHANGELOG.md` — the app has no backend to fetch them at runtime),
splitting each into `{ slug, title, body }` via the pure `parseFeatureDoc`
(the leading `# ` heading becomes the title). A changelog bullet links to
one with `[Learn more](feature:<slug>)`; the collator
(`scripts/release/collate-changelog.mjs`) emits that link from a
fragment's `doc:` front-matter. The `feature:` link scheme is intercepted
in `renderMarkdown.tsx` (the `onOpenFeature` option): instead of
navigating, it calls back into `ChangelogModal`, which swaps the release
list for the doc body (rendered with the block `renderMarkdown`) behind a
back button. A slug with no bundled doc is ignored, so the link is inert
rather than a dead end.

### Privacy page

`src/ui/PrivacyPage.tsx` — the standalone privacy policy served at
`/privacy`, stating the app is local-first with no backend of its own,
accounts, analytics, or tracking. It also documents the optional storage
backends: a local folder, Dropbox, and Google Drive send list data to a
provider only when the user explicitly connects one, and the AES-GCM
encryption option keeps the cloud copy ciphertext-only. Deliberately
short and English-only (a legal page, not chrome). The SEO description
and noscript fallback in `src/seo/routes.ts` (`PRIVACY_ROUTE`) mirror the
same wording.

### Showcase page

`src/ui/ShowcasePage.tsx` — the standalone showcase / homepage served at
`/home` (and `/preview/home`, `/branch/home`). It is a no-login marketing
page that identifies the app, describes what it does, explains why the app
requests Google Drive / Dropbox access (the narrow app-folder scope, only
when the user turns on cloud sync), and links to the privacy policy — the
page linked as the "app homepage" on the Google OAuth consent screen, which
Google requires to describe the app's functionality and data use without a
login. Built exactly like the privacy page: mounted by the path switch in
`src/app/main.tsx`, emitted to `dist/home/index.html` by the
`emit-showcase-alias` plugin in `vite.config.ts`, with SEO copy, sitemap
entry, and noscript fallback in `SHOWCASE_ROUTE` (`src/seo/routes.ts`).
English-only by design. **Keep its feature list and data-use copy in sync
with the app** whenever a feature or a data-access path changes — see "The
`/home` showcase page" in `AGENTS.md`.

## Workflows / verbs the user might say

### Add an item

Tap the floating `AddItemButton`, type into the inline `AddItemForm`
composer that opens, and press Enter (or tap away to commit). Lands at
the top or bottom per `addItemPosition`; an empty draft is discarded.
To add **in the middle of an existing list**, press an item to edit it
and hit Enter — the composer opens directly below that row and each new
item lands as its next sibling (`addItemAfter`), so you choose where new
entries go instead of always appending.

### Check / uncheck an item

Tap the row's checkbox (`toggleItem`). The title strikes through and the
header count updates.

### Delete an item

Swipe a `ChecklistRow` left to latch open Delete, then tap it
(`deleteItem`), or use Delete in the archive view. On a computer,
right-click the row and choose Delete from the
[right-click menu](#right-click-menu). Recoverable via undo.

### Archive an item

Swipe a `ChecklistRow` right (`setArchived(…, true)`), or right-click it on
a computer and choose Archive. The item leaves the active view but stays in
the document; find it in the archive view.

### Restore an item

Open the archive view (side menu) and Restore (`setArchived(…, false)`) —
a row button on touch, the right-click menu on a computer.

### Reorder items

Drag a row by its grip handle (`useListReorder` → `moveItem`). Commits
once on drop.

### Remove a checklist

Open the side menu, swipe a checklist row left to uncover its trash, and
tap it (`removeChecklist`). One tap removes — it's recoverable via undo.
The last remaining active list shows no trash (the views always need one).
On a computer, right-click the row instead and choose Delete (or Archive)
from the [right-click menu](#right-click-menu).

### Archive a checklist

Right-click a checklist row in the side menu (desktop) and choose Archive
(`archiveChecklist`); the whole list leaves the switcher for the archive
view's "Archived lists" section, where Restore / Delete act on it as a unit
(see [Archive a checklist](#archive-a-checklist)). Recoverable via undo.

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
backends. Stands down while a checklist or item is being drag-reordered
so the reorder gesture can't double as a refresh.

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
