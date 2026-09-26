// The presentation demo's switch (`VITE_SEED=demo`, see `demo.ts`). Imported
// FIRST by `main.tsx`, for its side effect alone: ES modules evaluate in
// import order, so the in-memory store is in `window.localStorage`'s place
// before any module of the app reads from it — several do at load (the dev
// flags, the language preference). If the store can't be installed this
// throws, the module graph fails, and nothing mounts: the demo never falls
// through to the device's lists.
//
// In every other build the condition folds to `false`, and the demo modules
// are tree-shaken out of the bundle with it.

import { bootDemo } from "./demo.ts";

if (import.meta.env.VITE_SEED === "demo" && !bootDemo()) {
  throw new Error("demo: localStorage could not be replaced");
}
