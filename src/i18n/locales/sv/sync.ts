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
};

export default sync;
