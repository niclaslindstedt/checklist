import type { SettingsCatalog } from "../en/settings";

const settings: SettingsCatalog = {
  title: "Inställningar",
  close: "Stäng inställningar",
  sections: "Inställningssektioner",
  done: "Klar",

  tab: {
    general: "Allmänt",
    theme: "Tema",
    developer: "Utvecklare",
    logs: "Loggar",
  },

  general: {
    title: "Allmänt",
    blurb:
      "checklist är en lokal-först-app — dina listor finns i den här webbläsaren. Utseendeinställningar sparas på den här enheten.",
    devMode: "Utvecklarläge",
    devModeHint:
      "Visa flikarna Utvecklare och Loggar för att fånga diagnostik och läsa in exempeldata.",
  },

  developer: {
    title: "Utvecklare",
    blurb:
      "Diagnostik för utveckling. Dessa inställningar stannar på den här enheten och följer aldrig med en delad lista.",
    captureLogs: "Fånga loggar",
    captureLogsHint:
      "Spara den inbyggda loggen i den här webbläsaren så att den överlever en omladdning. Visa den på fliken Loggar.",
    fakeData: "Falska data",
    fakeDataHint:
      "Ersätt dina data med ett exempeldokument i minnet för den här sessionen. Ladda om (eller stäng av) för att återgå till dina riktiga listor — exemplet sparas aldrig.",
  },

  appearance: {
    theme: "Tema",
    mode: "Läge",
    variant: "Variant",
    systemNote: "Följer operativsystemets ljusa/mörka inställning.",
    font: "Typsnitt",
    fontFamily: "Typsnittsfamilj",
    textSize: "Textstorlek",
    colours: "Färger",
    shapeMotion: "Form och rörelse",
    cornerRadius: "Hörnradie",
    density: "Täthet",
    borderWidth: "Kantbredd",
    reduceMotion: "Minska rörelse",
    reduceMotionHint: "Inaktivera övergångar och animationer i hela appen.",
  },

  logs: {
    title: "Loggar",
    filter: "Filtrera",
    filterAria: "Filtrera loggar efter nivå",
    all: "Alla",
    info: "Info",
    warnings: "Varningar",
    errors: "Fel",
    copy: "Kopiera",
    clear: "Rensa",
    none: "Inga poster.",
    countOne: "{n} post.",
    countOther: "{n} poster.",
    copied: "Kopierat till urklipp.",
    copyFailed: "Kopiering misslyckades.",
  },
};

export default settings;
