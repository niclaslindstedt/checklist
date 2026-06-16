// Composed English catalog. Each top-level group lives in its own file
// under this directory; this index re-assembles them so the rest of the
// app keeps a single `en` object to import. The `Catalog` type is
// derived here, then consumed by `sv/index.ts` and the runtime in
// `src/i18n/index.ts`. Mirrors budget's catalog layout.

import type { Widen } from "./_widen";

import app from "./app";
import changelog from "./changelog";
import common from "./common";
import menu from "./menu";
import namespace from "./namespace";
import nav from "./nav";
import pwa from "./pwa";
import settings from "./settings";
import sync from "./sync";
import toast from "./toast";

export const en = {
  app,
  changelog,
  common,
  menu,
  namespace,
  nav,
  pwa,
  settings,
  sync,
  toast,
} as const;

export type Catalog = Widen<typeof en>;
