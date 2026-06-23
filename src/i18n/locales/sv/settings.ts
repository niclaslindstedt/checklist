import type { SettingsCatalog } from "../en/settings";

const settings: SettingsCatalog = {
  title: "Inställningar",
  close: "Stäng inställningar",
  sections: "Inställningssektioner",
  chooseSection: "Välj sektion",

  tab: {
    general: "Allmänt",
    lists: "Listor",
    theme: "Tema",
    storage: "Lagring",
    developer: "Utvecklare",
    logs: "Loggar",
  },

  general: {
    blurb:
      "checklist är en lokal-först-app — dina listor finns i den här webbläsaren. Utseendeinställningar sparas på den här enheten.",
    languageSection: "Språk",
    interfaceSection: "Gränssnitt",
    notificationsSection: "Aviseringar",
    achievementsSection: "Bedrifter",
    developerSection: "Utvecklare",
    language: "Språk",
    languageHint:
      "Byt appens språk. Sparas på den här enheten — det följer inte med en delad lista.",
    devMode: "Utvecklarläge",
    devModeHint:
      "Visa flikarna Utvecklare och Loggar för att fånga diagnostik och läsa in exempeldata.",
    menuButton: "Visa menyknapp",
    menuButtonHint:
      "När den är av sveper du in från skärmkanten för att öppna menyn.",
    disableToasts: "Inaktivera aviseringar",
    disableToastsHint:
      "Sluta visa popup-aviseringar. Tipset ”ny version klar” visas fortfarande.",
    disableAchievements: "Inaktivera bedrifter",
    disableAchievementsHint:
      "Sluta spåra bedrifter och dölj troféknappen. Bedrifter du redan låst upp behålls.",
  },

  lists: {
    addingSection: "Lägg till poster",
    displaySection: "Visning",
    addItemPosition: "Lägg till nya poster",
    addItemPositionHint:
      "Var en ny post hamnar när du lägger till den i en lista.",
    addItemTop: "Överst",
    addItemBottom: "Nederst",
    sortCheckedToBottom: "Sortera bockade poster längst ned",
    sortCheckedToBottomHint:
      "Att bocka av en post sänker den under de obockade, med den senast bockade först. Själva listan ordnas inte om – avbockning lägger tillbaka den direkt.",
    disableItemNotes: "Inaktivera anteckningar",
    disableItemNotesHint:
      "Gör poster till enbart titel – dölj anteckningstexten och redigeraren ”Lägg till anteckning”. Anteckningar du redan skrivit behålls, bara dolda.",
    showItemCount: "Visa antal poster",
    showItemCountHint:
      "Visa förloppsräknaren (bockade / totalt) i listans rubrik.",
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
    motion: "Rörelse",
    animateSortChecked: "Animera sorterade poster",
    animateSortCheckedHint:
      "När ”Sortera bockade poster längst ned” är på, låt dem glida på plats i stället för att hoppa. Har ingen effekt när den sorteringen är av.",
    shapeMotion: "Form och rörelse",
    cornerRadius: "Hörnradie",
    density: "Täthet",
    borderWidth: "Kantbredd",
    reduceMotion: "Minska rörelse",
    reduceMotionHint: "Inaktivera övergångar och animationer i hela appen.",
  },

  storage: {
    backendTitle: "Lagring",
    backendBlurb:
      "Välj var dina listor sparas. Molnlagring synkar samma dokument mellan dina enheter; den här enheten behåller det endast i den här webbläsaren.",
    backendBrowser: "Den här enheten",
    backendFolder: "Lokal mapp",
    backendDropbox: "Dropbox",
    backendGoogleDrive: "Google Drive",
    browserHint:
      "Dina listor finns i den här webbläsarens lagring. Inget lämnar den här enheten.",
    folderConnected:
      "Ansluten. Varje lista sparas som en markdown-fil i din mapp — öppna eller redigera den med valfritt verktyg.",
    folderUnconnected:
      "Välj en mapp på den här enheten. Varje lista sparas där som en markdown-fil du kan öppna, redigera eller säkerhetskopiera med valfritt verktyg.",
    folderReconnectHint:
      "Den här webbläsaren behöver behörighet att använda din mapp igen. Återanslut för att ge den.",
    folderReconnect: "Återanslut mapp",
    folderChoose: "Välj mapp",
    dropboxConnected:
      "Ansluten. Dina listor synkas till en privat appmapp i din Dropbox.",
    dropboxUnconnected:
      "Anslut din Dropbox för att synka dina listor till en privat appmapp.",
    gdriveConnected:
      "Ansluten. Dina listor synkas till en mapp i din Google Drive.",
    gdriveUnconnected:
      "Anslut din Google Drive för att synka dina listor till en mapp du styr över.",
    connect: "Anslut",
    disconnect: "Koppla från",
    connected: "Ansluten",
    encryptionTitle: "Kryptering",
    encryptionOn: "Kryptering är på",
    encryptionOff: "Kryptering är av",
    encryptionHint:
      "När den är på krypteras dina listor med en lösenfras innan de sparas — på den här enheten och i molnet. Bara den som har lösenfrasen kan läsa dem.",
    enableEncryption: "Aktivera kryptering",
    disableEncryption: "Stäng av kryptering",
    passphrase: "Lösenfras",
    passphraseConfirm: "Bekräfta lösenfras",
    passphraseWarning:
      "Det finns ingen återställning. Om du glömmer lösenfrasen kan dina listor inte läsas.",
    passphraseTooShort: "Använd en lösenfras på minst 4 tecken.",
    passphraseMismatch: "Lösenfraserna matchar inte.",
    encryptionBusyEnabling: "Aktiverar kryptering…",
    encryptionBusyDisabling: "Stänger av kryptering…",
    encryptionStepReading: "Läser dina listor…",
    encryptionStepDerivingKey: "Härleder krypteringsnyckel…",
    encryptionStepEncrypting: "Krypterar dina listor…",
    encryptionStepDecrypting: "Dekrypterar dina listor…",
    encryptionStepSaving: "Sparar dina listor…",
    encryptionStepFinalizing: "Slutför…",
    encryptionFailed: "Något gick fel. Tryck för att se loggen.",
    encryptionStatusAria: "Krypteringsförlopp",
    encryptionLogTitle: "Krypteringslogg",
    encryptionLogEmpty: "Inget loggades.",
    cancel: "Avbryt",
    unlockTitle: "Lås upp dina listor",
    unlockHint:
      "Dina listor är krypterade. Ange din lösenfras för att låsa upp dem på den här enheten.",
    unlock: "Lås upp",
    unlockStatusAria: "Upplåsningsförlopp",
    unlockStepDerivingKey: "Kontrollerar din lösenfras…",
    unlockStepDecrypting: "Dekrypterar dina listor…",
    unlockStepFinalizing: "Låser upp dina listor…",
    unlockWrong: "Fel lösenfras. Försök igen.",
    unlockOffline:
      "Kan inte nå ditt moln, och det finns ingen offlinekopia sparad på den här enheten ännu. Återanslut och försök igen.",
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
