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
};

export default sync;
