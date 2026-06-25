import type { Widen } from "./_widen";

// Strings for the achievements feature — the header trophy button, the
// unlock toast, the four-tier tour chrome, and the per-achievement catalog.
// Mirrors the budget project's achievements namespace, scaled to the
// checklist's catalog. The runtime reads `catalog.<id>.{name,condition,
// learnMore}` by id (see `src/ui/achievements/AchievementsModal.tsx`); the
// Swedish file mirrors this shape key-for-key.

const achievements = {
  button: {
    open: "Achievements",
    unseenOne: "1 new achievement",
    unseenOther: "{n} new achievements",
  },
  toast: {
    unlockedOne: "Achievement unlocked: {name}",
    unlockedOther: "{n} achievements unlocked!",
  },
  unlockModal: {
    titleOne: "Achievement unlocked!",
    titleOther: "{n} achievements unlocked!",
    dismiss: "Awesome!",
  },
  modal: {
    title: "Achievements",
    counter: "{unlocked} of {total} unlocked · {earned} / {max} pts",
    intro:
      "Every feature in the app is an achievement. Do the thing once and it unlocks. Four tiers, from just opening the app to bending it to your workflow — pick whichever is next for you.",
    tierPoints: "· {earned} / {max} pts",
    learnMore: "Learn more",
    locked: "Locked",
    tier: {
      beginner: {
        title: "Beginner",
        subtitle: "You just opened the app. What do you do?",
      },
      intermediate: {
        title: "Intermediate",
        subtitle: "You want to organise more than one list.",
      },
      pro: {
        title: "Pro",
        subtitle: "Make it sync, keep it tidy, take it everywhere.",
      },
      expert: {
        title: "Expert",
        subtitle: "Bend the app to your exact workflow.",
      },
    },
  },
  catalog: {
    // ── Beginner ──────────────────────────────────────────────────────
    firstSteps: {
      name: "First Steps",
      condition: "Add your first item.",
      learnMore:
        "Tap the add button, type a task, press Enter. That's a checklist item — the core loop the whole app is built around.",
    },
    checkItOff: {
      name: "Check, Please",
      condition: "Tick an item off.",
      learnMore:
        "Tap an item's box to mark it done. The header count tracks how many of the list's items are checked.",
    },
    noteToSelf: {
      name: "Note to Self",
      condition: "Add a note to an item.",
      learnMore:
        "An item can carry a longer note beneath its title — the detail you don't want in the headline but don't want to forget either.",
    },
    nonNegotiable: {
      name: "Non-Negotiable",
      condition: "Mark an item required.",
      learnMore:
        "Required items are the ones a list can't be considered done without — the don't-leave-without-it essentials.",
    },
    interiorDesigner: {
      name: "Interior Designer",
      condition: "Switch to a different theme.",
      learnMore:
        "Settings → Appearance carries One Dark, One Light, Dracula, Monokai, GitHub, Solarized, and more. The Custom theme in the Expert tier stacks on top.",
    },
    biggerPicture: {
      name: "Bigger Picture",
      condition: "Change the text size.",
      learnMore:
        "The Appearance tab scales the whole interface in four steps, from 90% to 125% — handy on a small phone or a far-away monitor.",
    },
    renamed: {
      name: "Name Tag",
      condition: "Rename a checklist.",
      learnMore:
        "Tap the list's title in the header to rename it — a fresh list starts life as plain “Checklist”.",
    },
    wordsmith: {
      name: "Wordsmith",
      condition: "Edit an item's text.",
      learnMore:
        "Press an item to edit it in place — fix a typo, reword it, or add a markdown note beneath the title (Shift+Enter, or “Add a note” in the editor). A note renders as markdown; tap an item to reveal it, tap again to edit.",
    },
    secondThoughts: {
      name: "Second Thoughts",
      condition: "Undo an action.",
      learnMore:
        "⌘Z (or the side-menu Undo) walks back the last change. Every edit, check, archive, and delete is reversible — undo is the safety net.",
    },
    homeScreen: {
      name: "Home Screen",
      condition: "Install the app on your device.",
      learnMore:
        "On iPhone / iPad in Safari: share-sheet → Add to Home Screen. On Android and desktop Chromium: the install hint in the address bar. Installed, the app runs in its own window with no browser chrome.",
    },

    // ── Intermediate ──────────────────────────────────────────────────
    listMaker: {
      name: "List Maker",
      condition: "Keep more than one checklist.",
      learnMore:
        "The “+” on the side menu's action bar adds another list. Each is independent; the switcher badges every list with its remaining count.",
    },
    folderMade: {
      name: "Pigeonholed",
      condition: "Create a folder.",
      learnMore:
        "The folder button on the side menu's action bar makes a new folder, then a list can be filed inside it. Folders group your checklists within a namespace — collapse one to tuck its lists away — and on the file and cloud backends each folder is a real directory of markdown files you can browse with any tool.",
    },
    filed: {
      name: "Filed Away",
      condition: "Move a checklist into a folder.",
    },
    archivist: {
      name: "Archivist",
      condition: "Archive an item.",
      learnMore:
        "Swipe an item right (or use its menu) to archive it — it drops out of the active list without being destroyed. The Archive view restores or deletes archived items.",
    },
    tidyShelves: {
      name: "Tidy Shelves",
      condition: "Archive a whole checklist.",
    },
    comeback: {
      name: "Comeback",
      condition: "Restore an item from the archive.",
      learnMore:
        "The Archive view (foot of the side menu) lists everything you've archived, grouped by source list. Restore puts an item back where it came from.",
    },
    reshuffle: {
      name: "Reshuffle",
      condition: "Drag an item to reorder it.",
      learnMore:
        "Grab an item by its drag handle and drop it elsewhere in the list. Order is yours to set — the app never re-sorts behind your back.",
    },
    nestEgg: {
      name: "Nest Egg",
      condition:
        "Make an item a sub-item — drag it onto another, or use Add sub-item.",
      learnMore:
        "Drag an item and release it over the middle of another to tuck it underneath as a sub-item — drop near an edge to drop it alongside instead. Or, while editing an item, tap Add sub-item to start a composer nested right under it. A parent indents its children and carries an expand caret to fold them away; checking the parent checks the whole group, and checked items sink to the bottom within each sub-list of their own.",
    },
    cleanSlate: {
      name: "Clean Slate",
      condition: "Remove a checklist.",
    },
    springClean: {
      name: "Spring Clean",
      condition: "Archive every finished item at once.",
      learnMore:
        "Long-press the add (+) button to fan out the bulk actions, then tap Archive finished — every checked item drops into the archive in one sweep.",
    },
    cleanSweep: {
      name: "Clean Sweep",
      condition: "Delete every finished item at once.",
      learnMore:
        "Long-press the add (+) button and tap Delete finished — one tap clears every checked item from the list in one go, and undo brings them back if you slipped.",
    },
    allIn: {
      name: "All In",
      condition: "Check off a whole list at once.",
    },
    copyThat: {
      name: "Copy That",
      condition: "Copy a checklist to the clipboard.",
      learnMore:
        "The copy button puts the whole list on the clipboard as plain task-list markdown (“- [ ]” / “- [x]”), ready to paste into any notes app or message.",
    },
    pasteList: {
      name: "Paste & Go",
      condition: "Build a list by pasting markdown.",
      learnMore:
        "Paste a markdown task list into the add-item row and every “- [ ]” / “- [x]” line lands as its own item — a whole checklist in one paste.",
    },
    topThis: {
      name: "Top of the List",
      condition: "Change where new items land.",
    },
    sinkOrSwim: {
      name: "Sink or Swim",
      condition: "Sort checked items to the bottom.",
    },
    menuMover: {
      name: "Rearranger",
      condition: "Drag the floating menu button to a new spot.",
      learnMore:
        "The round navigation button is draggable — park it on whichever edge and height suits your thumb. Its resting spot is remembered.",
    },
    fontFanatic: {
      name: "Font Fanatic",
      condition: "Change the font family.",
    },

    // ── Pro ───────────────────────────────────────────────────────────
    compartments: {
      name: "Compartments",
      condition: "Create a namespace.",
      learnMore:
        "Namespaces keep separate worlds of lists side by side — work and home, say — each its own document. The Namespace heading's “+” makes one.",
    },
    dressUp: {
      name: "Dress Up",
      condition: "Give a namespace an icon or colour.",
      learnMore:
        "A namespace can wear its own glyph and accent colour; the chosen mark badges the side menu and the browser-tab favicon so you can tell your worlds apart at a glance.",
    },
    relocated: {
      name: "Relocated",
      condition: "Drag a checklist into another namespace.",
    },
    movedHouse: {
      name: "Moving Day",
      condition: "Drag a whole folder into another namespace.",
    },
    localVault: {
      name: "Local Vault",
      condition: "Store your lists in a local folder.",
      learnMore:
        "The folder backend saves each list as a plain markdown file in a folder you pick — readable, syncable through your own tooling, and entirely yours.",
    },
    cloudWalker: {
      name: "Cloud Walker",
      condition: "Connect a cloud backend.",
      learnMore:
        "Dropbox or Google Drive keeps your lists in sync across devices. No account here — you connect your own cloud, and the app talks only to it.",
    },
    freshPull: {
      name: "Fresh Pull",
      condition: "Pull down to refresh.",
      learnMore:
        "On a sync backend, a downward pull from the top of the list re-reads the latest copy — the way to pick up an edit you made on another device.",
    },
    syncSleuth: {
      name: "Sync Sleuth",
      condition: "Open the cloud sync details from the header cloud button.",
      learnMore:
        "Tapping the header cloud glyph opens the sync details: what the backend is doing and, when a save fails, exactly why — plus a way to reconnect, retry, or re-check the connection without leaving the list.",
    },
    trustButVerify: {
      name: "Trust, But Verify",
      condition: "Trigger a manual save.",
    },
    peacemaker: {
      name: "Peacemaker",
      condition: "Resolve a sync conflict.",
      learnMore:
        "When two devices edit the same list before syncing, the app asks which copy wins rather than silently picking — you keep yours or take theirs.",
    },
    offGrid: {
      name: "Off the Grid",
      condition: "Open your lists while offline.",
      learnMore:
        "A cloud backend keeps a copy of your lists on this device, so you can unlock, read, and edit them with no connection at all — on a plane, in a tunnel, anywhere. Your changes are saved locally and sync back to the cloud the moment you're online again.",
    },
    quietLife: {
      name: "Quiet Life",
      condition: "Silence the toast notifications.",
    },

    // ── Expert ────────────────────────────────────────────────────────
    paranoidMode: {
      name: "Paranoid Mode",
      condition: "Encrypt your data with a passphrase.",
      learnMore:
        "At-rest encryption seals your lists behind a passphrase held only in memory for the session. Lose the passphrase and the data is unreadable — that's the point.",
    },
    themeWizard: {
      name: "Theme Wizard",
      condition: "Build a fully custom theme.",
      learnMore:
        "The Custom theme exposes every colour slot plus radius, density, and border weight — tune the whole look to taste, seeded from whichever preset you were on.",
    },
    stillness: {
      name: "Stillness",
      condition: "Turn on reduced motion.",
    },
    minimalist: {
      name: "Minimalist",
      condition: "Hide the floating navigation button.",
      learnMore:
        "In the installed PWA on a phone or tablet you can hide the round button entirely and open the menu with an inward edge swipe instead — nothing floating over your list.",
    },
    bareBones: {
      name: "Bare Bones",
      condition: "Switch item notes off.",
    },
    lostCount: {
      name: "Lost Count",
      condition: "Hide the item count in the list header.",
    },
    copyTheArchive: {
      name: "Copy the Archive",
      condition: "Turn on including archived items when you copy a list.",
    },
    capitalIdea: {
      name: "Capital Idea",
      condition: "Turn on capitalising the first letter of each item.",
    },
    underTheHood: {
      name: "Under the Hood",
      condition: "Turn on developer mode.",
    },
    holodeck: {
      name: "Holodeck",
      condition: "Load the sample data set.",
    },
    polyglot: {
      name: "Polyglot",
      condition: "Switch the app's language.",
    },
    completionist: {
      name: "Completionist",
      condition: "Unlock every other achievement.",
      learnMore:
        "You found and used every feature the app has — from the first item to a custom-themed, encrypted, cloud-synced, multi-namespace setup. There's nothing left to discover. Nice.",
    },
  },
} as const;

export type AchievementsCatalog = Widen<typeof achievements>;

export default achievements;
