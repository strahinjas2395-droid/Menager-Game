/**
 * Offline contemporary-era database.
 *
 * Names remain deliberately transformed, matching the rest of the unofficial
 * game. This is a stable 2026-era snapshot rather than a live transfer feed.
 * The generated squad supplies depth; these records anchor recognisable active
 * marquee players to a compatible position without introducing an overall.
 */
import {
  PlaystyleTag,
  PrimaryPosition,
  type Player,
} from "@/types";
import {
  assignCompatiblePlayerAliases,
  type IconicPlayerAlias,
} from "@/database/footballIdentities";

export interface ModernPlayerIdentity extends IconicPlayerAlias {
  age: number;
  height: number;
  weight: number;
  preferredFoot: "Left" | "Right";
  tier: 1 | 2 | 3;
  secondaryPositions?: readonly PrimaryPosition[];
}

function modern(
  name: string,
  position: PrimaryPosition,
  age: number,
  height: number,
  weight: number,
  foot: "L" | "R",
  tier: 1 | 2 | 3,
  playstyles: readonly PlaystyleTag[] = [],
  secondaryPositions: readonly PrimaryPosition[] = [],
): ModernPlayerIdentity {
  const [firstName, ...lastName] = name.split(" ");
  return {
    firstName,
    lastName: lastName.join(" "),
    position,
    age,
    height,
    weight,
    preferredFoot: foot === "L" ? "Left" : "Right",
    tier,
    playstyles,
    secondaryPositions,
  };
}

const P = PrimaryPosition;
const T = PlaystyleTag;

