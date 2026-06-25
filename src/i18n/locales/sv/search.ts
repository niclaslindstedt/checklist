import type { SearchCatalog } from "../en/search";

const search: SearchCatalog = {
  title: "Sök",
  placeholder: "Sök listor, poster, anteckningar…",
  clear: "Rensa sökning",
  prompt:
    "Sök igenom alla listor — namn, poster, anteckningar och underposter.",
  hint: "Vanlig text, luddig som standard. Använd jokertecken (car*, sun?creen) eller ett /regex/.",
  matchesOne: "1 lista",
  matchesOther: "{n} listor",
  noteLabel: "Anteckning",
  inList: "i den här listan",
  noResults: "Inga träffar för ”{query}”.",
  invalidRegex: "Det reguljära uttrycket är inte giltigt.",
};

export default search;
