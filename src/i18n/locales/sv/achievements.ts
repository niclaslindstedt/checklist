import type { AchievementsCatalog } from "../en/achievements";

const achievements: AchievementsCatalog = {
  button: {
    open: "Bedrifter",
    unseenOne: "1 ny bedrift",
    unseenOther: "{n} nya bedrifter",
  },
  toast: {
    unlockedOne: "Bedrift upplåst: {name}",
    unlockedOther: "{n} bedrifter upplåsta!",
  },
  unlockModal: {
    titleOne: "Bedrift upplåst!",
    titleOther: "{n} bedrifter upplåsta!",
    dismiss: "Toppen!",
  },
  modal: {
    title: "Bedrifter",
    counter: "{unlocked} av {total} upplåsta · {earned} / {max} p",
    intro:
      "Varje funktion i appen är en bedrift. Gör saken en gång så låses den upp. Fyra nivåer, från att precis ha öppnat appen till att forma den helt efter ditt arbetssätt — välj den som passar dig härnäst.",
    tierPoints: "· {earned} / {max} p",
    learnMore: "Läs mer",
    locked: "Låst",
    tier: {
      beginner: {
        title: "Nybörjare",
        subtitle: "Du har precis öppnat appen. Vad gör du?",
      },
      intermediate: {
        title: "Van",
        subtitle: "Du vill hålla ordning på fler än en lista.",
      },
      pro: {
        title: "Proffs",
        subtitle: "Synka den, håll den prydlig, ta den överallt.",
      },
      expert: {
        title: "Expert",
        subtitle: "Forma appen helt efter ditt arbetssätt.",
      },
    },
  },
  catalog: {
    // ── Nybörjare ─────────────────────────────────────────────────────
    firstSteps: {
      name: "Första steget",
      condition: "Lägg till din första post.",
      learnMore:
        "Tryck på lägg-till-knappen, skriv en uppgift, tryck Enter. Det är en checklisterad — kärnan som hela appen är byggd kring.",
    },
    checkItOff: {
      name: "Bocka av",
      condition: "Bocka av en post.",
      learnMore:
        "Tryck på en posts ruta för att markera den klar. Räknaren i sidhuvudet visar hur många av listans poster som är avbockade.",
    },
    noteToSelf: {
      name: "Anteckning",
      condition: "Lägg till en anteckning på en post.",
      learnMore:
        "En post kan bära en längre anteckning under titeln — detaljen du inte vill ha i rubriken men inte heller vill glömma.",
    },
    nonNegotiable: {
      name: "Måste-ha",
      condition: "Markera en post som obligatorisk.",
      learnMore:
        "Obligatoriska poster är de som en lista inte räknas som klar utan — de absolut nödvändiga.",
    },
    interiorDesigner: {
      name: "Inredaren",
      condition: "Byt till ett annat tema.",
      learnMore:
        "Inställningar → Utseende har One Dark, One Light, Dracula, Monokai, GitHub, Solarized med flera. Det egna temat i expertnivån staplas ovanpå.",
    },
    biggerPicture: {
      name: "Större bild",
      condition: "Ändra textstorleken.",
      learnMore:
        "Utseende-fliken skalar hela gränssnittet i fyra steg, från 90% till 125% — bra på en liten telefon eller en skärm långt borta.",
    },
    renamed: {
      name: "Namnlapp",
      condition: "Byt namn på en checklista.",
      learnMore:
        "Tryck på listans titel i sidhuvudet för att byta namn — en ny lista heter “Checklist” från början.",
    },
    wordsmith: {
      name: "Ordkonstnär",
      condition: "Redigera en rads text.",
      learnMore:
        "Tryck på en rad för att redigera den på plats — rätta ett stavfel, formulera om, eller lägg till en markdown-anteckning under titeln (Skift+Enter, eller “Lägg till en anteckning” i redigeraren). En anteckning visas som markdown; tryck på en rad för att visa den, tryck igen för att redigera.",
    },
    secondThoughts: {
      name: "Ångrar mig",
      condition: "Ångra en åtgärd.",
      learnMore:
        "⌘Z (eller Ångra i sidomenyn) tar tillbaka den senaste ändringen. Varje redigering, bockning, arkivering och radering går att ångra — ångra är skyddsnätet.",
    },
    homeScreen: {
      name: "Hemskärmen",
      condition: "Installera appen på din enhet.",
      learnMore:
        "På iPhone / iPad i Safari: dela-menyn → Lägg till på hemskärmen. På Android och Chromium på datorn: installationstipset i adressfältet. Installerad körs appen i ett eget fönster utan webbläsarens ramar.",
    },

    // ── Van ───────────────────────────────────────────────────────────
    listMaker: {
      name: "Listbyggaren",
      condition: "Ha fler än en checklista.",
      learnMore:
        "“+” i sidomenyns åtgärdsrad lägger till en lista till. Var och en är fristående; växlaren visar varje listas återstående antal.",
    },
    folderMade: {
      name: "Inplacerad",
      condition: "Skapa en mapp.",
      learnMore:
        "Mappknappen i sidomenyns åtgärdsrad skapar en ny mapp, och sedan kan en lista läggas i den. Mappar grupperar dina checklistor inom en namnrymd — fäll ihop en för att gömma undan dess listor — och på fil- och molnbackendarna är varje mapp en riktig katalog med markdown-filer som du kan bläddra i med vilket verktyg som helst.",
    },
    filed: {
      name: "Bortlagd",
      condition: "Flytta en checklista till en mapp.",
    },
    archivist: {
      name: "Arkivarien",
      condition: "Arkivera en post.",
      learnMore:
        "Svep en post åt höger (eller använd dess meny) för att arkivera den — den faller ur den aktiva listan utan att förstöras. Arkivvyn återställer eller raderar arkiverade poster.",
    },
    tidyShelves: {
      name: "Städade hyllor",
      condition: "Arkivera en hel checklista.",
    },
    comeback: {
      name: "Comeback",
      condition: "Återställ en post från arkivet.",
      learnMore:
        "Arkivvyn (längst ner i sidomenyn) listar allt du arkiverat, grupperat efter källista. Återställ sätter tillbaka posten där den kom ifrån.",
    },
    reshuffle: {
      name: "Omflyttning",
      condition: "Dra en post för att flytta om den.",
      learnMore:
        "Ta tag i en post i draghandtaget och släpp den någon annanstans i listan. Ordningen är din att bestämma — appen sorterar aldrig om bakom ryggen på dig.",
    },
    nestEgg: {
      name: "Underpunkt",
      condition:
        "Gör en post till en underpunkt — dra den på en annan, eller använd Lägg till underpunkt.",
      learnMore:
        "Dra en post och släpp den mitt på en annan för att lägga den under som en underpunkt — släpp nära en kant för att i stället lägga den bredvid. Eller, medan du redigerar en post, tryck på Lägg till underpunkt för att starta en inmatning direkt under den. En förälder drar in sina barn och får en pil för att fälla ihop dem; att bocka av föräldern bockar av hela gruppen, och avbockade poster sjunker till botten inom varje egen underlista.",
    },
    cleanSlate: {
      name: "Rent bord",
      condition: "Ta bort en checklista.",
    },
    springClean: {
      name: "Storstädning",
      condition: "Arkivera alla avklarade poster på en gång.",
      learnMore:
        "Håll inne lägg-till-knappen (+) för att fälla ut massåtgärderna och tryck på Arkivera avklarade — varje avbockad post hamnar i arkivet på en gång.",
    },
    cleanSweep: {
      name: "Rensa rubbet",
      condition: "Ta bort alla avklarade poster på en gång.",
      learnMore:
        "Håll inne lägg-till-knappen (+) och tryck på Ta bort avklarade — ett tryck rensar varje avbockad post från listan på en gång, och ångra tar tillbaka dem om du råkade fel.",
    },
    copyThat: {
      name: "Kopierat",
      condition: "Kopiera en checklista till urklipp.",
      learnMore:
        "Kopieringsknappen lägger hela listan i urklipp som ren uppgiftslista i markdown (“- [ ]” / “- [x]”), redo att klistra in i valfri anteckningsapp eller meddelande.",
    },
    pasteList: {
      name: "Klistra & kör",
      condition: "Bygg en lista genom att klistra in markdown.",
      learnMore:
        "Klistra in en markdown-uppgiftslista i lägg-till-raden så landar varje “- [ ]” / “- [x]”-rad som en egen post — en hel checklista i ett klistra.",
    },
    topThis: {
      name: "Högst upp",
      condition: "Ändra var nya poster hamnar.",
    },
    sinkOrSwim: {
      name: "Sjunk eller simma",
      condition: "Sortera bockade poster längst ned.",
    },
    menuMover: {
      name: "Omplaceraren",
      condition: "Dra den flytande menyknappen till en ny plats.",
      learnMore:
        "Den runda navigeringsknappen går att dra — parkera den på den kant och höjd som passar tummen. Dess viloplats kommer ihåg.",
    },
    fontFanatic: {
      name: "Typsnittsnörd",
      condition: "Byt typsnitt.",
    },

    // ── Proffs ────────────────────────────────────────────────────────
    compartments: {
      name: "Fack",
      condition: "Skapa en namnrymd.",
      learnMore:
        "Namnrymder håller separata världar av listor sida vid sida — jobb och hem, till exempel — var och en sitt eget dokument. “+” på Namnrymd-rubriken skapar en.",
    },
    dressUp: {
      name: "Klä upp",
      condition: "Ge en namnrymd en ikon eller färg.",
      learnMore:
        "En namnrymd kan bära sin egen symbol och accentfärg; det valda märket pryder sidomenyn och favikonen i webbläsarfliken så att du skiljer dina världar åt vid en blick.",
    },
    relocated: {
      name: "Omflyttad",
      condition: "Dra en checklista till en annan namnrymd.",
    },
    localVault: {
      name: "Lokalt valv",
      condition: "Spara dina listor i en lokal mapp.",
      learnMore:
        "Mapp-backenden sparar varje lista som en vanlig markdown-fil i en mapp du väljer — läsbar, synkbar med dina egna verktyg, och helt din.",
    },
    cloudWalker: {
      name: "Molnvandraren",
      condition: "Anslut en molnlagring.",
      learnMore:
        "Dropbox eller Google Drive håller dina listor synkade mellan enheter. Inget konto här — du ansluter ditt eget moln, och appen pratar bara med det.",
    },
    freshPull: {
      name: "Färskt drag",
      condition: "Dra nedåt för att uppdatera.",
      learnMore:
        "På en synk-backend läser ett nedåtdrag från listans topp om den senaste kopian — sättet att fånga upp en ändring du gjort på en annan enhet.",
    },
    syncSleuth: {
      name: "Synkdetektiv",
      condition: "Öppna molnsynkdetaljerna från molnknappen i sidhuvudet.",
      learnMore:
        "Ett tryck på molnglyfen i sidhuvudet öppnar synkdetaljerna: vad backend gör och, när en sparning misslyckas, exakt varför — plus ett sätt att återansluta, försöka igen eller kontrollera anslutningen utan att lämna listan.",
    },
    trustButVerify: {
      name: "Lita men kontrollera",
      condition: "Utlös en manuell sparning.",
    },
    peacemaker: {
      name: "Fredsmäklaren",
      condition: "Lös en synkkonflikt.",
      learnMore:
        "När två enheter ändrar samma lista innan de synkas frågar appen vilken kopia som vinner i stället för att tyst välja — du behåller din eller tar deras.",
    },
    offGrid: {
      name: "Utanför nätet",
      condition: "Öppna dina listor när du är offline.",
      learnMore:
        "Ett molnbackend behåller en kopia av dina listor på den här enheten, så att du kan låsa upp, läsa och redigera dem helt utan anslutning — på ett flygplan, i en tunnel, var som helst. Dina ändringar sparas lokalt och synkas tillbaka till molnet så fort du är online igen.",
    },
    quietLife: {
      name: "Lugn och ro",
      condition: "Tysta aviseringarna.",
    },

    // ── Expert ────────────────────────────────────────────────────────
    paranoidMode: {
      name: "Paranoialäge",
      condition: "Kryptera dina data med en lösenfras.",
      learnMore:
        "Kryptering i vila förseglar dina listor bakom en lösenfras som bara hålls i minnet under sessionen. Tappar du lösenfrasen blir datan oläsbar — det är hela poängen.",
    },
    themeWizard: {
      name: "Tematrollkarl",
      condition: "Bygg ett helt eget tema.",
      learnMore:
        "Det egna temat blottar varje färgplats plus rundning, täthet och kantbredd — finjustera hela utseendet efter smak, utgånget från det förval du var på.",
    },
    stillness: {
      name: "Stillhet",
      condition: "Slå på reducerad rörelse.",
    },
    minimalist: {
      name: "Minimalisten",
      condition: "Dölj den flytande navigeringsknappen.",
      learnMore:
        "I den installerade appen på telefon eller surfplatta kan du dölja den runda knappen helt och öppna menyn med ett inåtsvep från kanten i stället — inget flyter över din lista.",
    },
    bareBones: {
      name: "Skalbenen",
      condition: "Stäng av anteckningar.",
    },
    lostCount: {
      name: "Tappat räkningen",
      condition: "Dölj antalet poster i listans rubrik.",
    },
    copyTheArchive: {
      name: "Kopiera arkivet",
      condition:
        "Slå på att ta med arkiverade poster när du kopierar en lista.",
    },
    underTheHood: {
      name: "Under huven",
      condition: "Slå på utvecklarläge.",
    },
    holodeck: {
      name: "Holodäck",
      condition: "Ladda exempeldatan.",
    },
    polyglot: {
      name: "Polyglott",
      condition: "Byt appens språk.",
    },
    completionist: {
      name: "Fullbordaren",
      condition: "Lås upp alla andra bedrifter.",
      learnMore:
        "Du har hittat och använt varje funktion appen har — från första posten till en egendesignad, krypterad, molnsynkad uppsättning med flera namnrymder. Det finns inget kvar att upptäcka. Snyggt.",
    },
  },
};

export default achievements;
