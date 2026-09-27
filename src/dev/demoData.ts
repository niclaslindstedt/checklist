// The presentation demo's data: one person's checklists, written for the App
// Store screenshots and the live demo (`make demo`, `VITE_SEED=demo`). A
// platform developer with a homelab, a bike and a talk to give — the lists
// such a person actually keeps and runs again: a release, a weekly reset, a
// NAS rebuild, the pre-flight for an overnight ride, packing for a conference.
//
// A pure builder over `now`: every date — a due day, a "not before" day, when
// an item was checked, when a list's reset last fired — is placed relative to
// the moment the demo opens, so the lists never age and a frame shot on any
// day shows the same urgency colours. Nothing here states a derived figure
// (progress counts, colour bands, the next reset): the app works them out.
//
// The shape is the app's own: `buildDemo` returns the localStorage entries
// the browser backend, the namespace registry and the settings store read
// (see `demo.ts`). This module runs before the app's first module is
// evaluated, so it imports nothing with a load-time effect — only types: the
// storage keys and the document envelope are spelled out here, and
// `tests/dev/demo.test.ts` holds them to `namespaceLocalKey` and `parse`.

import type {
  Checklist,
  ChecklistItem,
  Folder,
  Recurrence,
  ResetSchedule,
  Snapshot,
  Template,
} from "../domain/types.ts";
import type { TransformRule } from "../domain/transforms.ts";
import type { Namespace } from "../storage/namespaces.ts";

const DAY = 86_400_000;

/** The work namespace's slug; the home lists live in the default one. */
export const WORK = "work";

/** The ids a frame or a test reaches for. */
export const DEMO_IDS = {
  weekly: "demo-weekly-reset",
  upkeep: "demo-homelab-upkeep",
  nas: "demo-nas-rebuild",
  garage: "demo-garage-sensor",
  leaving: "demo-leaving-house",
  ride: "demo-bike-overnighter",
  lisbon: "demo-conference-lisbon",
  release: "demo-release-240",
  handover: "demo-oncall-handover",
  laptop: "demo-new-laptop",
  releaseOld: "demo-release-230",
} as const;

// ---- time -------------------------------------------------------------------

/** An ISO instant `days` (fractional allowed) before or after `now`. */
function at(now: number, days: number): string {
  return new Date(now + days * DAY).toISOString();
}

/**
 * A `YYYY-MM-DD` day `days` from today. Deadlines are time-zone-free calendar
 * days compared against the UTC head of the app's `now` (`daysUntil` in
 * `domain/deadlines.ts`), so the day is counted the same way here.
 */
function day(now: number, days: number): string {
  return new Date(now + days * DAY).toISOString().slice(0, 10);
}

// ---- items ------------------------------------------------------------------

type ItemSpec = {
  /** Checked, `ago` days before now (drives the checked-at order). */
  done?: number;
  notes?: string;
  archived?: boolean;
  /** Due in this many days (negative: overdue). */
  due?: number;
  /** Not before this many days from now. */
  notBefore?: number;
  every?: Recurrence;
  /** For a checked refreshing item: back in this many days. */
  backIn?: number;
  children?: ChecklistItem[];
};

/** Mints the item ids of one list: `<list>-1`, `<list>-2`, … */
function ids(list: string): () => string {
  let n = 0;
  return () => `${list}-${++n}`;
}

function makeItem(
  now: number,
  id: string,
  title: string,
  spec: ItemSpec = {},
): ChecklistItem {
  const item: ChecklistItem = { id, title, checked: spec.done !== undefined };
  if (spec.done !== undefined) item.checkedAt = at(now, -spec.done);
  if (spec.notes) item.notes = spec.notes;
  if (spec.archived) item.archived = true;
  if (spec.due !== undefined) item.deadline = day(now, spec.due);
  if (spec.notBefore !== undefined) item.notBefore = day(now, spec.notBefore);
  if (spec.every) item.recurrence = spec.every;
  if (spec.backIn !== undefined) item.refreshAt = at(now, spec.backIn);
  if (spec.children) item.children = spec.children;
  return item;
}

