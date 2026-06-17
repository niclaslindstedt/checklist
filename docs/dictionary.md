# Dictionary

Maps the words the user (and the team) say in plain English to the
concrete components, types, and files in this codebase. **This file is
the index**: each row resolves a term to the most specific file and the
symbols to grep for, and stops there.

**The explanation for every term lives in [`docs/overview.md`](overview.md)**
— same headings, one-to-one. Look a word up here to find the code; read
the same word in the overview to understand how it behaves and what it
touches. Deep module / persisted-shape mechanics live in
[`docs/architecture.md`](architecture.md); the codified rules live in
`AGENTS.md`.

**When an agent encounters a term in user instructions that is not a
literal filename or import path**, look it up here first to resolve it
to the right code surface before searching. **When a new feature ships
or the user introduces a new word**, add a row here AND a matching
`overview.md` entry — same pull request, alongside the code change — so
the next agent doesn't have to guess.

Entries are alphabetical within each section. The `[→]` link in each row
points at the term's full description in `overview.md`.

## Canonical vocabulary

One verb / noun per concept across components, i18n strings, and file
names. Honour these when naming a new file, key, or string.

| Concept                          | Canonical                                                  | Retire                                          |
| -------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| A checkable line                 | **item** (`Item` / `ChecklistItem`)                        | "task", "entry", "todo" in code                 |
| The list of items                | **checklist** (`Checklist`) / **list** (UI copy)           | "sheet" (that's budget's word, not this app's)  |
| A reusable item list             | **template** (`Template`)                                  | "preset", "blueprint"                           |
| The whole persisted document     | **snapshot** (`Snapshot`)                                  | "document" in type names, "state"               |
| Hide an item without destroying  | **archive** (`setArchived`, `archived`)                    | "trash", "remove" for the non-destructive case  |
| Destroy an item                  | **delete** (`deleteItem`)                                  | "remove" in UI copy                             |
| Persist to a backend             | **save** (`save`, `saveNow`)                               | "sync" for the act of writing one document      |
| Re-read from the backend         | **reload** (`reload`) / **pull to refresh** (UI)           | "fetch", "refresh" in code                      |
| A persistence backend            | **backend** / **adapter** (`StorageAdapter`)               | "provider" except for the cloud vendor name     |
| The local backend (UI label)     | **This device**                                            | "browser", "localStorage" in UI copy            |
| The file backend (UI label)      | **Local folder** (`folder`)                                | "directory", "disk"                             |
| On-disk per-list file            | **markdown file** (`storage/markdown/codec.ts`)            | "export" — it's the live store, not an export   |
| Overlay with backdrop            | `*Modal.tsx`                                               | `*Dialog.tsx`, `*Popover.tsx`                    |
| Page-less full-screen surface    | `*View.tsx` (`ChecklistView`, `ArchiveView`)               | `*Page.tsx` (only `PrivacyPage`, a real route)  |

## Top-level UI

| Term                                                   | Refers to                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| **App shell** / **root**                               | `src/app/App.tsx`. [→](overview.md#app-shell)                                                            |
| **Checklist view** / **the list** / **main screen**    | `src/ui/ChecklistView.tsx`; `SyncInfo`, `useChecklistContext` (`src/ui/checklist-context.ts`). [→](overview.md#checklist-view) |
| **Checklist row** / **item row** / **row**             | `src/ui/ChecklistRow.tsx`. [→](overview.md#checklist-row)                                                |
| **Edit item** / **edit mode** / **change checklist text** / **press to edit** | `src/ui/ChecklistRowEditor.tsx`; `editItem` (`src/domain/checklists.ts`, `src/app/use-checklist-edits.ts`). [→](overview.md#edit-item) |
| **Item body** / **note** / **notes** / **add more text** | `notes` on `Item` (`src/domain/types.ts`); editor in `src/ui/ChecklistRowEditor.tsx`. [→](overview.md#edit-item) |
| **Markdown renderer** / **render markdown** / **markdown body** | `renderMarkdown` (`src/ui/markdown/renderMarkdown.tsx`). [→](overview.md#markdown-renderer) |
| **Add-item button** / **floating add button** / **the + button** | `src/ui/AddItemButton.tsx`. [→](overview.md#add-item-button)                                   |
| **Add-item form** / **composer** / **draft row**       | `src/ui/AddItemForm.tsx`. [→](overview.md#add-item-form)                                                 |
| **Archive view** / **the archive**                     | `src/ui/ArchiveView.tsx`. [→](overview.md#archive-view)                                                  |
| **Side menu** / **drawer** / **nav** / **sidebar**     | `src/ui/SideMenu.tsx`; `View`, `useNav` (`src/ui/nav-context.ts`); pinned-from-iPad layout via `pinned` + `useMediaQuery` (`src/ui/hooks/useMediaQuery.ts`). [→](overview.md#side-menu)            |
| **Swipe to remove** (sidebar) / **swipe a list/namespace away** | `useSwipeReveal` (`src/ui/hooks/useSwipeReveal.ts`); the `SwipeToRemove` wrapper in `src/ui/SideMenu.tsx`. [→](overview.md#swipe-to-remove-sidebar) |
| **Floating menu button** / **drag button** / **sidebar button** | `useDraggableMenuButton` (`src/ui/hooks/useDraggableMenuButton.ts`); `src/ui/sideMenuPosition.ts`; `showButton` in `nav-context.ts`. [→](overview.md#floating-menu-button) |
| **Edge swipe to open** / **swipe in from the edge**     | `useEdgeSwipeOpen` (`src/ui/hooks/useEdgeSwipeOpen.ts`). [→](overview.md#edge-swipe-to-open) |
| **Header menu** / **burger menu**                      | `src/ui/HeaderMenu.tsx`. [→](overview.md#header-menu)                                                    |
| **Checklist title** / **the list name** / **rename the list** | `src/ui/ChecklistTitle.tsx`. [→](overview.md#checklist-title)                                       |
| **Sync status** / **cloud glyph** / **sync icon**      | `src/ui/SyncStatus.tsx`. [→](overview.md#sync-status)                                                    |
| **Cloud sync modal** / **sync details** / **what went wrong with sync** | `src/ui/SyncDetailsModal.tsx`; host `src/app/modals/SyncDetailsModalHost.tsx`; bus command `{ kind: "sync-details" }`; `statusDetail` (`src/app/use-checklist-sync.ts`). [→](overview.md#cloud-sync-modal) |
| **Copy button** / **copy glyph** / **copy/paste glyph** / **copy the list** | `src/ui/CopyButton.tsx`; `checklistBodyMarkdown` (`src/storage/markdown/codec.ts`); `CopyIcon` (`src/ui/icons.tsx`). [→](overview.md#copy-checklist) |
| **Modal**                                              | `src/ui/Modal.tsx`. [→](overview.md#modal)                                                               |
| **Dropdown** / **custom dropdown** / **picker** / **custom select** | `SelectPicker` (`src/ui/form/SelectPicker.tsx`); `FloatingPanel` (`src/ui/FloatingPanel.tsx`), `DismissBackdrop` (`src/ui/DismissBackdrop.tsx`); `useFloatingPosition` (`src/ui/hooks/useFloatingPosition.ts`), `useEscapeKey` (`src/ui/hooks/useEscapeKey.ts`). [→](overview.md#dropdown--custom-select) |
| **Pull-to-refresh indicator**                          | `src/ui/PullToRefreshIndicator.tsx`. [→](overview.md#pull-to-refresh-indicator)                          |
| **Update toast** / **"new build ready"**               | `src/ui/UpdateToast.tsx`. [→](overview.md#update-toast)                                                  |
| **Toast** / **notification** / **disable toasts**       | `src/ui/toast/Toast.tsx` (`ToastProvider`; `disableToasts` gate), `src/ui/toast/useToast.ts` (`useToast`). [→](overview.md#toast) |

## Checklist model and operations

| Term                                              | Refers to                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Snapshot** / **the document**                   | `Snapshot`, `emptySnapshot` (`src/domain/types.ts`). [→](overview.md#snapshot)                     |
| **Checklist**                                      | `Checklist` (`src/domain/types.ts`); `src/domain/checklists.ts`. [→](overview.md#checklist)        |
| **Checklist item** / **item**                     | `Item`, `ChecklistItem` (`src/domain/types.ts`). [→](overview.md#checklist-item)                   |
| **Active checklist** / **active list**            | `activeList`, `activeChecklistId` (`src/app/use-checklist-lists.ts`); `withActiveList` (`src/app/use-checklist-sync.ts`). [→](overview.md#active-checklist--active-list) |
| **Checklist switcher** / **multiple checklists** / **switch checklist** / **add checklist** / **rename checklist** / **remove checklist** | `useChecklistLists` (`src/app/use-checklist-lists.ts`); `nextChecklistName`, `renameChecklist`, `createChecklist` (`src/domain/checklists.ts`); the checklists section in `src/ui/SideMenu.tsx`. [→](overview.md#checklist-switcher--multiple-checklists) |
| **use-checklist hook** / **app state**            | `useChecklist`, `UseChecklist` (`src/app/use-checklist.ts`). [→](overview.md#use-checklist-hook)   |
| **Add item**                                      | `addItem` (`src/domain/checklists.ts`). [→](overview.md#add-item)                                  |
| **Edit item** / **change item text** / **edit a note** | `editItem` (`src/domain/checklists.ts`); verb in `src/app/use-checklist-edits.ts`. [→](overview.md#edit-item) |
| **Import items** / **paste a checklist** / **paste to import** | `importItems` (`src/app/use-checklist-edits.ts`); `parseItemsFromMarkdown` (`src/storage/markdown/codec.ts`); `addItems` (`src/domain/checklists.ts`). [→](overview.md#import-items--paste-a-checklist) |
| **Toggle item** / **check off**                   | `toggleItem` (`src/domain/checklists.ts`). [→](overview.md#toggle-item)                            |
| **Delete item**                                   | `deleteItem` (`src/domain/checklists.ts`). [→](overview.md#delete-item)                            |
| **Archive / unarchive item**                      | `setArchived`, `activeItems`, `archivedItems`, `archivedByChecklist` (`src/domain/checklists.ts`). [→](overview.md#archive--unarchive-item) |
| **Archive finished** / **delete finished** / **bulk actions** / **clear checked** / **long-press the plus** | `archiveChecked`, `deleteChecked` (`src/domain/checklists.ts`); `archiveFinished`, `deleteFinished` (`src/app/use-checklist-edits.ts`); the long-press action row in `src/ui/AddItemButton.tsx`. [→](overview.md#archive--delete-finished) |
| **Reorder item** / **drag to reorder**            | `moveItem` (`src/domain/checklists.ts`); `useListReorder`. [→](overview.md#reorder-item)           |
| **Progress** / **completion** / **checked count** | `progress`, `isComplete` (`src/domain/checklists.ts`). [→](overview.md#progress--completion)       |

## Templates

| Term                                | Refers to                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| **Template**                        | `Template` (`src/domain/types.ts`); `src/domain/templates.ts`. [→](overview.md#template) |
| **Instantiate a template** / **stamp out** | `instantiate` (`src/domain/checklists.ts`). [→](overview.md#instantiate-a-template) |

## Sharing

| Term                                       | Refers to                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| **Share link** / **shareable URL** / **import a list** | `encodeChecklist`, `decodeChecklist` (`src/share/index.ts`). [→](overview.md#share-link--shareable-url) |
| **Example template**                       | `examples/<slug>.json`. [→](overview.md#example-template)                          |

## Settings and appearance

| Term                                       | Refers to                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| **Settings dialog**                        | `src/ui/settings/SettingsModal.tsx`; `TabId`. [→](overview.md#settings-dialog)     |
| **Settings store** / **preferences**       | `src/settings/store.ts`, `src/settings/useSettings.ts`; `Settings`. [→](overview.md#settings-store) |
| **Root settings file** / **settings.json** / **synced settings** | `src/storage/settings-store.ts` (`SettingsStore`, `SETTINGS_FILE_NAME`, `fileSettingsStore`); `create*SettingsStore` in `src/storage/{folder,dropbox,gdrive}/index.ts`; `settingsStore` on `useStorageBackend`. [→](overview.md#root-settings-file) |
| **General tab**                            | `src/ui/settings/tabs/general.tsx`. [→](overview.md#general-tab)                   |
| **Lists tab** / **list settings**          | `src/ui/settings/tabs/lists.tsx`. [→](overview.md#lists-tab)                       |
| **Appearance tab** / **theme tab**         | `src/ui/settings/tabs/appearance.tsx`. [→](overview.md#appearance--theme-tab)      |
| **Theme** / **font** / **text size** / **custom theme** | `src/theme/themes.ts`, `src/theme/useTheme.ts`, `src/theme/fonts.ts`. [→](overview.md#theme-engine) |

## Achievements

| The user says…                          | Code                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Achievements** / **trophies** / **unlockables** | `ACHIEVEMENTS`, `ACHIEVEMENT_BY_ID` (`src/achievements/catalog.ts`); barrel `src/achievements/index.ts`. [→](overview.md#achievements) |
| **Achievement tiers** / **Beginner / Intermediate / Pro / Expert** / **points** | `AchievementTier`, `TIER_POINTS`, `TIER_ORDER` (`src/achievements/types.ts`). [→](overview.md#achievements) |
| **Trophy button** / **achievements badge** / **the trophy** | `TrophyButton` (`src/ui/achievements/TrophyButton.tsx`); `AchievementsContext` (`src/ui/achievements/achievements-context.ts`). [→](overview.md#achievements) |
| **Achievements modal** / **the achievements list** / **the tour** | `AchievementsModal` (`src/ui/achievements/AchievementsModal.tsx`); host `AchievementsModalHost` (`src/app/modals/AchievementsModalHost.tsx`); `{ kind: "achievements" }` on the modal bus. [→](overview.md#achievements) |
| **Unlock modal** / **achievement unlocked popup** / **new achievements** | `AchievementUnlockModal` (`src/ui/achievements/AchievementUnlockModal.tsx`); host `AchievementsUnlockModalHost` (`src/app/modals/AchievementsUnlockModalHost.tsx`); `{ kind: "achievements-unlock" }` on the modal bus. [→](overview.md#achievements) |
| **Unlock an achievement** / **achievement watcher** / **unlock toast** | `useAchievementWatcher` (`src/achievements/useAchievementWatcher.ts`); `deriveUnlocks` (`src/achievements/derive.ts`); manual-unlock bus `unlock` (`src/achievements/bus.ts`); `unlockAchievements` / `clearUnseenAchievements`, `Settings.achievements` / `unseenAchievements` (`src/settings/`). [→](overview.md#achievements) |
| **Achievement glyph** | inline SVGs in `src/achievements/glyphs.tsx` (`Glyph`). [→](overview.md#achievements) |

## Storage and sync

| Term                                                  | Refers to                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Storage adapter** / **backend contract**           | `StorageAdapter`, `AdapterCapability`, `ConflictError`, `AuthError`, `RateLimitError` (`src/storage/adapter.ts`). [→](overview.md#storage-adapter) |
| **useStorageBackend** / **active backend**           | `src/storage/useStorageBackend.ts`. [→](overview.md#usestoragebackend-hook)        |
| **Namespace** / **namespaces** / **default namespace** | `Namespace`, `getNamespaces`, `addNamespace`, `namespaceLocalKey`, `namespaceCloudFolder`, `DEFAULT_NAMESPACE_SLUG` (`src/storage/namespaces.ts`). [→](overview.md#namespaces) |
| **Namespaces dialog** / **manage namespaces** / **new namespace** | `NamespacesModal` (`src/ui/NamespacesModal.tsx`); the namespace section in `src/ui/SideMenu.tsx`. [→](overview.md#namespaces) |
| **Namespace glyph** / **namespace icon** / **namespace colour** / **pick an icon** / **colour picker** | `glyph` / `color` on `Namespace`, `setNamespaceAppearance` (`src/storage/namespaces.ts`); `GLYPH_PATHS`, `NAMESPACE_GLYPH_NAMES`, `namespaceGlyphDataUri` (`src/ui/glyphs.ts`); `NamespaceGlyph` (`src/ui/NamespaceGlyph.tsx`); `ColorPalette` (`src/ui/ColorPalette.tsx`), `NAMESPACE_COLORS` (`src/ui/namespace-colors.ts`); `GlyphGrid` (`src/ui/GlyphGrid.tsx`). [→](overview.md#namespace-glyph-and-favicon) |
| **Namespace favicon** / **app logo** / **re-badge the app** | `namespaceLogoSrc`, `applyFaviconHref` (`src/ui/namespace-favicon.ts`); `logoSrc` on `ChecklistContextValue` (`src/ui/checklist-context.ts`), read by `src/ui/ChecklistView.tsx`. [→](overview.md#namespace-glyph-and-favicon) |
| **Storage tab**                                       | `src/ui/settings/tabs/storage.tsx`. [→](overview.md#storage-tab)                   |
| **Local backend** / **This device**                  | `BrowserLocalStorageAdapter` (`src/storage/local/index.ts`); key `checklist:v1`. [→](overview.md#local-backend--this-device) |
| **Local folder backend** / **folder**                | `createFolderAdapter` (`src/storage/folder/index.ts`), handle persistence in `src/storage/folder/handle-store.ts`. [→](overview.md#local-folder-backend) |
| **Markdown file store** / **directory adapter**      | `createDirectoryAdapter` (`src/storage/directory-adapter.ts`), `FileStore` (`src/storage/file-store.ts`), codec (`src/storage/markdown/codec.ts`). [→](overview.md#markdown-file-store) |
| **Dropbox backend**                                  | `src/storage/dropbox/index.ts`. [→](overview.md#dropbox-backend)                  |
| **Google Drive backend** / **gdrive**                | `src/storage/gdrive/index.ts`. [→](overview.md#google-drive-backend)              |
| **iCloud backend** / **iCloud (iOS)** / **native storage picker** | `ICloudStorageAdapter` (`native/src/storage/icloudStorageAdapter.ts`); platform gate + registry in `native/src/storage/backends.ts`; per-device choice in `native/src/storage/backendPreference.ts`; picker in `native/src/components/ListSwitcher.tsx`. [→](overview.md#icloud-backend-ios) |
| **At-rest encryption** / **passphrase** / **unlock** | `withEncryption` (`src/storage/encrypting/index.ts`), `src/storage/crypto.ts`, `src/ui/UnlockGate.tsx`. [→](overview.md#at-rest-encryption--unlock) |
| **OAuth (PKCE)**                                     | `src/storage/oauth-pkce.ts`. [→](overview.md#oauth-pkce)                          |
| **Serialize / parse**                                | `serialize`, `parse` (`src/storage/serialize.ts`). [→](overview.md#serialize--parse) |
| **Migrations**                                       | `migrate`, `LATEST_VERSION` (`src/storage/migrations.ts`). [→](overview.md#migrations) |
| **Sync status** / **save state**                     | `SaveStatus`, `dirty`, `saveNow` (`src/app/use-checklist-sync.ts`). [→](overview.md#sync-status--save-state) |
| **Reload** / **pull to refresh**                     | `useChecklist.reload`; `usePullToRefresh` (`src/ui/hooks/usePullToRefresh.ts`). [→](overview.md#reload--pull-to-refresh) |
| **Conflict resolution** / **keep mine / keep theirs**| `ConflictResolutionModal` (`src/ui/ConflictResolutionModal.tsx`); `ConflictState`, `resolveConflict` (`src/app/use-checklist-sync.ts`). [→](overview.md#conflict-resolution) |

## Undo / redo

| Term                          | Refers to                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- |
| **Undo / redo** / **actions history** | `useUndoRedo` (`src/app/use-undo-redo.ts`), `HistoryEntry` (snapshot + action label); `useUndoRedoShortcuts` (`src/ui/hooks/useUndoRedoShortcuts.ts`). [→](overview.md#undo--redo) |
| **Action confirmation toast** / **"what just happened"** | `Notify` (`src/app/notify.ts`); `notify` threaded through `useChecklist` → `useChecklistEdits` / `useChecklistLists`; `toast.*` keys (`src/i18n/locales/en/toast.ts`). [→](overview.md#action-confirmation-toast) |

## Dev mode

| Term                                   | Refers to                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| **Dev mode** / **fake data**           | `useDevMode` (`src/dev/useDevMode.ts`), `useDevSeed` (`src/dev/useDevSeed.ts`), `createDevSeedAdapter` (`src/storage/dev-seed/index.ts`), `buildSeedSnapshot` (`src/dev/seed.ts`); `src/ui/settings/tabs/developer.tsx`. [→](overview.md#dev-mode--fake-data) |
| **Logger** / **log capture** / **logs tab** | `src/dev/logger.ts`; `src/ui/settings/tabs/logs.tsx`. [→](overview.md#logger--log-capture) |

## i18n

| Term                                         | Refers to                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| **Translations** / **language** / **i18n**   | `src/i18n/index.ts` (`useT`, `tFor`, `MessageKey`), `src/i18n/locale.ts` (`Lang`), `src/i18n/language-preference.ts`, `src/i18n/LanguageRoot.tsx`; catalogs under `src/i18n/locales/`. [→](overview.md#translations--language) |

## PWA

| Term                                              | Refers to                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Service worker** / **app update** / **install** | `usePwaUpdate` (`src/pwa/usePwaUpdate.ts`); manifest + icons in `vite.config.ts`. [→](overview.md#service-worker--app-update) |
| **Standalone-mobile detection** / **PWA on Android/iOS** | `isStandaloneMobile`, `useStandaloneMobile` (`src/pwa/standalone.ts`). [→](overview.md#standalone-mobile-detection) |
| **Changelog** / **what's new**                    | `src/ui/changelog/ChangelogModal.tsx`, `src/ui/changelog/data.ts`, `parseChangelog` (`src/ui/changelog/parse.ts`). [→](overview.md#changelog--whats-new) |
| **Privacy page** / **privacy policy**             | `src/ui/PrivacyPage.tsx` (route `/privacy`). [→](overview.md#privacy-page)         |

## Workflows / verbs the user might say

| Term                              | Refers to                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------- |
| **Add an item**                   | `AddItemButton` → inline `AddItemForm` → `addItem`. [→](overview.md#add-an-item)   |
| **Check / uncheck an item**       | row checkbox → `toggleItem`. [→](overview.md#check--uncheck-an-item)               |
| **Edit an item / its body**       | press the row → `ChecklistRowEditor` → `editItem`. [→](overview.md#edit-item)      |
| **Delete an item**                | swipe-left → `deleteItem`. [→](overview.md#delete-an-item)                         |
| **Archive an item**               | swipe-right → `setArchived(…, true)`. [→](overview.md#archive-an-item)             |
| **Archive / delete finished items** | long-press the add (+) button → `archiveFinished` / `deleteFinished`. [→](overview.md#archive--delete-finished) |
| **Restore an item**               | archive view → `setArchived(…, false)`. [→](overview.md#restore-an-item)          |
| **Reorder items**                 | grip drag → `useListReorder` → `moveItem`. [→](overview.md#reorder-items)          |
| **Remove a checklist**            | side-menu swipe-left → trash → `removeChecklist`. [→](overview.md#remove-a-checklist) |
| **Remove a namespace**            | side-menu swipe-left → trash → confirm tap → `removeNamespace`. [→](overview.md#remove-a-namespace) |
| **Undo / redo**                   | side menu / keyboard. [→](overview.md#undo--redo-1)                                |
| **Pull to refresh**               | `usePullToRefresh` → `reload`. [→](overview.md#pull-to-refresh)                    |
| **Open settings**                 | header menu / sync glyph → `SettingsModal`. [→](overview.md#open-settings)         |
| **Switch storage backend**        | Settings → Storage. [→](overview.md#switch-storage-backend)                        |
| **Turn on encryption**            | Settings → Storage → encryption. [→](overview.md#turn-on-encryption)              |
| **Resolve a conflict**            | `ConflictResolutionModal`. [→](overview.md#resolve-a-conflict)                     |
| **Share a list**                  | `encodeChecklist` (UI on roadmap). [→](overview.md#share-a-list)                   |
| **Use a template**                | `instantiate` (UI on roadmap). [→](overview.md#use-a-template)                     |

## Conventions for editing this file

- One row per term, grouped by the sections above. The left column
  carries every alias the user might say; the right column is the most
  specific file path plus the symbols an agent would grep for, then a
  `[→](overview.md#anchor)` link to the term's overview entry.
- Keep the right column to file + symbols + the link — no prose gloss.
  The description (and any mechanics) goes in the matching `overview.md`
  section, not here.
- Every row links to an `overview.md` entry, and every overview entry
  has a row here. Add or update both **in the same pull request** as
  the code change that introduced or renamed the term.
- Don't duplicate `docs/architecture.md`'s module / persisted-shape
  inventory. Link by file path; readers who need the why follow the
  overview link.