/** Active-player-inspired fictional identities for the contemporary mode. */
export const MODERN_PLAYER_ALIASES: Readonly<Record<string, readonly ModernPlayerIdentity[]>> = {
  // Bretherland
  "Manchester Sky": [
    modern("Erling Haalund", P.ST, 26, 195, 94, "L", 1, [T.PaceAbuser, T.ClinicalFinisher]),
    modern("Rodry Hernandes", P.CDM, 30, 191, 82, "R", 1, [T.Playmaker, T.Interceptor]),
    modern("Phil Fodden", P.CAM, 26, 171, 70, "L", 2, [T.Dribbler, T.Playmaker], [P.RW]),
  ],
  "Liverpool Mersey": [
    modern("Mohamad Salahh", P.RW, 34, 175, 71, "L", 1, [T.CreativeInsideForward, T.ClinicalFinisher]),
    modern("Florian Wirtze", P.CAM, 23, 177, 71, "R", 1, [T.Playmaker, T.Dribbler]),
    modern("Alex Isakk", P.ST, 27, 192, 77, "R", 1, [T.PaceAbuser, T.ClinicalFinisher]),
    modern("Virgil Van Dyk", P.CB, 35, 195, 92, "R", 1, [T.Leader, T.AerialThreat]),
  ],
  "North London Cannons": [
    modern("Bukayo Sakah", P.RW, 25, 178, 72, "L", 1, [T.Dribbler, T.Crosser]),
    modern("Martin Odegardd", P.CAM, 27, 178, 69, "L", 1, [T.Playmaker, T.ThroughBallSpecialist]),
    modern("Declan Rize", P.CDM, 27, 188, 80, "R", 1, [T.BoxToBox, T.BallWinner], [P.CM]),
    modern("William Salibah", P.CB, 25, 192, 92, "R", 1, [T.BallPlayingDefender, T.Interceptor]),
  ],
  "Chelsea Borough": [
    modern("Cole Palmar", P.CAM, 24, 189, 76, "L", 1, [T.Playmaker, T.ClinicalFinisher], [P.RW]),
    modern("Moises Caicedoh", P.CDM, 24, 178, 73, "R", 1, [T.BallWinner, T.PressResistant], [P.CM]),
    modern("Enzo Fernandaz", P.CM, 25, 180, 76, "R", 2, [T.Playmaker, T.BoxToBox]),
    modern("Estevan Willian", P.RW, 19, 176, 71, "L", 2, [T.Dribbler, T.CreativeInsideForward]),
  ],
  "Manchester Scarlet": [
    modern("Bruno Fernandesh", P.CAM, 32, 179, 69, "R", 1, [T.Playmaker, T.Leader]),
    modern("Benjamin Seskoh", P.ST, 23, 195, 85, "R", 2, [T.PaceAbuser, T.AerialThreat]),
    modern("Matheus Cunhah", P.ST, 27, 183, 76, "R", 2, [T.Dribbler, T.PressingForward], [P.CAM]),
    modern("Amad Dialloh", P.RW, 24, 173, 72, "L", 2, [T.CreativeInsideForward, T.Dribbler]),
  ],
  "Tottenham White Hart": [
    modern("Cristian Romerro", P.CB, 28, 185, 79, "R", 2, [T.Leader, T.Interceptor]),
    modern("James Maddisonn", P.CAM, 29, 175, 73, "R", 2, [T.Playmaker, T.SetPieceSpecialist]),
    modern("Dominic Solankee", P.ST, 29, 187, 80, "R", 2, [T.PressingForward, T.ClinicalFinisher]),
  ],
  "Newcastle Magpies": [
    modern("Bruno Guimarais", P.CM, 28, 182, 74, "R", 1, [T.Playmaker, T.PressResistant], [P.CDM]),
    modern("Anthony Gordonn", P.LW, 25, 183, 76, "R", 2, [T.PaceAbuser, T.Winger]),
    modern("Sandro Tonaly", P.CM, 26, 181, 79, "R", 2, [T.BoxToBox, T.Playmaker], [P.CDM]),
  ],
  "Birmingham Villans": [
    modern("Ollie Watkinz", P.ST, 30, 180, 70, "R", 2, [T.PaceAbuser, T.ClinicalFinisher]),
    modern("Morgan Rogars", P.CAM, 24, 189, 77, "R", 2, [T.Dribbler, T.PaceAbuser], [P.LW]),
    modern("Emiliano Martines", P.GK, 34, 195, 88, "R", 1, [T.Leader]),
  ],
  "Brighton Seabirds": [
    modern("Kaoru Mitomah", P.LW, 29, 178, 73, "R", 2, [T.Dribbler, T.Winger]),
    modern("Carlos Balebah", P.CDM, 22, 179, 77, "L", 2, [T.BallWinner, T.BoxToBox]),
  ],
  "East London Irons": [modern("Jarrod Bowenn", P.RW, 29, 175, 70, "L", 2, [T.CreativeInsideForward, T.ClinicalFinisher])],
  "South London Eagles": [modern("Jean-Philippe Matetah", P.ST, 29, 192, 88, "R", 2, [T.TargetMan, T.ClinicalFinisher])],
  "Everton Royal Blue": [modern("Jordan Pickfort", P.GK, 32, 185, 77, "L", 2, [T.Leader])],
  "Nottingham Sherwood": [modern("Morgan Gibbs-Whyte", P.CAM, 26, 171, 70, "R", 2, [T.Playmaker, T.Dribbler])],
  "Leeds White Rose": [modern("Daniel Jamez", P.RW, 28, 171, 76, "R", 3, [T.PaceAbuser, T.Winger])],
  "Sunderland Black Cats": [modern("Granit Xhakaa", P.CM, 34, 186, 80, "L", 2, [T.Playmaker, T.Leader], [P.CDM])],

  // Valdoria
  "Madrid Royal White": [
    modern("Kylian Mbappeh", P.ST, 27, 178, 75, "R", 1, [T.PaceAbuser, T.ClinicalFinisher], [P.LW]),
    modern("Vini Juniorr", P.LW, 26, 176, 73, "R", 1, [T.Dribbler, T.PaceAbuser]),
    modern("Jude Bellingam", P.CAM, 23, 186, 75, "R", 1, [T.BoxToBox, T.SpaceInterpreter], [P.CM]),
    modern("Fede Valverdi", P.CM, 28, 182, 78, "R", 1, [T.BoxToBox, T.LongShotSpecialist]),
    modern("Thibaut Courtoiss", P.GK, 34, 200, 96, "L", 1, [T.Leader]),
  ],
  "Barcelona Blau": [
    modern("Lamine Yamall", P.RW, 19, 180, 72, "L", 1, [T.Dribbler, T.CreativeInsideForward]),
    modern("Pedri Gonzales", P.CM, 23, 174, 60, "R", 1, [T.Playmaker, T.PressResistant]),
    modern("Rafinha Dias", P.LW, 29, 176, 68, "L", 1, [T.CreativeInsideForward, T.ClinicalFinisher], [P.RW]),
    modern("Pau Cubarsih", P.CB, 19, 184, 75, "R", 2, [T.BallPlayingDefender, T.Interceptor]),
  ],
  "Madrid Red-White": [
    modern("Julian Alvares", P.ST, 26, 170, 71, "R", 1, [T.PressingForward, T.ClinicalFinisher]),
    modern("Jan Oblakk", P.GK, 33, 188, 87, "R", 1, [T.Leader]),
    modern("Pablo Barrioss", P.CM, 23, 181, 75, "R", 2, [T.BoxToBox, T.PressResistant]),
  ],
  "Bilbao Lions": [
    modern("Nico Williamz", P.LW, 24, 181, 67, "R", 1, [T.PaceAbuser, T.Winger]),
    modern("Oihan Sancett", P.CAM, 26, 188, 73, "R", 2, [T.SpaceInterpreter, T.Playmaker]),
    modern("Unai Simonn", P.GK, 29, 190, 88, "R", 2, [T.Leader]),
  ],
  "San Sebastian Royal": [
    modern("Mikel Oyarzaball", P.ST, 29, 181, 78, "L", 2, [T.ClinicalFinisher, T.SpaceInterpreter], [P.LW]),
    modern("Take Kuboh", P.RW, 25, 173, 64, "L", 2, [T.Dribbler, T.CreativeInsideForward]),
  ],
  "Villarreal Yellow": [modern("Gerard Morenoh", P.ST, 34, 180, 77, "L", 2, [T.ClinicalFinisher, T.Playmaker])],
  "Seville Green-White": [
    modern("Isco Alarconn", P.CAM, 34, 176, 79, "R", 2, [T.Playmaker, T.PressResistant]),
    modern("Antony Santoss", P.RW, 26, 174, 63, "L", 2, [T.Dribbler, T.CreativeInsideForward]),
  ],
  "Valencia Bats": [modern("Javi Guerrah", P.CM, 23, 187, 77, "R", 3, [T.BoxToBox, T.Playmaker])],

  // Azzuriland
  "Milan Redblack": [
    modern("Rafael Leaoh", P.LW, 27, 188, 81, "R", 1, [T.PaceAbuser, T.Dribbler]),
    modern("Christian Pulisik", P.RW, 28, 178, 73, "R", 2, [T.CreativeInsideForward, T.Dribbler]),
    modern("Mike Magnan", P.GK, 31, 191, 89, "R", 1, [T.Leader]),
  ],
  "Milan Nerazzurro": [
    modern("Lautaro Martines", P.ST, 29, 174, 72, "R", 1, [T.ClinicalFinisher, T.PressingForward]),
    modern("Nicolo Barelah", P.CM, 29, 175, 68, "R", 1, [T.BoxToBox, T.Playmaker]),
    modern("Alessandro Bastony", P.CB, 27, 190, 81, "L", 1, [T.BallPlayingDefender, T.Interceptor]),
  ],
  "Turin Zebra": [
    modern("Kenan Yildizz", P.CAM, 21, 185, 77, "R", 2, [T.Dribbler, T.CreativeInsideForward], [P.LW]),
    modern("Gleison Bremerr", P.CB, 29, 188, 80, "R", 1, [T.Interceptor, T.AerialThreat]),
    modern("Jonathan Davidd", P.ST, 26, 175, 70, "R", 2, [T.PaceAbuser, T.ClinicalFinisher]),
  ],
  "Naples Azure": [
    modern("Kevan De Bruyne", P.CAM, 35, 181, 70, "R", 1, [T.Playmaker, T.ThroughBallSpecialist]),
    modern("Scott McTominai", P.CM, 29, 193, 88, "R", 2, [T.BoxToBox, T.AerialThreat]),
    modern("Romelu Lukakuh", P.ST, 33, 191, 94, "L", 2, [T.TargetMan, T.ClinicalFinisher]),
  ],
  "Rome Wolves": [
    modern("Paulo Dybaloh", P.CAM, 32, 177, 75, "L", 2, [T.Playmaker, T.CreativeInsideForward]),
    modern("Mile Svilarr", P.GK, 27, 189, 82, "R", 2, []),
    modern("Manu Koneh", P.CM, 25, 185, 80, "R", 2, [T.BoxToBox, T.BallWinner]),
  ],
  "Rome Eagles": [modern("Mattia Zaccagnih", P.LW, 31, 177, 63, "R", 2, [T.Dribbler, T.CreativeInsideForward])],
  "Bergamo Goddess": [modern("Ademola Lookmann", P.LW, 29, 174, 71, "R", 2, [T.PaceAbuser, T.ClinicalFinisher])],

  // Gallonde
  "Paris Stars": [
    modern("Ousmane Dembeli", P.RW, 29, 178, 67, "L", 1, [T.Dribbler, T.ClinicalFinisher]),
    modern("Khvicha Kvaratskelia", P.LW, 25, 183, 70, "R", 1, [T.Dribbler, T.CreativeInsideForward]),
    modern("Vitor Ferreirah", P.CM, 26, 172, 64, "R", 1, [T.Playmaker, T.PressResistant]),
    modern("Achraf Hakimy", P.RB, 27, 181, 73, "R", 1, [T.FullBackRunner, T.PaceAbuser]),
    modern("Desire Doueh", P.CAM, 21, 181, 79, "R", 2, [T.Dribbler, T.Playmaker], [P.RW]),
  ],
  "Marseille Phoceans": [
    modern("Mason Greenwud", P.RW, 25, 181, 70, "L", 2, [T.CreativeInsideForward, T.ClinicalFinisher]),
    modern("Pierre Hojberg", P.CDM, 31, 185, 84, "R", 2, [T.BallWinner, T.Leader]),
  ],
  "Monaco Principality": [modern("Folarin Balogunn", P.ST, 25, 178, 70, "R", 2, [T.PaceAbuser, T.ClinicalFinisher])],
  "Lyon Lions": [modern("Corentin Tolissot", P.CM, 32, 181, 81, "R", 2, [T.BoxToBox, T.Leader])],

  // Schwarzland
  "Munich Red": [
    modern("Harry Kain", P.ST, 33, 188, 86, "R", 1, [T.ClinicalFinisher, T.Playmaker]),
    modern("Jamal Musialah", P.CAM, 23, 184, 72, "R", 1, [T.Dribbler, T.PressResistant]),
    modern("Joshua Kimmick", P.CDM, 31, 177, 75, "R", 1, [T.Playmaker, T.Leader], [P.CM, P.RB]),
    modern("Michael Oliseh", P.RW, 24, 184, 76, "L", 1, [T.CreativeInsideForward, T.Playmaker]),
  ],
  "Dortmund Yellow Wall": [
    modern("Serhou Guirassyh", P.ST, 30, 187, 82, "R", 1, [T.ClinicalFinisher, T.AerialThreat]),
    modern("Julian Brandtt", P.CAM, 30, 185, 83, "R", 2, [T.Playmaker, T.SpaceInterpreter]),
    modern("Karim Adeyemih", P.RW, 24, 180, 75, "L", 2, [T.PaceAbuser, T.Dribbler]),
  ],
  "Leverkusen Werkself": [
    modern("Patrik Schickk", P.ST, 30, 191, 87, "L", 2, [T.ClinicalFinisher, T.AerialThreat]),
    modern("Alex Grimaldoh", P.LB, 31, 171, 63, "L", 2, [T.FullBackRunner, T.SetPieceSpecialist]),
    modern("Malik Tillmann", P.CAM, 24, 187, 71, "R", 2, [T.SpaceInterpreter, T.Playmaker]),
  ],
  "Frankfurt Eagles": [modern("Can Uzunn", P.CAM, 20, 186, 76, "R", 3, [T.Dribbler, T.Playmaker])],

  // Oranjeland and Nordheim
  "Amsterdam Artists": [
    modern("Kenneth Taylorr", P.CM, 24, 182, 74, "L", 2, [T.BoxToBox, T.Playmaker]),
    modern("Mika Godtss", P.LW, 21, 176, 70, "R", 3, [T.Dribbler, T.Winger]),
  ],
  "Eindhoven Lamps": [
    modern("Joey Veermann", P.CM, 27, 185, 81, "R", 2, [T.Playmaker, T.LongShotSpecialist]),
    modern("Ricardo Pepih", P.ST, 23, 185, 78, "R", 2, [T.ClinicalFinisher, T.Poacher]),
  ],
  "Rotterdam South": [modern("Quinten Timberr", P.CM, 25, 177, 71, "R", 2, [T.BoxToBox, T.PressResistant])],
  "Bodo Lightning": [
    modern("Patrick Bergg", P.CM, 28, 180, 72, "R", 3, [T.Playmaker, T.Leader], [P.CDM]),
    modern("Kasper Hogh", P.ST, 25, 186, 80, "R", 3, [T.ClinicalFinisher, T.AerialThreat]),
  ],

  // Campoverde
  "Rio Flamengo": [
    modern("Giorgian Arrascaetah", P.CAM, 32, 174, 73, "R", 2, [T.Playmaker, T.SetPieceSpecialist]),
    modern("Pedro Guilhermi", P.ST, 29, 185, 78, "R", 2, [T.ClinicalFinisher, T.TargetMan]),
    modern("Jorge Jorginhio", P.CM, 34, 180, 65, "R", 2, [T.Playmaker, T.PressResistant], [P.CDM]),
  ],
  "Sao Paulo Palmeiras": [
    modern("Vitor Roqueh", P.ST, 21, 174, 78, "R", 2, [T.PaceAbuser, T.ClinicalFinisher]),
    modern("Raphael Veigah", P.CAM, 31, 176, 73, "L", 2, [T.Playmaker, T.SetPieceSpecialist]),
  ],
  "Sao Paulo Corinthians": [
    modern("Memphis Depayy", P.ST, 32, 178, 78, "R", 2, [T.Dribbler, T.ClinicalFinisher], [P.LW]),
    modern("Yuri Albertoh", P.ST, 25, 183, 78, "R", 2, [T.PaceAbuser, T.Poacher]),
  ],
  "Santos Coast": [modern("Ney Marinhio", P.LW, 34, 175, 68, "R", 1, [T.Dribbler, T.Playmaker], [P.CAM])],
  "Sao Paulo Tricolor": [modern("Lucas Mourah", P.RW, 34, 172, 72, "R", 2, [T.PaceAbuser, T.Dribbler])],
  "Rio Fluminense": [modern("Thiago Silvah", P.CB, 41, 183, 79, "R", 2, [T.Leader, T.Interceptor])],

  // Lusitana
  "Lisbon Eagles": [
    modern("Vangelis Pavlidiss", P.ST, 27, 186, 82, "R", 2, [T.ClinicalFinisher, T.Poacher]),
    modern("Antonio Silvah", P.CB, 22, 187, 79, "R", 2, [T.BallPlayingDefender, T.Interceptor]),
  ],
  "Porto Dragons": [
    modern("Diogo Costah", P.GK, 27, 186, 81, "R", 1, []),
    modern("Samu Aghehowah", P.ST, 22, 193, 88, "R", 2, [T.TargetMan, T.ClinicalFinisher]),
  ],
  "Lisbon Lions": [
    modern("Pedro Goncalvess", P.CAM, 28, 173, 77, "R", 2, [T.Playmaker, T.ClinicalFinisher]),
    modern("Francisco Trincaoh", P.RW, 26, 184, 77, "L", 2, [T.CreativeInsideForward, T.Dribbler]),
  ],

  // Slavonica, Caledonia and Helvetica
  "Belgrade Red Constellation": [
    modern("Marko Arnautovik", P.ST, 37, 192, 83, "R", 2, [T.TargetMan, T.ClinicalFinisher]),
    modern("Aleksandar Kataii", P.LW, 35, 182, 74, "R", 3, [T.Playmaker, T.SetPieceSpecialist]),
  ],
  "Zagreb Blue": [modern("Josip Misikk", P.CDM, 32, 187, 78, "R", 3, [T.Playmaker, T.Leader])],
  "Glasgow Hoops": [
    modern("Daizen Maedah", P.LW, 28, 173, 67, "R", 2, [T.PaceAbuser, T.PressingForward]),
    modern("Callum McGregorr", P.CM, 33, 178, 67, "L", 2, [T.Playmaker, T.Leader], [P.CDM]),
  ],
  "Glasgow Light Blues": [
    modern("James Tavernierre", P.RB, 34, 182, 75, "R", 2, [T.FullBackRunner, T.SetPieceSpecialist]),
    modern("Jack Butlandd", P.GK, 33, 196, 96, "R", 2, [T.Leader]),
  ],
  "Basel Red-Blue": [modern("Xherdan Shaqiry", P.CAM, 34, 169, 72, "L", 2, [T.Playmaker, T.LongShotSpecialist], [P.RW])],

  // Anatolia and Hellenia
  "Istanbul Lions": [
    modern("Victor Osimhenh", P.ST, 27, 186, 77, "R", 1, [T.PaceAbuser, T.AerialThreat]),
    modern("Mauro Icardii", P.ST, 33, 181, 75, "R", 2, [T.Poacher, T.ClinicalFinisher]),
    modern("Leroy Saneh", P.RW, 30, 183, 80, "L", 2, [T.PaceAbuser, T.CreativeInsideForward]),
  ],
  "Istanbul Canaries": [
    modern("Ederson Moraess", P.GK, 33, 188, 89, "L", 1, [T.Playmaker]),
    modern("Marco Asensioh", P.CAM, 30, 182, 76, "L", 2, [T.Playmaker, T.LongShotSpecialist], [P.RW]),
  ],
  "Istanbul Black Eagles": [
    modern("Tammy Abrahamh", P.ST, 29, 194, 86, "R", 2, [T.TargetMan, T.ClinicalFinisher]),
    modern("Orkun Kokcuh", P.CM, 25, 175, 70, "R", 2, [T.Playmaker, T.BoxToBox]),
  ],
  "Piraeus Red-White": [
    modern("Ayoub El Kaabih", P.ST, 33, 182, 77, "L", 2, [T.ClinicalFinisher, T.Poacher]),
    modern("Daniel Podenceh", P.LW, 30, 165, 58, "R", 2, [T.Dribbler, T.CreativeInsideForward]),
  ],
};

