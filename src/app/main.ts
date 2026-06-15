// Application entry point. Boots the PWA, wires app state to the default
// storage backend, and performs the initial render.

import { registerServiceWorker } from "../pwa/register.ts";
import { renderApp } from "../ui/app-view.ts";
import { createAppState } from "./state.ts";

async function main(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing #app mount point");

  const state = createAppState();
  state.backend.subscribe((snapshot) => renderApp(root, snapshot));
  renderApp(root, await state.load());

  registerServiceWorker();
}

void main();
