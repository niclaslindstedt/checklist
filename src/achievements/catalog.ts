// The achievement catalog — the single source of truth for which features
// are unlockable, what tier each sits in, which glyph it wears, and how its
// unlock fires. Adapted from the budget project's
// `src/data/achievements/catalog.ts`, scaled to the checklist's surface.
//
// Display strings (name / condition / optional learnMore) live in
// `src/i18n/locales/{en,sv}/achievements.ts` under `achievements.catalog.<id>.*`;
// the renderer composes the lookup by `id`. `hasLearnMore: true` flags entries
// that carry an expanded body.

import type { ChecklistItem, Snapshot } from "../domain/types.ts";
import {
  AccessibilityGlyph,
  ArchiveGlyph,
  ArrowUpDownGlyph,
  AsteriskGlyph,
  BellOffGlyph,
  BoxesGlyph,
  CheckGlyph,
  CloudGlyph,
  CloudOffGlyph,
  CloudSearchGlyph,
  CodeGlyph,
  CopyGlyph,
  EyeOffGlyph,
  FlaskGlyph,
  FolderGlyph,
  FolderInputGlyph,
  FolderMoveGlyph,
  GlobeGlyph,
  HashGlyph,
  LayersGlyph,
  LockGlyph,
  MedalGlyph,
  MergeGlyph,
  MoveGlyph,
  NoteGlyph,
  PaletteGlyph,
  PasteGlyph,
  PencilGlyph,
  PlusGlyph,
  RefreshGlyph,
  RestoreGlyph,
  SaveGlyph,
  ScaleTextGlyph,
  SmartphoneGlyph,
  SparklesGlyph,
  TrashGlyph,
  TypeGlyph,
  UndoGlyph,
  WandGlyph,
  WorkflowGlyph,
} from "./glyphs.tsx";
import type { Achievement } from "./types.ts";

// ── Pure predicate helpers over the persisted document ─────────────────────
// Each walks the snapshot once and returns a boolean; "first time"
// achievements derive as `!hasX(prev) && hasX(next)` in their trigger. Kept
// inline so the catalog is the one file an agent reads when adding an entry.

function someItem(
  snap: Snapshot,
  fn: (item: ChecklistItem) => boolean,
): boolean {
  const walk = (items: readonly ChecklistItem[]): boolean => {
    for (const item of items) {
      if (fn(item)) return true;
      if (item.children && walk(item.children)) return true;
    }
    return false;
  };
  for (const list of snap.checklists) {
    if (walk(list.items)) return true;
  }
  return false;
}

const hasAnyItem = (snap: Snapshot) => someItem(snap, () => true);
const hasCheckedItem = (snap: Snapshot) => someItem(snap, (it) => it.checked);
const hasNotedItem = (snap: Snapshot) =>
  someItem(snap, (it) => typeof it.notes === "string" && it.notes !== "");
const hasRequiredItem = (snap: Snapshot) =>
  someItem(snap, (it) => it.required === true);
const hasArchivedItem = (snap: Snapshot) =>
  someItem(snap, (it) => it.archived === true);
const hasMultipleChecklists = (snap: Snapshot) => snap.checklists.length > 1;
const hasArchivedChecklist = (snap: Snapshot) =>
  snap.checklists.some((c) => c.archived === true);
const hasFolder = (snap: Snapshot) => (snap.folders?.length ?? 0) > 0;
const hasFiledChecklist = (snap: Snapshot) =>
  snap.checklists.some(
    (c) => typeof c.folderId === "string" && c.folderId !== "",
  );

