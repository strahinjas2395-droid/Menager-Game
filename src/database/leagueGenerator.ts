/**
 * League & club world generation — 20 leagues, 20 clubs each.
 * 15 nations; Bretherland, Valdoria, Schwarzland, Campoverde and
 * Hellenia have a second division (promotion/relegation pairs).
 */
import { ManagerPersonality, PlayStyle, type Club, type League, type Manager, type Player } from "@/types";
import { SeededRNG, clamp } from "@/database/rng";
import { NAME_POOLS, NATIONALITY_FLAGS, generateName } from "@/database/nameGenerator";
import { generateSquad } from "@/database/playerGenerator";

interface LeagueDef {
  name: string;
  nation: string;
  tier: number;
  reputation: number;
  clubs: string[]; // 20 club names
}

// ---------------------------------------------------------------------------
// League data
// ---------------------------------------------------------------------------

export const LEAGUES_DATA: LeagueDef[] = [
  // --- Bretherland (2 divisions) ---
  {
    name: "Premiere Division", nation: "Bretherland", tier: 1, reputation: 88,
    clubs: [
      "Ashford United", "Blackstone City", "Castleford Rovers", "Durnham Athletic",
      "Eastbourne Wanderers", "Foxworth Town", "Greenwell FC", "Hartfield Rangers",
      "Ivybridge City", "Kingsport United", "Lancaster FC", "Millhaven Town",
      "Northcastle United", "Oldcastle Rovers", "Portfield City", "Queensbury Athletic",
      "Redstone Wanderers", "Southcrest FC", "Thornbury Rangers", "Westmoor City",
    ],
  },
  {
    name: "The Championship", nation: "Bretherland", tier: 2, reputation: 68,
    clubs: [
      "Bexley County", "Bramford Athletic", "Cottersley Town", "Drakemoor United",
      "Evershed Wanderers", "Farrowdale FC", "Gatley Rovers", "Highmoor Town",
      "Ironbridge FC", "Kelsale City", "Langton Rangers", "Mapperley Town",
      "Norbury Albion", "Oakmere United", "Pendlebury County", "Queensmead City",
      "Redmarley Rovers", "Stanwick Town", "Trenholme Athletic", "Whitcombe FC",
    ],
  },
  // --- Valdoria (2 divisions) ---
  {
    name: "Valdorian Liga", nation: "Valdoria", tier: 1, reputation: 85,
    clubs: [
      "Real Montecarlo", "Atletico Solares", "CF Esperanza", "Deportivo Valdez",
      "Real Castillo", "FC Maravilla", "Severo Club", "Racing Portoval",
      "CD Luminara", "Valencia Nova FC", "SD Tempesta", "CF Rioseco",
      "Real Orinoco", "Atletico Fuego", "CD Brisa", "FC Altamira",
      "SD Estrella", "Racing Dorado", "CF Vistabella", "Real Cumbres",
    ],
  },
  {
    name: "Segunda Liga", nation: "Valdoria", tier: 2, reputation: 66,
    clubs: [
      "CD Alborada", "Atletico Sierra", "UD Montesino", "Racing Almeira",
      "Real Cordillera", "CF Donana", "Deportivo Llanura", "FC Mirador",
      "CD Nervia", "Atletico Puentela", "Racing Valles", "SD Romeral",
      "CF Santa Eulalia", "Real Talamera", "CD Ulia", "UD Vega",
      "FC Verdeguia", "SD Zurita", "CF Monteagudo", "Atletico Salinas",
    ],
  },
  // --- Azzuriland ---
  {
    name: "Serie Stella", nation: "Azzuriland", tier: 1, reputation: 84,
    clubs: [
      "AC Belluno", "SS Aurora", "Calcio Fiorenza", "AS Tricolore",
      "Virtus Padano", "US Riviera", "AC Maremonti", "SSC Solara",
      "FBC Adriatico", "AC Montefiore", "US Castello", "SC Orizzonte",
      "AC Verdevalle", "FBC Lucento", "SSC Marechiaro", "AC Pietrasanta",
      "US Torrevela", "SC Granducale", "AC Belfiore", "FBC Ferraro",
    ],
  },
  // --- Gallonde ---
  {
    name: "Ligue Royale", nation: "Gallonde", tier: 1, reputation: 83,
    clubs: [
      "FC Auberive", "AS Montclair", "Olympique Valrose", "FC Chanteloup",
      "RC Bellevue", "FC D'Harcourt", "SC Lumiere", "FC Montvallon",
      "AS Perronne", "Olympique Roussillon", "FC Saint-Aubin", "SC Tournepierre",
      "FC Vaudreuil", "AS Yvermont", "RC Argentel", "FC Granval",
      "AS Coteaux", "FC Durance", "Olympique Ferriere", "FC Bellerive",
    ],
  },
  // --- Schwarzland (2 divisions) ---
  {
    name: "Bundesliga", nation: "Schwarzland", tier: 1, reputation: 86,
    clubs: [
      "SV Adlertal", "FC Blauweiss Talheim", "VfB Eisberg", "Rot-Weiss Kronbach",
      "SC Falkenried", "SV Graustadt", "FC Hohenfeld", "SC Eisenhut",
      "VfL Klarenbach", "SV Morgenstern", "FC Nordwind", "Blau-Weiss Osterfeld",
      "SC Rheintal", "SV Steinburg", "VfB Tannenheim", "FC Unterland",
      "SV Waldenbruck", "SC Weissensee", "FC Ziegelheim", "SV Kronwerk",
    ],
  },
  {
    name: "Zweite Liga", nation: "Schwarzland", tier: 2, reputation: 65,
    clubs: [
      "FC Altenfeld", "SV Bergland", "SC Donaugau", "VfB Ehrenfeld",
      "FC Frohsinn", "SV Grunenberg", "SC Hammerstadt", "FC Kaiserhain",
      "SV Lindenberg", "FC Nordstadt", "SV Rheinbach", "SC Schildberg",
      "FC Schwarzbach", "SV Steinacker", "SC Vogtberg", "FC Waldhorst",
      "SV Weissbach", "SC Westenfeld", "FC Zeitzfeld", "SV Hafenstadt",
    ],
  },
  // --- Oranjeland ---
  {
    name: "Eredivisie", nation: "Oranjeland", tier: 1, reputation: 80,
    clubs: [
      "SC Amstelstad", "VV Bovenland", "FC Delfveld", "Excelsior Noorddam",
      "SC Eemhaven", "VV Flevowijk", "FC Gooiberg", "HV De Riet",
      "SC IJsselstad", "VV Kustduin", "FC Meridiaan", "SC Nieuwland",
      "VV Oranjepark", "FC Polderstad", "SC Rijnhoek", "VV Slotenoord",
      "FC Stadsveld", "SC Tweestromen", "VV Vechtstad", "FC Zilvermeeuw",
    ],
  },
  // --- Nordheim ---
  {
    name: "Eliteserien", nation: "Nordheim", tier: 1, reputation: 76,
    clubs: [
      "IF Fjordvik", "BK Bergheim", "SK Brannoy", "FK Dalemark",
      "IF Ekorn", "SK Fjelltopp", "FK Grenlia", "IF Havbris",
      "SK Isfjell", "FK Kystby", "IF Lorenvik", "SK Midtfjell",
      "FK Nordvik", "IF Olsund", "SK Ravnholm", "FK Solberg",
      "IF Stormvik", "SK Soderas", "FK Tindvik", "IF Vestbygd",
    ],
  },
  // --- Campoverde (2 divisions) ---
  {
    name: "Campeonato Nacional", nation: "Campoverde", tier: 1, reputation: 82,
    clubs: [
      "Atletico Verde", "Gremio Serrado", "EC Beirada", "FC Palmares",
      "Nacional Aurora", "SC Riodoce", "EC Tupã", "CA Andina",
      "CD Miralto", "FC Costa Azul", "Atletico Bravio", "ES Esmeralda",
      "CA Puerto Sereno", "Union del Sur", "CD Labrada", "FC Sol y Sombra",
      "CA Nueva Espera", "SD Cerrillos", "FC Tempestad", "CA Barranca",
    ],
  },
  {
    name: "Segunda Division", nation: "Campoverde", tier: 2, reputation: 64,
    clubs: [
      "CD Puertomonte", "Atletico Viento", "CA Las Brisas", "FC Vallehermoso",
      "ES Nuevo Amanecer", "CD Norte Grande", "CA Ribera", "FC Camino Real",
      "SD Monteluz", "CD Oriental", "Atletico Centenario", "CA Frontera",
      "ES Gaviota", "FC La Esperanza", "Club Alameda", "CD Naranjal",
      "FC Piedra Azul", "CA Solariega", "ES El Progreso", "FC Cardonal",
    ],
  },
  // --- Lusitana ---
  {
    name: "Primeira Liga", nation: "Lusitana", tier: 1, reputation: 79,
    clubs: [
      "FC Alvorada", "CD Beiral", "AD Costeira", "SC Dourada",
      "FC Estrelado", "GD Fontinhas", "FC Guadiana", "AD Ilha Verde",
      "SC Lumar", "FC Marinha Alta", "GD Minho", "FC Mondego",
      "AD Nazareth", "SC Ourela", "FC Penaforte", "GD Praia Nova",
      "SC Quintanilha", "FC Ribeira Clara", "AD Sabrosa", "GD Vianova",
    ],
  },
  // --- Slavonica ---
  {
    name: "SuperLiga", nation: "Slavonica", tier: 1, reputation: 74,
    clubs: [
      "FK Belovar", "NK Podgorac", "FK Crnobrod", "NK Dunav",
      "FK Zlatna Reka", "FK Varos", "NK Svetlost", "FK Rudnik",
      "FK Orlica", "NK Valov", "FK Borje", "FK Plamen",
      "NK Veternik", "FK Zmajevo", "FK Nova Iskra", "NK Sokolovo",
      "FK Srebrna", "FK Porecan", "NK Jasen", "FK Trebava",
    ],
  },
  // --- Caledonia ---
  {
    name: "Premiership", nation: "Caledonia", tier: 1, reputation: 75,
    clubs: [
      "Clydefield", "Forthcastle", "Gallowmuir", "Harthaven",
      "Invermoss", "Kilmarnoon", "Lochend", "Montdhu",
      "Nethercraig", "Outerwick", "Pitnarroch", "Queenshaugh",
      "Rossmuir", "Strathdorn", "Taycross", "Unionbrae",
      "Westglen", "Ardenmore", "Braemount", "Cairnhill",
    ],
  },
  // --- Emeraldia ---
  {
    name: "Premier Division", nation: "Emeraldia", tier: 1, reputation: 73,
    clubs: [
      "Avondale FC", "Ballinbeg", "Carrowfield", "Dunmore Rovers",
      "Ennismore", "Fairhill", "Gallowglass", "Hilltown United",
      "Inisfail", "Johnsburgh", "Kilcarrig", "Loughrinn",
      "Mournefort", "Newvale", "Oranfield", "Portlawn",
      "Rathmoyle", "Slievemore", "Tullyvane", "Woodlawn",
    ],
  },
  // --- Helvetica ---
  {
    name: "Super League", nation: "Helvetica", tier: 1, reputation: 77,
    clubs: [
      "FC Alpenblick", "SC Basilea", "FC Bielersee", "SC Chablais",
      "FC Emmental", "FC Gruyere", "FC Genevois", "SC Hirzenbach",
      "FC Ilanz", "SC Kandersteg", "FC Lemann", "SC Seduno",
      "FC Münstertal", "SC Neuchatel", "FC Orbe", "SC Rheinfelden",
      "FC Sargans", "SC Simmental", "FC Verbano", "SC Zermatt",
    ],
  },
  // --- Anatolia ---
  {
    name: "Super Lig", nation: "Anatolia", tier: 1, reputation: 81,
    clubs: [
      "Anadolu SK", "Beyazit SK", "Cinar SK", "Deniz FK",
      "Erciyes SK", "Firtina SK", "Gunes SK", "Hilal SK",
      "Irmak SK", "Kaya SK", "Leylek SK", "Marmara SK",
      "Nergis SK", "Ova SK", "Poyraz SK", "Ruzgar SK",
      "Sapanca SK", "Toros SK", "Uludag SK", "Zeytin SK",
    ],
  },
  // --- Hellenia (2 divisions) ---
  {
    name: "Ethniki", nation: "Hellenia", tier: 1, reputation: 76,
    clubs: [
      "AO Aigaio", "AE Anatoli", "AS Argo", "GS Voreia",
      "AE Dokos", "AO Evros", "AO Zefyros", "AE Kyma",
      "AS Lefkos", "AO Mani", "GS Naxos", "AE Orestis",
      "AO Pindos", "AS Thrakis", "AE Tilos", "AO Fthia",
      "GS Chios", "AE Ithaki", "AO Kerkini", "AS Aetos",
    ],
  },
  {
    name: "Football League", nation: "Hellenia", tier: 2, reputation: 63,
    clubs: [
      "AO Agrios", "AE Vathi", "AS Galini", "GS Doridos",
      "AO Egina", "AE Kefalos", "AS Litrion", "GS Mesogios",
      "AO Neapolis", "AE Omiros", "AS Pallini", "GS Parnitha",
      "AO Rouf", "AE Saronikos", "AS Sfakion", "GS Tenedos",
      "AO Ydra", "AE Chalandri", "AS Kaisariani", "AO Filothei",
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Deterministic per-club colors; no two clubs in a league share a primary color */
function clubColors(index: number, rng: SeededRNG): { primary: string; secondary: string } {
  // Golden-angle hue spacing guarantees distinct colors inside a league
  const hue = (index * 137.508 + rng.float(-6, 6) + 360) % 360;
  const secondaryHue = (hue + rng.pick([150, 180, 210, 40, 320])) % 360;
  const primary = hslToHex(hue, rng.float(55, 80), rng.float(38, 55));
  const secondary = hslToHex(secondaryHue, rng.float(30, 70), rng.float(75, 92));
  return { primary, secondary };
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = ln - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const SUFFIXES = /^(fc|sc|ac|as|ss|ssc|vk|vf|vfbl|fbc|ud|sd|cd|ca|nv|bk|sk|fk|nk|if|gf|hv|rc|ofc|excelsior|club|real|atletico|deportivo|nacional|olympique|racing|calcio|virtus|grêmio|gremio|union)\b/i;

function stadiumStem(clubName: string): string {
  const cleaned = clubName
    .replace(SUFFIXES, "")
    .replace(/\b(United|City|Rovers|Wanderers|Athletic|Town|County|FC|FC)\b/gi, "")
    .replace(/[^A-Za-zÀ-ÿ ]/g, "")
    .trim();
  const firstWord = cleaned.split(/\s+/)[0] || clubName.split(/\s+/)[0];
  return firstWord.length > 2 ? firstWord : clubName.split(/\s+/)[0];
}

const STADIUM_SUFFIX: Record<string, string[]> = {
  Bretherland: ["Park", "Stadium", "Ground", "Arena"],
  Valdoria: ["Estadio", "Estadio del", "Campo"],
  Azzuriland: ["Stadio", "Arena"],
  Gallonde: ["Stade", "Stade de"],
  Schwarzland: ["Stadion", "Arena"],
  Oranjeland: ["Stadion", "Arena"],
  Nordheim: ["Stadion", "Arena"],
  Campoverde: ["Estadio", "Estadio Municipal"],
  Lusitana: ["Estadio", "Estadio de"],
  Slavonica: ["Stadion", "Arena"],
  Caledonia: ["Park", "Stadium", "Arena"],
  Emeraldia: ["Park", "Stadium", "Ground"],
  Helvetica: ["Arena", "Stadion", "Stade"],
  Anatolia: ["Stadyumu", "Arena"],
  Hellenia: ["Gipedo", "Stadio"],
};

function stadiumName(nation: string, clubName: string, rng: SeededRNG): string {
  const suffixes = STADIUM_SUFFIX[nation] ?? ["Stadium"];
  const suffix = rng.pick(suffixes);
  const stem = stadiumStem(clubName);
  if (suffix.startsWith("Stade") || suffix.startsWith("Estadio del") || suffix.startsWith("Estadio de") || suffix.startsWith("Gipedo")) {
    return `${suffix} ${stem}`;
  }
  if (suffix === "Stadyumu") return `${stem} ${suffix}`;
  return `${stem} ${suffix}`;
}

/** Formations grouped by compatible play styles (coherent tactical identity) */
const STYLE_BY_FORMATION: Record<string, PlayStyle[]> = {
  "4-3-3": [PlayStyle.PossessionBased, PlayStyle.TikiTaka, PlayStyle.GegenpressingStyle, PlayStyle.WingPlay],
  "4-3-3 Holding": [PlayStyle.PossessionBased, PlayStyle.Balanced, PlayStyle.TikiTaka],
  "4-3-3 Diamond": [PlayStyle.PossessionBased, PlayStyle.TikiTaka],
  "4-4-2": [PlayStyle.Balanced, PlayStyle.DirectCounterAttack, PlayStyle.LongBallDirect, PlayStyle.WingPlay],
  "4-4-2 Diamond": [PlayStyle.PossessionBased, PlayStyle.TikiTaka],
  "4-2-3-1": [PlayStyle.PossessionBased, PlayStyle.GegenpressingStyle, PlayStyle.Balanced, PlayStyle.DirectCounterAttack],
  "4-1-4-1": [PlayStyle.ParkTheBus, PlayStyle.DirectCounterAttack, PlayStyle.Balanced],
  "4-5-1": [PlayStyle.ParkTheBus, PlayStyle.DirectCounterAttack, PlayStyle.LongBallDirect],
  "3-5-2": [PlayStyle.GegenpressingStyle, PlayStyle.WingPlay, PlayStyle.PossessionBased],
  "3-4-3": [PlayStyle.GegenpressingStyle, PlayStyle.WingPlay, PlayStyle.TotalFootball],
  "3-4-2-1": [PlayStyle.GegenpressingStyle, PlayStyle.Balanced],
  "5-3-2": [PlayStyle.ParkTheBus, PlayStyle.DirectCounterAttack],
  "5-4-1": [PlayStyle.ParkTheBus, PlayStyle.DirectCounterAttack],
  "4-2-2-2": [PlayStyle.DirectCounterAttack, PlayStyle.Balanced],
  "4-1-2-1-2": [PlayStyle.PossessionBased, PlayStyle.TikiTaka],
  "4-3-2-1": [PlayStyle.PossessionBased, PlayStyle.TikiTaka],
  "4-2-4": [PlayStyle.TotalFootball, PlayStyle.WingPlay],
  "3-6-1": [PlayStyle.PossessionBased, PlayStyle.TikiTaka],
  "4-1-3-2": [PlayStyle.GegenpressingStyle, PlayStyle.Balanced],
  "4-4-1-1": [PlayStyle.DirectCounterAttack, PlayStyle.Balanced],
  "4-3-1-2": [PlayStyle.PossessionBased, PlayStyle.TikiTaka],
  "3-4-1-2": [PlayStyle.GegenpressingStyle, PlayStyle.PossessionBased],
  "5-2-3": [PlayStyle.DirectCounterAttack, PlayStyle.WingPlay],
  "3-3-4": [PlayStyle.TotalFootball, PlayStyle.WingPlay],
  "3-5-1-1": [PlayStyle.PossessionBased, PlayStyle.Balanced],
  "3-1-4-2": [PlayStyle.PossessionBased, PlayStyle.GegenpressingStyle],
  "4-2-1-3": [PlayStyle.DirectCounterAttack, PlayStyle.Balanced],
  "5-1-4": [PlayStyle.ParkTheBus, PlayStyle.DirectCounterAttack],
  "4-1-1-5": [PlayStyle.RouteOne, PlayStyle.LongBallDirect],
  "4-6-0": [PlayStyle.PossessionBased, PlayStyle.TikiTaka],
  "3-2-4-1": [PlayStyle.PossessionBased, PlayStyle.Balanced],
  "2-3-5": [PlayStyle.TotalFootball, PlayStyle.RouteOne],
};

const MANAGER_PERSONALITIES = Object.values(ManagerPersonality);

// ---------------------------------------------------------------------------
// World generation
// ---------------------------------------------------------------------------

export interface GeneratedWorld {
  leagues: League[];
  clubs: Club[];
  managers: Manager[];
  players: Player[];
}

/**
 * Generate the complete fictional football world from a seed.
 * Deterministic: same seed -> identical world.
 */
export function generateAllLeagues(seed: number): GeneratedWorld {
  const rng = new SeededRNG(seed);
  const leagues: League[] = [];
  const clubs: Club[] = [];
  const managers: Manager[] = [];
  const players: Player[] = [];
  const usedIds = new Set<string>();

  const uniqueId = (base: string): string => {
    let id = base;
    let n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    return id;
  };

  for (const def of LEAGUES_DATA) {
    const leagueId = uniqueId(slugify(def.name));
    const league: League = {
      id: leagueId,
      name: def.name,
      nation: def.nation,
      nationFlag: NATIONALITY_FLAGS[def.nation] ?? "🏳️",
      tier: def.tier,
      reputation: def.reputation,
      clubIds: [],
    };

    for (let i = 0; i < def.clubs.length; i++) {
      const clubName = def.clubs[i];
      const clubId = uniqueId(slugify(clubName));
      const { primary, secondary } = clubColors(i, rng);

      // Reputation: top of the league stronger, offset by league reputation
      let repOffset: number;
      if (i < 3) repOffset = rng.int(6, 14);
      else if (i < 8) repOffset = rng.int(-2, 6);
      else if (i < 14) repOffset = rng.int(-6, 2);
      else repOffset = rng.int(-14, -6);
      const reputation = clamp(Math.round(def.reputation + repOffset), 25, 96);

      // Stadium capacity: 15,000-80,000 (top clubs bigger)
      let capacity: number;
      if (reputation >= 82) capacity = rng.int(45_000, 80_000);
      else if (reputation >= 72) capacity = rng.int(30_000, 55_000);
      else if (reputation >= 60) capacity = rng.int(20_000, 40_000);
      else capacity = rng.int(15_000, 30_000);

      const repNorm = (reputation - 30) / 65; // 0..1
      const budget = Math.round((0.2 + repNorm ** 2 * 6) * 25_000_000 + rng.int(0, 3_000_000));
      const wageBudget = Math.round(budget / 9);

      // Manager
      const managerSeed = rng.int(1, 2 ** 30);
      const mgrRng = new SeededRNG(managerSeed);
      const mgrName = generateName(def.nation, mgrRng);
      const formation = mgrRng.pick(Object.keys(STYLE_BY_FORMATION));
      const styles = STYLE_BY_FORMATION[formation] ?? [PlayStyle.Balanced];
      const manager: Manager = {
        id: uniqueId(`mgr-${slugify(clubName)}`),
        firstName: mgrName.firstName,
        lastName: mgrName.lastName,
        nationality: def.nation,
        personality: mgrRng.pick(MANAGER_PERSONALITIES),
        reputation: clamp(Math.round(reputation + mgrRng.int(-8, 5)), 20, 95),
        clubId,
        formation,
        playStyle: mgrRng.pick(styles),
        tacticalFlexibility: mgrRng.int(4, 18),
      };
      managers.push(manager);

      const club: Club = {
        id: clubId,
        name: clubName,
        shortName: shortName(clubName),
        primaryColor: primary,
        secondaryColor: secondary,
        stadiumName: stadiumName(def.nation, clubName, rng),
        stadiumCapacity: capacity,
        leagueId,
        budget,
        wageBudget,
        reputation,
        fanBaseSize: Math.round(capacity * (0.7 + repNorm * 1.1) * rng.float(0.9, 1.2)),
        playerIds: [],
        managerId: manager.id,
        facilities: {
          training: clamp(Math.round(repNorm * 9 + rng.int(0, 3)), 1, 10),
          youth: clamp(Math.round(repNorm * 9 + rng.int(0, 3)), 1, 10),
          stadium: clamp(Math.round((capacity / 80_000) * 10 + rng.int(0, 2)), 1, 10),
        },
        leaguePosition: 0,
      };

      // Squad: strength keyed by league standing and league reputation
      const rank = i + 1;
      const leagueLevel = rank + (def.tier === 2 ? 12 : 0) + (def.reputation < 78 ? 6 : 0);
      const squadSeed = (seed ^ hashStr(clubId)) >>> 0;
      const squad = generateSquad(clubId, leagueLevel, def.nation, new SeededRNG(squadSeed), squadSeed);
      const wageScale = def.reputation / 82;
      for (const p of squad) {
        p.id = uniqueId(p.id);
        p.contract.clubId = clubId;
        p.contract.weeklyWage = Math.round(p.contract.weeklyWage * wageScale);
        p.contract.transferValue = Math.round(p.contract.transferValue * wageScale);
        club.playerIds.push(p.id);
        players.push(p);
      }

      clubs.push(club);
      league.clubIds.push(club.id);
    }

    leagues.push(league);
  }

  return { leagues, clubs, managers, players };
}

function shortName(name: string): string {
  const words = name.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export { NAME_POOLS };