/** A small DSL over one list's items, so the lists below read as lists. */
function builder(now: number, list: string) {
  const next = ids(list);
  const item = (title: string, spec: ItemSpec = {}) =>
    makeItem(now, next(), title, spec);
  const group = (title: string, children: ChecklistItem[]): ChecklistItem => ({
    id: next(),
    title,
    checked: false,
    category: true,
    children,
  });
  return { item, group };
}

/** A finished run of the same items, under fresh ids. */
function finished(
  items: ChecklistItem[],
  prefix: string,
  when: string,
): ChecklistItem[] {
  return items
    .filter((i) => !i.archived)
    .map((i) => {
      const out: ChecklistItem = {
        id: `${prefix}-${i.id}`,
        title: i.title,
        checked: !i.category,
      };
      if (!i.category) out.checkedAt = when;
      if (i.category) out.category = true;
      if (i.children) out.children = finished(i.children, prefix, when);
      return out;
    });
}

/** Clear a list's run state for a template: every box unchecked. */
function blank(items: ChecklistItem[]): ChecklistItem[] {
  return items
    .filter((i) => !i.archived)
    .map((i) => {
      const out: ChecklistItem = {
        id: `tpl-${i.id}`,
        title: i.title,
        checked: false,
      };
      if (i.notes) out.notes = i.notes;
      if (i.category) out.category = true;
      if (i.children) out.children = blank(i.children);
      return out;
    });
}

// ---- lists ------------------------------------------------------------------

type ListSpec = {
  id: string;
  name: string;
  items: ChecklistItem[];
  glyph?: string;
  color?: string;
  folderId?: string;
  templateId?: string;
  archived?: boolean;
  resetSchedule?: ResetSchedule;
  lastResetAt?: string;
  /** Created this many days ago. */
  age: number;
};

function list(now: number, spec: ListSpec): Checklist {
  const out: Checklist = {
    version: 1,
    id: spec.id,
    templateId: spec.templateId ?? "",
    name: spec.name,
    items: spec.items,
    createdAt: at(now, -spec.age),
    updatedAt: at(now, -0.02),
  };
  if (spec.glyph) out.glyph = spec.glyph;
  if (spec.color) out.color = spec.color;
  if (spec.folderId) out.folderId = spec.folderId;
  if (spec.archived) out.archived = true;
  if (spec.resetSchedule) out.resetSchedule = spec.resetSchedule;
  if (spec.lastResetAt) out.lastResetAt = spec.lastResetAt;
  return out;
}

function template(
  now: number,
  id: string,
  name: string,
  items: ChecklistItem[],
  look: { glyph?: string; color?: string } = {},
): Template {
  return {
    version: 1,
    id,
    name,
    items: blank(items),
    ...look,
    createdAt: at(now, -140),
    updatedAt: at(now, -30),
  };
}

// The namespace palette (`ui/namespace-colors.ts`) — the hues the app offers.
const RED = "#e06c75";
const ORANGE = "#d19a66";
const YELLOW = "#e5c07b";
const GREEN = "#98c379";
const CYAN = "#56b6c2";
const BLUE = "#61afef";
const PURPLE = "#c678dd";

/**
 * The weekly reset's schedule: every week on today's weekday, in the morning,
 * with the pop-up on — anchored three weeks back and last applied a week ago,
 * so the occurrence this morning is due the moment the app opens and the
 * list arrives fresh, in its card. (Before seven in the morning the reset
 * falls at midnight instead, so it is due whenever the demo is opened.)
 */
export function weeklySchedule(now: number): {
  schedule: ResetSchedule;
  lastResetAt: string;
} {
  const today = new Date(now);
  const hour = today.getHours() >= 7 ? 7 : 0;
  const thisMorning = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    hour,
    0,
  ).getTime();
  return {
    schedule: {
      unit: "week",
      interval: 1,
      hour,
      minute: 0,
      popUp: true,
      since: new Date(thisMorning - 21 * DAY - 60_000).toISOString(),
    },
    lastResetAt: new Date(thisMorning - 7 * DAY).toISOString(),
  };
}