export const ACHIEVEMENTS: readonly Achievement[] = [
  // ──────────────────────────────────────────────────────────────
  // Beginner — "I just opened the app. What do I do?"
  // ──────────────────────────────────────────────────────────────
  {
    id: "firstSteps",
    tier: "beginner",
    glyph: PlusGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.snapshot],
      predicate: (prev, next) =>
        !hasAnyItem(prev.snapshot) && hasAnyItem(next.snapshot),
    },
  },
  {
    id: "checkItOff",
    tier: "beginner",
    glyph: CheckGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.snapshot],
      predicate: (prev, next) =>
        !hasCheckedItem(prev.snapshot) && hasCheckedItem(next.snapshot),
    },
  },
  {
    id: "noteToSelf",
    tier: "beginner",
    glyph: NoteGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.snapshot],
      predicate: (prev, next) =>
        !hasNotedItem(prev.snapshot) && hasNotedItem(next.snapshot),
    },
  },
  {
    id: "nonNegotiable",
    tier: "beginner",
    glyph: AsteriskGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.snapshot],
      predicate: (prev, next) =>
        !hasRequiredItem(prev.snapshot) && hasRequiredItem(next.snapshot),
    },
  },
  {
    id: "interiorDesigner",
    tier: "beginner",
    glyph: PaletteGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.theme],
      predicate: (prev, next) => prev.settings.theme !== next.settings.theme,
    },
  },
  {
    id: "biggerPicture",
    tier: "beginner",
    glyph: ScaleTextGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.fontScale],
      predicate: (prev, next) =>
        prev.settings.fontScale !== next.settings.fontScale,
    },
  },
  {
    id: "renamed",
    tier: "beginner",
    glyph: PencilGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "wordsmith",
    tier: "beginner",
    glyph: TypeGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "secondThoughts",
    tier: "beginner",
    glyph: UndoGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "homeScreen",
    tier: "beginner",
    glyph: SmartphoneGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },

  // ──────────────────────────────────────────────────────────────
  // Intermediate — "I want to organise more than one list."
  // ──────────────────────────────────────────────────────────────
  {
    id: "listMaker",
    tier: "intermediate",
    glyph: LayersGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.snapshot.checklists],
      predicate: (prev, next) =>
        !hasMultipleChecklists(prev.snapshot) &&
        hasMultipleChecklists(next.snapshot),
    },
  },
  {
    id: "folderMade",
    tier: "intermediate",
    glyph: FolderGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.snapshot.folders],
      predicate: (prev, next) =>
        !hasFolder(prev.snapshot) && hasFolder(next.snapshot),
    },
  },
  {
    id: "filed",
    tier: "intermediate",
    glyph: BoxesGlyph,
    trigger: {
      kind: "derived",
      slices: (s) => [s.snapshot.checklists],
      predicate: (prev, next) =>
        !hasFiledChecklist(prev.snapshot) && hasFiledChecklist(next.snapshot),
    },
  },
  {
    id: "archivist",
    tier: "intermediate",
    glyph: ArchiveGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.snapshot],
      predicate: (prev, next) =>
        !hasArchivedItem(prev.snapshot) && hasArchivedItem(next.snapshot),
    },
  },
  {
    id: "tidyShelves",
    tier: "intermediate",
    glyph: ArchiveGlyph,
    trigger: {
      kind: "derived",
      slices: (s) => [s.snapshot.checklists],
      predicate: (prev, next) =>
        !hasArchivedChecklist(prev.snapshot) &&
        hasArchivedChecklist(next.snapshot),
    },
  },
  {
    id: "comeback",
    tier: "intermediate",
    glyph: RestoreGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "reshuffle",
    tier: "intermediate",
    glyph: ArrowUpDownGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "nestEgg",
    tier: "intermediate",
    glyph: WorkflowGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "cleanSlate",
    tier: "intermediate",
    glyph: TrashGlyph,
    trigger: { kind: "manual" },
  },
  {
    id: "springClean",
    tier: "intermediate",
    glyph: ArchiveGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "cleanSweep",
    tier: "intermediate",
    glyph: TrashGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "copyThat",
    tier: "intermediate",
    glyph: CopyGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "pasteList",
    tier: "intermediate",
    glyph: PasteGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "topThis",
    tier: "intermediate",
    glyph: ArrowUpDownGlyph,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.addItemPosition],
      predicate: (prev, next) =>
        prev.settings.addItemPosition !== next.settings.addItemPosition,
    },
  },
  {
    id: "sinkOrSwim",
    tier: "intermediate",
    glyph: ArrowUpDownGlyph,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.sortCheckedToBottom],
      predicate: (prev, next) =>
        !prev.settings.sortCheckedToBottom && next.settings.sortCheckedToBottom,
    },
  },
  {
    id: "menuMover",
    tier: "intermediate",
    glyph: MoveGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.menuButtonPosition],
      predicate: (prev, next) =>
        prev.settings.menuButtonPosition.side !==
          next.settings.menuButtonPosition.side ||
        prev.settings.menuButtonPosition.y !==
          next.settings.menuButtonPosition.y,
    },
  },
  {
    id: "fontFanatic",
    tier: "intermediate",
    glyph: TypeGlyph,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.fontFamily],
      predicate: (prev, next) =>
        prev.settings.fontFamily !== next.settings.fontFamily,
    },
  },

  // ──────────────────────────────────────────────────────────────
  // Pro — "Make it sync, keep it tidy, take it everywhere."
  // ──────────────────────────────────────────────────────────────
  {
    id: "compartments",
    tier: "pro",
    glyph: BoxesGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "dressUp",
    tier: "pro",
    glyph: SparklesGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "relocated",
    tier: "pro",
    glyph: FolderInputGlyph,
    trigger: { kind: "manual" },
  },
  {
    id: "movedHouse",
    tier: "pro",
    glyph: FolderMoveGlyph,
    trigger: { kind: "manual" },
  },
  {
    id: "localVault",
    tier: "pro",
    glyph: FolderGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "cloudWalker",
    tier: "pro",
    glyph: CloudGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "freshPull",
    tier: "pro",
    glyph: RefreshGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "syncSleuth",
    tier: "pro",
    glyph: CloudSearchGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "trustButVerify",
    tier: "pro",
    glyph: SaveGlyph,
    trigger: { kind: "manual" },
  },
  {
    id: "peacemaker",
    tier: "pro",
    glyph: MergeGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "offGrid",
    tier: "pro",
    glyph: CloudOffGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "quietLife",
    tier: "pro",
    glyph: BellOffGlyph,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.disableToasts],
      predicate: (prev, next) =>
        !prev.settings.disableToasts && next.settings.disableToasts,
    },
  },

  // ──────────────────────────────────────────────────────────────
  // Expert — "Bend the app to my exact workflow."
  // ──────────────────────────────────────────────────────────────
  {
    id: "paranoidMode",
    tier: "expert",
    glyph: LockGlyph,
    hasLearnMore: true,
    trigger: { kind: "manual" },
  },
  {
    id: "themeWizard",
    tier: "expert",
    glyph: WandGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.theme],
      predicate: (prev, next) =>
        prev.settings.theme !== "custom" && next.settings.theme === "custom",
    },
  },
  {
    id: "stillness",
    tier: "expert",
    glyph: AccessibilityGlyph,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.customTheme],
      predicate: (prev, next) =>
        !prev.settings.customTheme.reduceMotion &&
        next.settings.customTheme.reduceMotion,
    },
  },
  {
    id: "minimalist",
    tier: "expert",
    glyph: EyeOffGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.showMenuButton],
      predicate: (prev, next) =>
        prev.settings.showMenuButton && !next.settings.showMenuButton,
    },
  },
  {
    id: "bareBones",
    tier: "expert",
    glyph: NoteGlyph,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.disableItemNotes],
      predicate: (prev, next) =>
        !prev.settings.disableItemNotes && next.settings.disableItemNotes,
    },
  },
  {
    id: "lostCount",
    tier: "expert",
    glyph: HashGlyph,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.showItemCount],
      predicate: (prev, next) =>
        prev.settings.showItemCount && !next.settings.showItemCount,
    },
  },
  {
    id: "copyTheArchive",
    tier: "expert",
    glyph: ArchiveGlyph,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.includeArchivedInCopy],
      predicate: (prev, next) =>
        !prev.settings.includeArchivedInCopy &&
        next.settings.includeArchivedInCopy,
    },
  },
  {
    id: "capitalIdea",
    tier: "expert",
    glyph: TypeGlyph,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.capitalizeItems],
      predicate: (prev, next) =>
        !prev.settings.capitalizeItems && next.settings.capitalizeItems,
    },
  },
  {
    id: "underTheHood",
    tier: "expert",
    glyph: CodeGlyph,
    trigger: { kind: "manual" },
  },
  {
    id: "holodeck",
    tier: "expert",
    glyph: FlaskGlyph,
    trigger: { kind: "manual" },
  },
  {
    id: "polyglot",
    tier: "expert",
    glyph: GlobeGlyph,
    trigger: { kind: "manual" },
  },
  {
    id: "completionist",
    tier: "expert",
    glyph: MedalGlyph,
    hasLearnMore: true,
    trigger: {
      kind: "derived",
      slices: (s) => [s.settings.achievements],
      predicate: (prev, next) => {
        // Count against the catalog length minus one (this entry itself),
        // so unlocking every *other* achievement fires it without a
        // self-referential loop.
        const totalOthers = ACHIEVEMENTS.length - 1;
        const prevCount = Object.keys(prev.settings.achievements).length;
        const nextCount = Object.keys(next.settings.achievements).length;
        return prevCount < totalOthers && nextCount >= totalOthers;
      },
    },
  },
] as const;

// Catalog lookup by id. The watcher hands us ids from the bus and from
// `deriveUnlocks`; both consult this map to skip ids that don't match a
// known entry (forward compatibility for older builds reading newer data,
// or typo-guarding manual `unlock` callers).
export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, Achievement> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
