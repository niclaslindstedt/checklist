// Minimal presentational shell. UI may import from domain/ and storage/ (via
// the AppState seam) but nothing in those layers imports back from here.

import { progress } from "../domain/checklists.ts";
import type { Snapshot } from "../domain/types.ts";

export function renderApp(root: HTMLElement, snapshot: Snapshot): void {
  root.replaceChildren();

  const heading = document.createElement("h1");
  heading.textContent = "checklist";
  root.append(heading);

  const templates = document.createElement("section");
  const tHeading = document.createElement("h2");
  tHeading.textContent = `Templates (${snapshot.templates.length})`;
  templates.append(tHeading);
  for (const template of snapshot.templates) {
    const li = document.createElement("p");
    li.textContent = `${template.name} — ${template.items.length} items`;
    templates.append(li);
  }
  root.append(templates);

  const checklists = document.createElement("section");
  const cHeading = document.createElement("h2");
  cHeading.textContent = `Checklists (${snapshot.checklists.length})`;
  checklists.append(cHeading);
  for (const checklist of snapshot.checklists) {
    const { checked, total } = progress(checklist);
    const li = document.createElement("p");
    li.textContent = `${checklist.name} — ${checked}/${total}`;
    checklists.append(li);
  }
  root.append(checklists);
}