/**
 * The leaving-the-house routine's schedule: every morning, no pop-up, already
 * applied this morning — it was ticked through on the way out, and is not due
 * again until tomorrow.
 */
export function dailySchedule(now: number): {
  schedule: ResetSchedule;
  lastResetAt: string;
} {
  const weekly = weeklySchedule(now);
  const thisMorning = new Date(weekly.lastResetAt).getTime() + 7 * DAY;
  return {
    schedule: {
      ...weekly.schedule,
      unit: "day",
      popUp: false,
      since: new Date(thisMorning - 30 * DAY - 60_000).toISOString(),
    },
    lastResetAt: new Date(thisMorning).toISOString(),
  };
}

/** The canary step's hold condition. */
export const CANARY_NOTE = `Hold here until all three are true:

- Error rate under 0.1%
- p99 under 300 ms
- No new alerts for an hour

[Canary dashboard](https://metrics.example.com/d/canary)`;

/** Why the UPS battery is on the list at all. */
export const UPS_NOTE = `Self-test ran 38 min on load; the spec says 45.

- 1500 VA, two 12 V 9 Ah cells
- Swap both, then run the self-test again`;

/** The NAS rebuild's how-to, as the item's markdown note. */
export const NAS_IMPORT_NOTE = `Look before you write.

\`\`\`
zpool import -o readonly=on tank
zfs list -o name,used,avail
\`\`\`

- Every dataset there, sizes right
- **Then** export and import read-write

Old layout: [wiki](https://wiki.home.arpa/nas)`;

