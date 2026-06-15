// Composed Swedish catalog. Each per-namespace file is typed against its
// English counterpart; the top-level `: Catalog` annotation here is the
// belt-and-braces safety net against an accidentally-dropped namespace.

import type { Catalog } from "../en/index";

import app from "./app";
import common from "./common";
import pwa from "./pwa";
import settings from "./settings";
import toast from "./toast";

export const sv: Catalog = {
  app,
  common,
  pwa,
  settings,
  toast,
};
