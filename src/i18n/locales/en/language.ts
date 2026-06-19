import type { Widen } from "./_widen";

// Strings for the language picker in the General settings tab. The flag
// buttons' labels and the radiogroup's accessible name live here; the
// section heading and hint live with the rest of the settings copy in
// `settings.ts`.

const language = {
  english: "English",
  swedish: "Swedish",
  pick: "Choose language",
} as const;

export type LanguageCatalog = Widen<typeof language>;

export default language;
