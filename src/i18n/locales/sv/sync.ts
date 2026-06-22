import type { SyncCatalog } from "../en/sync";

const sync: SyncCatalog = {
  conflictTitle: "Den här listan ändrades någon annanstans",
  conflictHint:
    "En annan enhet sparade en annan version av den här listan. Välj vilken kopia du vill behålla — det finns ingen automatisk sammanslagning.",
  conflictLocalLabel: "Den här enheten",
  conflictRemoteLabel: "Den andra kopian",
  conflictCounts: "{lists} listor · {items} objekt",
  keepLocal: "Behåll den här enhetens",
  keepRemote: "Behåll den andra",

  saving: "Sparar…",
  syncedTo: "Synkad till {name}",
  saveUnsaved: "Osparade ändringar — tryck för att spara nu",
  failed: "Synk misslyckades — tryck för detaljer",
  throttled: "Ta det lugnt — backend begränsar sparningar",
  reauthRequired: "Återanslutning krävs — tryck för att åtgärda",
  syncConflict: "Synkkonflikt — tryck för att lösa",
  offline: "Offline — redigerar en lokal kopia",

  cloudSync: "Molnsynk",
  status: "Status",
  provider: "Leverantör",
  fileLocation: "Filplats",
  openIn: "Öppna i {name}",
  reconnect: "Återanslut {name}",
  tryAgain: "Försök igen",
  saveNow: "Spara nu",

  checkConnection: "Kontrollera anslutningen",
  checkPinging: "Når {name}…",
  checkOnline: "Online igen — synkar dina ändringar.",
  checkStillOffline:
    "Kan fortfarande inte nå {name}. Dina ändringar är sparade på den här enheten och synkas automatiskt när du är online igen.",
  checkAuthExpired:
    "Din session med {name} har gått ut — återanslut för att fortsätta.",

  syncingNow: "Sparar dina ändringar…",
  failedHeading: "Synk misslyckades",
  failedDetailFallback:
    "Den senaste sparningen till {name} gick inte igenom. Försök igen — och kontrollera din anslutning om det fortsätter att misslyckas.",
  throttledHeading: "Hastighetsbegränsad",
  throttledDetail:
    "{name} ber appen att sakta ner. Sparningen återupptas automatiskt om en stund.",
  reauthHeading: "Återanslutning krävs",
  reauthDetail:
    "Din session med {name} har gått ut. Återanslut för att fortsätta spara.",
  conflictHeading: "Synkkonflikt",
  conflictDetail:
    "En annan enhet sparade en nyare version. Öppna listan för att välja vilken kopia du vill behålla.",
  pendingHeading: "Väntar på synk",
  pendingDetail: "Dina senaste ändringar är inte sparade till {name} ännu.",
  offlineHeading: "Offline",
  offlineDetail:
    "Kan inte nå {name} just nu, så du arbetar med kopian som är sparad på den här enheten. Ändringar behålls lokalt och synkas automatiskt när du är online igen.",

  reloadFromBackend: "Läs om från backend",
  backend: "Backend",
  encryptionLabel: "Kryptering",
  encryptionOn: "På",
  encryptionOff: "Av",
  viewSyncLog: "Visa synklogg",
  hideSyncLog: "Dölj synklogg",
  syncLogEmpty: "Ingen synkaktivitet loggad ännu.",
  copyLog: "Kopiera",
  copied: "Kopierad",
  copyFailed: "Kopiering misslyckades",
};

export default sync;
