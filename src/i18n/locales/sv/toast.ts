import type { ToastCatalog } from "../en/toast";

const toast: ToastCatalog = {
  region: "Aviseringar",
  dismiss: "Stäng",
  itemAdded: "La till ”{title}”",
  itemEdited: "Redigerade ”{title}”",
  itemChecked: "Bockade av ”{title}”",
  itemUnchecked: "Bockade ur ”{title}”",
  itemDeleted: "Tog bort ”{title}”",
  itemArchived: "Arkiverade ”{title}”",
  itemRestored: "Återställde ”{title}”",
  itemMoved: "Flyttade ”{title}”",
  itemsImported: "Importerade {count} rader",
  itemsArchived: "Arkiverade {count} avklarade",
  itemsDeleted: "Tog bort {count} avklarade",
  listCreated: "Skapade listan ”{name}”",
  listRenamed: "Bytte namn på listan till ”{name}”",
  listDeleted: "Tog bort listan ”{name}”",
  namespaceCreated: "Skapade namnrymden ”{name}”",
  namespaceDeleted: "Tog bort namnrymden ”{name}”",
  undone: "Ångrade: {action}",
  redone: "Gjorde om: {action}",
};

export default toast;