function homeSnapshot(now: number): Snapshot {
  const folders: Folder[] = [
    { id: "fld-homelab", name: "Homelab", createdAt: at(now, -120) },
    { id: "fld-trips", name: "Trips", createdAt: at(now, -110) },
  ];

  // The weekly reset: last week's run, every box ticked — the schedule
  // unchecks them all when the app opens (see `weeklySchedule`).
  const w = builder(now, "wk");
  const weekly = weeklySchedule(now);
  const weeklyReset = list(now, {
    id: DEMO_IDS.weekly,
    name: "Weekly reset",
    glyph: "calendar",
    color: YELLOW,
    age: 60,
    resetSchedule: weekly.schedule,
    lastResetAt: weekly.lastResetAt,
    items: [
      w.item("Test-restore one file from backup", {
        done: 6.9,
        notes: "A backup you haven't restored is a rumor.",
      }),
      w.item("Swap the offsite drive", { done: 6.8 }),
      w.item("Pull the new container images", { done: 6.8 }),
      w.item("Empty ~/Downloads", { done: 6.7 }),
      w.item("Inbox to zero, then close it", { done: 6.6 }),
      w.item("Charge the bike lights", { done: 6.5 }),
      w.item("Water the chili plants", { done: 6.5 }),
      w.item("Pick next week's three things", { done: 6.4 }),
    ],
  });

  // Homelab upkeep: the dates frame. Each timing kind once, every urgency band
  // the row paints but red — a list that is kept, not one that is on fire.
  const u = builder(now, "up");
  const upkeep = list(now, {
    id: DEMO_IDS.upkeep,
    name: "Homelab upkeep",
    glyph: "bell",
    color: CYAN,
    folderId: "fld-homelab",
    age: 200,
    items: [
      u.item("Renew the wildcard TLS cert", { due: 1 }),
      u.item("Rotate the backup API keys", { due: 5 }),
      u.item("Replace the UPS battery", {
        due: 26,
        notes: UPS_NOTE,
      }),
      u.item("Scrub the storage pool", {
        every: { unit: "month", interval: 1 },
        done: 3,
        backIn: 27,
      }),
      u.item("Clean the rack dust filters", {
        every: { unit: "month", interval: 3 },
      }),
      u.item("Update the router firmware", {
        notBefore: 9,
        notes: "Wait for the .1 — nobody runs a .0 on the router.",
      }),
      u.item("Check the SMART counters", {
        every: { unit: "week", interval: 2 },
        done: 1,
        backIn: 13,
      }),
      u.item("Prune old snapshots", {
        every: { unit: "week", interval: 1 },
        done: 2,
        backIn: 5,
      }),
      u.item("Renew the domain", { due: 41 }),
      u.item("Order two spare 8 TB drives", { done: 12, archived: true }),
    ],
  });

  // The NAS rebuild: the notes frame — a run half done, and the step it has
  // reached carries its how-to as markdown: a line, the commands, a checklist
  // of what to look at, a link to the old layout.
  const n = builder(now, "nas");
  const nas = list(now, {
    id: DEMO_IDS.nas,
    name: "NAS rebuild",
    glyph: "tag",
    color: GREEN,
    folderId: "fld-homelab",
    age: 9,
    items: [
      n.group("Before", [
        n.item("Snapshot every dataset", { done: 2.2 }),
        n.item("Label the drives by bay", { done: 2.1 }),
      ]),
      n.group("Hardware", [
        n.item("Swap in the 8 TB pair", { done: 1.1 }),
        n.item("Reseat the HBA", { done: 1.0 }),
      ]),
      n.group("Software", [
        n.item("Fresh install, same hostname", { done: 0.2 }),
        n.item("Import the pool, read-only", {
          notes: NAS_IMPORT_NOTE,
        }),
        n.item("Restore the backup jobs"),
        n.item("Burn in for 48 hours"),
      ]),
      n.item("Buy thermal paste", { done: 3, archived: true }),
    ],
  });

  // A build in progress, for the drawer: the homelab folder is a place where
  // projects live, not just chores.
  const g = builder(now, "gar");
  const garage = list(now, {
    id: DEMO_IDS.garage,
    name: "Garage door sensor",
    glyph: "star",
    color: PURPLE,
    folderId: "fld-homelab",
    age: 16,
    items: [
      g.item("Flash the board", { done: 12 }),
      g.item("Print the enclosure (PETG)", { done: 9 }),
      g.item("Calibrate the reed switch"),
      g.item("Mount it above the door"),
      g.item("Alert if open after 22:00"),
    ],
  });

  // The morning routine: reset daily, ticked through on the way out today.
  const h = builder(now, "out");
  const daily = dailySchedule(now);
  const leaving = list(now, {
    id: DEMO_IDS.leaving,
    name: "Leaving the house",
    glyph: "pin",
    color: BLUE,
    age: 90,
    resetSchedule: daily.schedule,
    lastResetAt: daily.lastResetAt,
    items: [
      h.item("Stove off", { done: 0.05 }),
      h.item("Windows shut", { done: 0.05 }),
      h.item("Keys, wallet, phone", { done: 0.04 }),
      h.item("Bike lock key", { done: 0.04 }),
    ],
  });

  // The pre-flight for an overnight ride, stamped from its template: the
  // bike is ready, the camp is being packed.
  const r = builder(now, "ride");
  const rideItems = [
    r.group("Bike", [
      r.item("Tires to 45 psi", { done: 0.1 }),
      r.item("Lube the chain", { done: 0.1 }),
      r.item("Spare tube, levers, pump", { done: 0.1 }),
      r.item("Multi-tool + quick link", { done: 0.1 }),
    ]),
    r.group("Camp", [
      r.item("Tent, poles — count the stakes", { done: 0.05 }),
      r.item("Sleeping pad, check the valve"),
      r.item("Quilt in its dry bag"),
    ]),
    r.group("Kitchen", [
      r.item("Stove + a full canister"),
      r.item("Coffee for two mornings"),
    ]),
    r.item("Send the route to someone"),
    r.item("Bear canister", { archived: true, notes: "Not on this route." }),
  ];
  const ride = list(now, {
    id: DEMO_IDS.ride,
    name: "Bike overnighter",
    glyph: "leaf",
    color: ORANGE,
    folderId: "fld-trips",
    templateId: "tpl-ride",
    age: 1,
    items: rideItems,
  });

  // Packing for a conference talk.
  const l = builder(now, "lis");
  const lisbonItems = [
    l.item("Submit the final slides", { due: 4 }),
    l.item("Passport", { done: 3 }),
    l.item("Slides on a USB stick too", { done: 3 }),
    l.item("USB-C to HDMI adapter", { done: 2 }),
    l.item("Earplugs for the flight", { done: 2 }),
    l.item("Clicker + a spare battery"),
    l.item("Laptop charger, the long cable"),
    l.item("EU plug adapter"),
    l.item("Speaker notes on the phone"),
    l.item("Hoodie for the venue's AC"),
    l.item("Running shoes, the river's close"),
    l.item("Book the hotel", { done: 20, archived: true }),
  ];
  const lisbon = list(now, {
    id: DEMO_IDS.lisbon,
    name: "Conference, Lisbon",
    glyph: "plane",
    color: PURPLE,
    folderId: "fld-trips",
    templateId: "tpl-conf",
    age: 14,
    items: lisbonItems,
  });

  return {
    templates: [
      template(now, "tpl-ride", "Bike overnighter", rideItems, {
        glyph: "leaf",
        color: ORANGE,
      }),
      template(now, "tpl-conf", "Conference trip", lisbonItems, {
        glyph: "plane",
        color: PURPLE,
      }),
    ],
    folders,
    checklists: [weeklyReset, leaving, upkeep, nas, garage, ride, lisbon],
  };
}

