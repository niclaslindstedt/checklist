// Composed Swedish catalog. Each per-namespace file is typed against its
// English counterpart; the top-level `: Catalog` annotation here is the
// belt-and-braces safety net against an accidentally-dropped namespace.

import type { Catalog } from "../en/index";

import app from "./app";
import changelog from "./changelog";
import common from "./common";
import menu from "./menu";
import pwa from "./pwa";
import settings from "./settings";
import sync from "./sync";
import toast from "./toast";

export const sv: Catalog = {
  app,
  changelog,
  common,
  menu,
  pwa,
  settings,
  sync,
  toast,
};
