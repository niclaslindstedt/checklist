// Composed English catalog. Each top-level group lives in its own file
// under this directory; this index re-assembles them so the rest of the
// app keeps a single `en` object to import. The `Catalog` type is
// derived here, then consumed by `sv/index.ts` and the runtime in
// `src/i18n/index.ts`. Mirrors budget's catalog layout.

import { ACHIEVEMENTS_BUILT } from "../../../build-env.ts";
import type { Widen } from "./_widen";

import achievements from "./achievements";
import app from "./app";
import changelog from "./changelog";
import common from "./common";
import language from "./language";
import menu from "./menu";
import namespace from "./namespace";
import nav from "./nav";
import notifications from "./notifications";
import pwa from "./pwa";
import search from "./search";
import settings from "./settings";
import sync from "./sync";
import toast from "./toast";

export const en = {
  // The phone and desktop apps carry no achievements, so not their strings
  // either (`ACHIEVEMENTS_BUILT`); the type keeps the website's shape.
  achievements: ACHIEVEMENTS_BUILT ? achievements : ({} as typeof achievements),
  app,
  changelog,
  common,
  language,
  menu,
  namespace,
  nav,
  notifications,
  pwa,
  search,
  settings,
  sync,
  toast,
} as const;

export type Catalog = Widen<typeof en>;