function workSnapshot(now: number): Snapshot {
  const folders: Folder[] = [
    { id: "fld-releases", name: "Releases", createdAt: at(now, -300) },
  ];

  // A release run from the team's template: the tag is out, the canary is
  // up. The issue numbers become links through the work namespace's rule.
  const r = builder(now, "rel");
  const releaseItems = [
    r.group("Before the tag", [
      r.item("CI green on main", { done: 0.3 }),
      r.item("Migrations tested on a prod copy", {
        done: 0.3,
      }),
      r.item("Changelog reviewed", { done: 0.28 }),
      r.item("Bump to 2.4.0", { done: 0.27 }),
    ]),
    r.group("Ship", [
      r.item("Tag v2.4.0 and push", { done: 0.1 }),
      r.item("Canary at 5% for an hour", {
        notes: CANARY_NOTE,
      }),
      r.item("Roll out to 100%"),
    ]),
    r.group("After", [
      r.item("Close #482 and #497"),
      r.item("Post the release notes"),
      r.item("Delete the release branch"),
    ]),
    r.item("Update the status page", { archived: true }),
  ];
  const release = list(now, {
    id: DEMO_IDS.release,
    name: "Release 2.4.0",
    glyph: "flag",
    color: RED,
    folderId: "fld-releases",
    templateId: "tpl-release",
    age: 0.4,
    items: releaseItems,
  });

  const o = builder(now, "oc");
  const handover = list(now, {
    id: DEMO_IDS.handover,
    name: "On-call handover",
    glyph: "bell",
    color: YELLOW,
    age: 30,
    items: [
      o.item("Flaky disk alert on db-2 (#511)"),
      o.item("Cert expiry on the staging LB", { due: 6 }),
      o.item("Bridge line 4417 902 318", {
        notes: "Masked by a rule — tap to edit shows the digits.",
      }),
      o.item("Hand over the pager"),
      o.item("Quiet week, one page (#506)", { done: 0.5 }),
    ],
  });

  const k = builder(now, "lap");
  const laptop = list(now, {
    id: DEMO_IDS.laptop,
    name: "New laptop",
    glyph: "list",
    color: BLUE,
    age: 5,
    items: [
      k.item("Turn on disk encryption", { done: 4 }),
      k.item("New SSH key, old one revoked", { done: 4 }),
      k.item("Clone the dotfiles", { done: 3.9 }),
      k.item("Toolchain at the pinned versions", { done: 3.8 }),
      k.item("Signing key for commits"),
      k.item("Wipe the old one"),
    ],
  });

  const oldRelease = list(now, {
    id: DEMO_IDS.releaseOld,
    name: "Release 2.3.0",
    glyph: "flag",
    color: RED,
    folderId: "fld-releases",
    templateId: "tpl-release",
    archived: true,
    age: 35,
    items: finished(releaseItems, "old", at(now, -34)),
  });

  return {
    templates: [
      template(now, "tpl-release", "Release checklist", releaseItems, {
        glyph: "flag",
        color: RED,
      }),
    ],
    folders,
    checklists: [release, handover, laptop, oldRelease],
  };
}

