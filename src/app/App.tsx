import { useState } from "react";

import {
  getStoredFontFamily,
  getStoredTheme,
  useTheme,
} from "../theme/useTheme.ts";
import { ChecklistView } from "../ui/ChecklistView.tsx";
import { useChecklist } from "./use-checklist.ts";

// Thin root, in the spirit of budget's `App.tsx`: wire the cross-cutting
// hooks and hand state down to the view. There's no Appearance UI yet, so
// the theme preference is read once (defaulting to dark) and applied; a
// future picker would lift these into state setters and persist via
// `storeTheme` / `storeFontFamily`.

export function App() {
  const [theme] = useState(getStoredTheme);
  const [fontFamily] = useState(getStoredFontFamily);
  useTheme(theme, fontFamily);

  const checklist = useChecklist();

  return (
    <ChecklistView
      items={checklist.items}
      checkedCount={checklist.checkedCount}
      onAdd={checklist.addItem}
      onToggle={checklist.toggle}
      onRemove={checklist.remove}
      onArchive={checklist.archive}
    />
  );
}