export function modernPlayerIdentityId(identity: Pick<ModernPlayerIdentity, "firstName" | "lastName">): string {
  return `${identity.firstName}-${identity.lastName}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function floor(player: Player, key: keyof Player, value: number): void {
  const current = player[key];
  if (typeof current === "number") (player[key] as number) = Math.max(current, value);
}

function applyModernAbilityShape(player: Player, identity: ModernPlayerIdentity): void {
  const star = identity.tier === 1 ? 18 : identity.tier === 2 ? 17 : 15;
  const strong = Math.max(14, star - 1);
  switch (identity.position) {
    case P.GK:
      for (const key of ["reflexes", "shotStopping", "handling", "oneOnOnes", "positioning"] as const) floor(player, key, star);
      break;
    case P.CB:
      for (const key of ["marking", "tackling", "interceptions", "positioning", "aerialDuels"] as const) floor(player, key, star);
      break;
    case P.RB:
    case P.LB:
      for (const key of ["pace", "acceleration", "crossing", "tackling", "workRate"] as const) floor(player, key, strong);
      break;
    case P.CDM:
      for (const key of ["positioning", "interceptions", "shortPassing", "decisions", "teamwork"] as const) floor(player, key, star);
      break;
    case P.CM:
      for (const key of ["shortPassing", "technique", "decisions", "workRate", "ballControl"] as const) floor(player, key, star);
      break;
    case P.CAM:
      for (const key of ["creativity", "technique", "shortPassing", "ballControl", "flair"] as const) floor(player, key, star);
      break;
    case P.RW:
    case P.LW:
      for (const key of ["pace", "acceleration", "dribbling", "ballControl", "flair"] as const) floor(player, key, star);
      floor(player, "crossing", strong);
      break;
    case P.ST:
      for (const key of ["finishing", "offTheBall", "composure", "anticipation"] as const) floor(player, key, star);
      break;
  }

  if (identity.playstyles?.includes(T.PaceAbuser)) {
    floor(player, "pace", star);
    floor(player, "acceleration", star);
  }
  if (identity.playstyles?.includes(T.Playmaker)) {
    floor(player, "creativity", star);
    floor(player, "shortPassing", star);
    floor(player, "technique", star);
  }
  if (identity.playstyles?.includes(T.ClinicalFinisher)) floor(player, "finishing", star);
  if (identity.playstyles?.includes(T.Dribbler)) floor(player, "dribbling", star);
  if (identity.playstyles?.includes(T.Crosser)) floor(player, "crossing", star);
  if (identity.playstyles?.includes(T.LongShotSpecialist)) floor(player, "longShots", star);
  if (identity.playstyles?.includes(T.SetPieceSpecialist)) floor(player, "freeKickAccuracy", star);
  if (identity.playstyles?.includes(T.AerialThreat)) {
    floor(player, "heading", star);
    floor(player, "jumping", strong);
  }
  if (identity.playstyles?.includes(T.BallWinner)) {
    floor(player, "tackling", star);
    floor(player, "interceptions", star);
  }
}

/** Apply the contemporary identity layer without any iconic-prime behavior. */
export function applyModernPlayerAliases(clubName: string, squad: Player[]): Player[] {
  const aliases = MODERN_PLAYER_ALIASES[clubName];
  if (!aliases?.length) return squad;
  return assignCompatiblePlayerAliases(squad, aliases, (selected, identity) => {
    selected.modernPlayerIdentityId = modernPlayerIdentityId(identity);
    selected.iconicPrimeProfileId = undefined;
    selected.age = identity.age;
    selected.height = identity.height;
    selected.weight = identity.weight;
    selected.preferredFoot = identity.preferredFoot;
    selected.secondaryPositions = [...new Set([...identity.secondaryPositions ?? [], ...selected.secondaryPositions])]
      .filter((position) => position !== selected.primaryPosition);
    applyModernAbilityShape(selected, identity);
    selected.reputation = Math.max(selected.reputation, identity.tier === 1 ? 94 : identity.tier === 2 ? 88 : 82);
    selected.potentialCeiling = Math.max(selected.potentialCeiling, identity.tier === 1 ? 19 : identity.tier === 2 ? 18 : 17);
  });
}