/**
 * The work namespace's display rules (Settings → Transform): issue numbers as
 * links, and the bridge line masked so it can't be read over a shoulder. The
 * stored text keeps what was typed.
 */
export function demoTransforms(): Record<string, TransformRule[]> {
  return {
    [WORK]: [
      {
        id: "demo-rule-issues",
        pattern: "#(\\d+)",
        caseInsensitive: false,
        kind: "link",
        replacement: "https://git.example.com/platform/api/issues/$1",
        label: "",
        mask: "edges",
        enabled: true,
      },
      {
        id: "demo-rule-bridge",
        pattern: "\\d{4} \\d{3} \\d{3}",
        caseInsensitive: false,
        kind: "sensitive",
        replacement: "",
        label: "",
        mask: "edges",
        enabled: true,
      },
    ],
  };
}

/**
 * What this person has earned: the achievements for everything the demo
 * shows them doing — lists, folders, templates, timings, a reset schedule,
 * namespaces, a transform rule — unlocked over the last two months. The
 * cloud, encryption and widget ones stay locked: the demo is on this device.
 */
export const DEMO_ACHIEVEMENTS = [
  "firstSteps",
  "checkItOff",
  "noteToSelf",
  "interiorDesigner",
  "biggerPicture",
  "renamed",
  "wordsmith",
  "secondThoughts",
  "listMaker",
  "folderMade",
  "filed",
  "listStylist",
  "onTheClock",
  "notYet",
  "onRepeat",
  "clockwork",
  "archivist",
  "tidyShelves",
  "comeback",
  "followTheLink",
  "reshuffle",
  "nestEgg",
  "springClean",
  "seeker",
  "menuMover",
  "roomToBreathe",
  "blueprint",
  "categoriser",
  "compartments",
  "stampedOut",
  "dressUp",
  "shapeShifter",
] as const;

/** The unlock map `Settings.achievements` holds: id → when, oldest first. */
export function demoAchievements(now: number): Record<string, number> {
  const out: Record<string, number> = {};
  DEMO_ACHIEVEMENTS.forEach((id, i) => {
    out[id] = Math.round(now - (62 - i * 1.8) * DAY);
  });
  return out;
}

export const DEMO_NAMESPACES: Namespace[] = [
  { slug: "default", name: "Home", glyph: "home", color: GREEN },
  { slug: WORK, name: "Work", glyph: "briefcase", color: BLUE },
];

/** The browser backend's key for a namespace (`namespaceLocalKey`). */
export function documentKey(slug: string): string {
  return slug === "default" ? "checklist:v1" : `checklist:v1:${slug}`;
}

/** The stored document, as `serialize` writes it (schema version 2). */
function document(snapshot: Snapshot): string {
  return JSON.stringify({ version: 2, ...snapshot }, null, 2) + "\n";
}

export type Demo = {
  /** Every localStorage entry the demo installs, by key. */
  storage: Record<string, string>;
  snapshots: Record<string, Snapshot>;
};

/** The whole demo for the moment `now` (ms since the epoch). */
export function buildDemo(now: number): Demo {
  const snapshots: Record<string, Snapshot> = {
    default: homeSnapshot(now),
    [WORK]: workSnapshot(now),
  };
  const storage: Record<string, string> = {
    "checklist:backend": "browser",
    "checklist:namespaces": JSON.stringify(DEMO_NAMESPACES),
    "checklist:namespace:active": "default",
    "checklist:list:active:default": DEMO_IDS.ride,
    [`checklist:list:active:${WORK}`]: DEMO_IDS.release,
  };
  for (const [slug, snapshot] of Object.entries(snapshots)) {
    storage[documentKey(slug)] = document(snapshot);
  }
  return { storage, snapshots };
}
