import { PrimaryPosition, type Player } from "@/types";

/**
 * Prime-era behavioural fingerprints for the game's transformed iconic aliases.
 *
 * Values are tendencies, not ratings: 0 means strongly avoids, 0.5 is neutral,
 * and 1 means signature-level preference. Execution still uses the player's
 * physical/technical attributes, pressure, available space, and deterministic RNG.
 */
export interface PrimeDribblingBehavior {
  frequency: number;
  closeControl: number;
  burst: number;
  inside: number;
  outside: number;
  feint: number;
  escape: number;
  shielding: number;
}

export interface PrimeShootingBehavior {
  frequency: number;
  range: number;
  placement: number;
  power: number;
  firstTime: number;
  aerial: number;
  chip: number;
}

export interface PrimePassingBehavior {
  risk: number;
  through: number;
  switch: number;
  crossing: number;
  combination: number;
  directness: number;
  execution: number;
}

export interface PrimeReceivingBehavior {
  security: number;
  halfTurn: number;
  comeShort: number;
  runBeyond: number;
  shielding: number;
  oneTouch: number;
}

export type PrimeArchetype =
  | "channelFinisher"
  | "completeStriker"
  | "poacher"
  | "targetForward"
  | "invertedScorer"
  | "creativeTen"
  | "closeControlCreator"
  | "tempoController"
  | "boxToBoxShooter"
  | "wideCreator"
  | "wingDribbler"
  | "powerWinger"
  | "defensiveReader"
  | "libero"
  | "attackingFullback"
  | "traditionalKeeper"
  | "sweeperKeeper"
  | "setPieceKeeper";

export type PrimeAttributeKey =
  | "ballControl" | "dribbling" | "shortPassing" | "longPassing" | "crossing"
  | "finishing" | "longShots" | "heading" | "freeKickAccuracy" | "penaltyTaking"
  | "technique" | "volleying" | "pace" | "acceleration" | "strength" | "jumping"
  | "agility" | "balance" | "naturalFitness" | "anticipation" | "composure"
  | "concentration" | "creativity" | "decisions" | "determination" | "flair"
  | "leadership" | "offTheBall" | "positioning" | "teamwork" | "workRate"
  | "aggression" | "bravery" | "marking" | "tackling" | "slideTackling"
  | "interceptions" | "aerialDuels" | "reflexes" | "shotStopping" | "oneOnOnes"
  | "communication" | "punching" | "throwing" | "kicking" | "handling"
  | "sweeping" | "distributionGK";

export interface IconicPrimeProfile {
  id: string;
  alias: string;
  peak: string;
  primeAge: number;
  height: number;
  weight: number;
  preferredFoot: "Left" | "Right";
  archetype: PrimeArchetype;
  tier: 1 | 2 | 3;
  summary: string;
  signatures: readonly string[];
  secondaryPositions: readonly PrimaryPosition[];
  dribbling: PrimeDribblingBehavior;
  shooting: PrimeShootingBehavior;
  passing: PrimePassingBehavior;
  receiving: PrimeReceivingBehavior;
  attributeFloors: Readonly<Partial<Record<PrimeAttributeKey, number>>>;
}

type BehaviorOverrides = {
  dribbling?: Partial<PrimeDribblingBehavior>;
  shooting?: Partial<PrimeShootingBehavior>;
  passing?: Partial<PrimePassingBehavior>;
  receiving?: Partial<PrimeReceivingBehavior>;
  attributeFloors?: Partial<Record<PrimeAttributeKey, number>>;
};

interface ProfileSeed extends BehaviorOverrides {
  alias: string;
  peak: string;
  primeAge: number;
  height: number;
  weight: number;
  preferredFoot: "Left" | "Right";
  archetype: PrimeArchetype;
  tier: 1 | 2 | 3;
  summary: string;
  signatures: readonly string[];
  secondaryPositions?: readonly PrimaryPosition[];
}

interface ArchetypeTemplate {
  dribbling: PrimeDribblingBehavior;
  shooting: PrimeShootingBehavior;
  passing: PrimePassingBehavior;
  receiving: PrimeReceivingBehavior;
  attributeFloors: Partial<Record<PrimeAttributeKey, number>>;
}

const d = (
  frequency: number, closeControl: number, burst: number, inside: number,
  outside: number, feint: number, escape: number, shielding: number,
): PrimeDribblingBehavior => ({ frequency, closeControl, burst, inside, outside, feint, escape, shielding });
const s = (
  frequency: number, range: number, placement: number, power: number,
  firstTime: number, aerial: number, chip: number,
): PrimeShootingBehavior => ({ frequency, range, placement, power, firstTime, aerial, chip });
const p = (
  risk: number, through: number, switchPlay: number, crossing: number,
  combination: number, directness: number, execution: number,
): PrimePassingBehavior => ({ risk, through, switch: switchPlay, crossing, combination, directness, execution });
const r = (
  security: number, halfTurn: number, comeShort: number, runBeyond: number,
  shielding: number, oneTouch: number,
): PrimeReceivingBehavior => ({ security, halfTurn, comeShort, runBeyond, shielding, oneTouch });

const ARCHETYPES: Record<PrimeArchetype, ArchetypeTemplate> = {
  channelFinisher: {
    dribbling: d(.56, .62, .96, .58, .64, .44, .48, .7),
    shooting: s(.96, .55, .84, .9, .92, .84, .42),
    passing: p(.34, .38, .22, .24, .48, .62, .72),
    receiving: r(.82, .5, .28, .98, .72, .84),
    attributeFloors: { ballControl: 16, dribbling: 15, finishing: 19, longShots: 15, heading: 17, technique: 17, volleying: 17, pace: 18, acceleration: 18, strength: 16, anticipation: 18, composure: 18, offTheBall: 19 },
  },
  completeStriker: {
    dribbling: d(.7, .78, .78, .68, .6, .66, .68, .74),
    shooting: s(.9, .7, .88, .82, .86, .72, .62),
    passing: p(.64, .68, .38, .48, .76, .62, .82),
    receiving: r(.88, .76, .7, .82, .78, .78),
    attributeFloors: { ballControl: 18, dribbling: 17, shortPassing: 16, finishing: 18, longShots: 17, heading: 16, technique: 18, volleying: 17, pace: 16, acceleration: 16, strength: 15, agility: 16, anticipation: 18, composure: 18, creativity: 16, decisions: 17, offTheBall: 18 },
  },
  poacher: {
    dribbling: d(.34, .64, .62, .5, .48, .38, .44, .58),
    shooting: s(.95, .48, .9, .76, .96, .72, .52),
    passing: p(.3, .28, .16, .2, .52, .52, .7),
    receiving: r(.83, .54, .36, .94, .58, .9),
    attributeFloors: { ballControl: 16, finishing: 19, longShots: 14, heading: 15, technique: 16, volleying: 18, acceleration: 16, anticipation: 19, composure: 18, decisions: 16, offTheBall: 19 },
  },
  targetForward: {
    dribbling: d(.42, .65, .48, .46, .46, .42, .58, .96),
    shooting: s(.87, .58, .82, .9, .86, .94, .42),
    passing: p(.42, .38, .24, .26, .72, .58, .74),
    receiving: r(.84, .46, .84, .58, .98, .88),
    attributeFloors: { ballControl: 17, shortPassing: 15, finishing: 18, longShots: 16, heading: 19, technique: 17, volleying: 17, strength: 19, jumping: 18, balance: 17, anticipation: 17, composure: 17, offTheBall: 17, bravery: 18 },
  },
  invertedScorer: {
    dribbling: d(.78, .8, .9, .96, .36, .78, .64, .58),
    shooting: s(.92, .78, .9, .84, .84, .54, .68),
    passing: p(.56, .62, .34, .5, .72, .58, .8),
    receiving: r(.86, .86, .5, .86, .58, .72),
    attributeFloors: { ballControl: 18, dribbling: 18, shortPassing: 15, crossing: 16, finishing: 18, longShots: 17, technique: 18, pace: 18, acceleration: 18, agility: 18, balance: 16, anticipation: 17, composure: 17, flair: 17, offTheBall: 18 },
  },
  creativeTen: {
    dribbling: d(.7, .88, .62, .72, .48, .78, .9, .7),
    shooting: s(.65, .7, .8, .68, .68, .34, .66),
    passing: p(.9, .94, .72, .58, .9, .66, .94),
    receiving: r(.94, .94, .9, .5, .72, .88),
    attributeFloors: { ballControl: 19, dribbling: 18, shortPassing: 18, longPassing: 17, finishing: 15, longShots: 16, technique: 19, agility: 17, balance: 17, anticipation: 17, composure: 18, creativity: 19, decisions: 18, flair: 19, offTheBall: 16 },
  },
  closeControlCreator: {
    dribbling: d(.88, .98, .72, .84, .48, .9, .96, .68),
    shooting: s(.7, .72, .9, .62, .74, .28, .78),
    passing: p(.9, .96, .68, .52, .94, .64, .96),
    receiving: r(.98, .98, .88, .62, .7, .92),
    attributeFloors: { ballControl: 20, dribbling: 19, shortPassing: 19, longPassing: 17, finishing: 17, longShots: 17, technique: 20, acceleration: 18, agility: 19, balance: 19, anticipation: 18, composure: 19, creativity: 20, decisions: 19, flair: 20, offTheBall: 17 },
  },
  tempoController: {
    dribbling: d(.46, .92, .34, .54, .42, .62, .94, .62),
    shooting: s(.34, .48, .68, .56, .48, .2, .38),
    passing: p(.76, .9, .94, .5, .98, .52, .98),
    receiving: r(.98, .94, .96, .24, .66, .96),
    attributeFloors: { ballControl: 19, dribbling: 16, shortPassing: 20, longPassing: 19, technique: 19, balance: 17, anticipation: 19, composure: 19, creativity: 19, decisions: 20, teamwork: 19, positioning: 16 },
  },
  boxToBoxShooter: {
    dribbling: d(.6, .72, .72, .6, .58, .58, .7, .76),
    shooting: s(.78, .9, .72, .94, .82, .68, .34),
    passing: p(.7, .76, .84, .58, .72, .78, .84),
    receiving: r(.82, .72, .62, .72, .76, .7),
    attributeFloors: { ballControl: 17, dribbling: 16, shortPassing: 17, longPassing: 18, crossing: 15, finishing: 16, longShots: 19, technique: 18, volleying: 17, strength: 16, naturalFitness: 18, anticipation: 17, composure: 17, creativity: 17, decisions: 17, workRate: 18, offTheBall: 17 },
  },
  wideCreator: {
    dribbling: d(.66, .8, .68, .58, .78, .72, .76, .58),
    shooting: s(.52, .66, .76, .7, .62, .36, .52),
    passing: p(.72, .78, .88, .98, .82, .7, .94),
    receiving: r(.9, .8, .7, .62, .56, .82),
    attributeFloors: { ballControl: 18, dribbling: 17, shortPassing: 17, longPassing: 18, crossing: 19, longShots: 16, freeKickAccuracy: 18, technique: 19, creativity: 18, decisions: 17, flair: 18 },
  },
  wingDribbler: {
    dribbling: d(.94, .96, .86, .72, .78, .98, .9, .54),
    shooting: s(.66, .68, .82, .68, .62, .28, .7),
    passing: p(.66, .72, .54, .76, .76, .62, .84),
    receiving: r(.94, .92, .68, .76, .5, .8),
    attributeFloors: { ballControl: 19, dribbling: 19, shortPassing: 16, crossing: 17, finishing: 16, longShots: 16, technique: 19, pace: 18, acceleration: 19, agility: 19, balance: 18, creativity: 17, flair: 20 },
  },
  powerWinger: {
    dribbling: d(.82, .74, .98, .74, .88, .72, .62, .76),
    shooting: s(.82, .84, .74, .96, .78, .68, .42),
    passing: p(.56, .56, .66, .82, .6, .82, .8),
    receiving: r(.82, .68, .44, .9, .7, .7),
    attributeFloors: { ballControl: 17, dribbling: 18, crossing: 17, finishing: 17, longShots: 18, technique: 17, volleying: 17, pace: 19, acceleration: 19, strength: 17, agility: 17, offTheBall: 17 },
  },
  defensiveReader: {
    dribbling: d(.24, .72, .42, .4, .46, .28, .76, .8),
    shooting: s(.18, .32, .58, .58, .42, .62, .18),
    passing: p(.46, .5, .7, .34, .76, .56, .86),
    receiving: r(.88, .68, .74, .2, .86, .82),
    attributeFloors: { ballControl: 16, shortPassing: 16, longPassing: 15, technique: 16, strength: 17, anticipation: 19, composure: 18, concentration: 19, decisions: 19, leadership: 18, positioning: 20, marking: 19, tackling: 19, interceptions: 19, aerialDuels: 17 },
  },
  libero: {
    dribbling: d(.58, .84, .62, .56, .54, .58, .9, .82),
    shooting: s(.38, .7, .66, .78, .5, .62, .24),
    passing: p(.82, .84, .98, .42, .82, .84, .96),
    receiving: r(.94, .92, .9, .34, .84, .88),
    attributeFloors: { ballControl: 18, dribbling: 16, shortPassing: 18, longPassing: 19, longShots: 16, technique: 18, strength: 17, anticipation: 19, composure: 19, creativity: 17, decisions: 19, leadership: 19, positioning: 19, marking: 18, tackling: 18, interceptions: 19 },
  },
  attackingFullback: {
    dribbling: d(.76, .76, .9, .5, .96, .7, .66, .68),
    shooting: s(.5, .84, .62, .94, .62, .34, .28),
    passing: p(.62, .62, .9, .96, .74, .82, .86),
    receiving: r(.84, .66, .48, .92, .62, .7),
    attributeFloors: { ballControl: 17, dribbling: 17, longPassing: 17, crossing: 19, longShots: 18, freeKickAccuracy: 18, technique: 18, pace: 18, acceleration: 18, strength: 15, naturalFitness: 18, offTheBall: 17, workRate: 18, tackling: 16 },
  },
  traditionalKeeper: {
    dribbling: d(.05, .42, .12, .5, .5, .1, .3, .58),
    shooting: s(.02, .1, .5, .5, .1, .1, .1),
    passing: p(.3, .2, .56, .18, .62, .56, .7),
    receiving: r(.78, .3, .62, .08, .72, .58),
    attributeFloors: { concentration: 19, anticipation: 18, composure: 18, decisions: 18, leadership: 18, reflexes: 19, shotStopping: 19, oneOnOnes: 19, communication: 19, handling: 19, kicking: 15, throwing: 16, sweeping: 14, distributionGK: 15 },
  },
  sweeperKeeper: {
    dribbling: d(.2, .76, .48, .5, .5, .3, .78, .7),
    shooting: s(.03, .1, .5, .55, .1, .1, .1),
    passing: p(.62, .58, .92, .22, .88, .84, .9),
    receiving: r(.92, .82, .86, .28, .72, .9),
    attributeFloors: { ballControl: 16, shortPassing: 16, longPassing: 17, concentration: 18, anticipation: 20, composure: 19, decisions: 19, reflexes: 19, shotStopping: 19, oneOnOnes: 20, communication: 19, throwing: 19, kicking: 19, handling: 18, sweeping: 20, distributionGK: 20 },
  },
  setPieceKeeper: {
    dribbling: d(.1, .58, .26, .5, .5, .16, .54, .62),
    shooting: s(.38, .96, .76, .96, .5, .1, .24),
    passing: p(.58, .48, .86, .32, .72, .82, .86),
    receiving: r(.84, .62, .76, .12, .68, .72),
    attributeFloors: { longPassing: 16, longShots: 18, freeKickAccuracy: 20, penaltyTaking: 19, technique: 18, concentration: 18, composure: 18, leadership: 19, reflexes: 18, shotStopping: 18, oneOnOnes: 17, communication: 19, kicking: 19, handling: 18, sweeping: 17, distributionGK: 18 },
  },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mergeBehavior<T extends object>(base: T, override?: Partial<T>): T {
  const merged = { ...base, ...(override ?? {}) } as T;
  for (const key of Object.keys(merged) as (keyof T)[]) {
    const value = merged[key];
    if (typeof value === "number") merged[key] = clamp01(value) as T[keyof T];
  }
  return merged;
}

export function iconicPrimeProfileId(alias: string): string {
  return alias.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function resolveSeed(seed: ProfileSeed): IconicPrimeProfile {
  const base = ARCHETYPES[seed.archetype];
  return {
    id: iconicPrimeProfileId(seed.alias),
    alias: seed.alias,
    peak: seed.peak,
    primeAge: seed.primeAge,
    height: seed.height,
    weight: seed.weight,
    preferredFoot: seed.preferredFoot,
    archetype: seed.archetype,
    tier: seed.tier,
    summary: seed.summary,
    signatures: seed.signatures,
    secondaryPositions: seed.secondaryPositions ?? [],
    dribbling: mergeBehavior(base.dribbling, seed.dribbling),
    shooting: mergeBehavior(base.shooting, seed.shooting),
    passing: mergeBehavior(base.passing, seed.passing),
    receiving: mergeBehavior(base.receiving, seed.receiving),
    attributeFloors: { ...base.attributeFloors, ...(seed.attributeFloors ?? {}) },
  };
}

// The explicit seed ledger follows below. Every alias has its own peak window,
// body/foot profile, scouting summary, signature actions and tendency overrides.
type PrimeAxes = readonly [
  dribbleFrequency: number,
  closeControl: number,
  burst: number,
  shotFrequency: number,
  shotRange: number,
  firstTimeShot: number,
  throughBall: number,
  crossing: number,
  combinationPlay: number,
  passingDirectness: number,
  receiveOnHalfTurn: number,
  comeShort: number,
  runBeyond: number,
  oneTouchPlay: number,
];

type PrimeSeedExtras = {
  readonly secondaryPositions?: readonly PrimaryPosition[];
  readonly dribbling?: Partial<PrimeDribblingBehavior>;
  readonly shooting?: Partial<PrimeShootingBehavior>;
  readonly passing?: Partial<PrimePassingBehavior>;
  readonly receiving?: Partial<PrimeReceivingBehavior>;
  readonly attributeFloors?: Readonly<Partial<Record<PrimeAttributeKey, number>>>;
};

/**
 * Compact constructor for the explicit research ledger below. Every row still
 * carries fourteen individual mechanical values spanning all four behaviour
 * domains; the archetype supplies shared mechanics, never the player's final
 * behaviour.
 */
function prime(
  alias: string,
  peak: string,
  primeAge: number,
  height: number,
  weight: number,
  foot: "R" | "L",
  archetype: PrimeArchetype,
  tier: 1 | 2 | 3,
  summary: string,
  signatureLedger: string,
  axes: PrimeAxes,
  extras: PrimeSeedExtras = {},
): ProfileSeed {
  return {
    alias,
    peak,
    primeAge,
    height,
    weight,
    preferredFoot: foot === "R" ? "Right" : "Left",
    archetype,
    tier,
    summary,
    signatures: signatureLedger.split("|"),
    secondaryPositions: extras.secondaryPositions,
    dribbling: {
      frequency: axes[0],
      closeControl: axes[1],
      burst: axes[2],
      ...extras.dribbling,
    },
    shooting: {
      frequency: axes[3],
      range: axes[4],
      firstTime: axes[5],
      ...extras.shooting,
    },
    passing: {
      through: axes[6],
      crossing: axes[7],
      combination: axes[8],
      directness: axes[9],
      ...extras.passing,
    },
    receiving: {
      halfTurn: axes[10],
      comeShort: axes[11],
      runBeyond: axes[12],
      oneTouch: axes[13],
      ...extras.receiving,
    },
    attributeFloors: extras.attributeFloors,
  };
}

const PROFILE_SEEDS: readonly ProfileSeed[] = [
  // Bretherland — movement and technique are calibrated to each peak season.
  prime("Erling Haland", "2022-23", 22, 195, 94, "L", "channelFinisher", 1, "Lives on the blind-side shoulder, then turns early service into long-stride separation and an immediate finish.", "blind-side sprint|long knock-on|first-time power finish", [.48,.72,1,.99,.54,.98,.36,.22,.4,.82,.62,.18,1,.91], { shooting: { power: .97 } }),
  prime("Kevan De Bruin", "2019-20", 28, 181, 70, "R", "creativeTen", 1, "Drives through the right half-space and releases crosses, cutbacks or runners before the block can reset.", "right-half-space drive|early whipped cross|laser through ball", [.64,.86,.82,.76,.89,.68,1,.99,.91,.9,.95,.72,.72,.86], { secondaryPositions: [PrimaryPosition.CM, PrimaryPosition.RW], passing: { switch: .98, execution: .99 } }),
  prime("Sergio Aguera", "2014-15", 26, 173, 70, "R", "completeStriker", 1, "Checks into feet, rolls markers with a low centre of gravity and attacks the near-post lane with compact finishes.", "marker roll|short burst|near-post finish", [.78,.96,.91,.98,.55,.9,.67,.34,.82,.76,.94,.7,.9,.82], { dribbling: { feint: .83 }, shooting: { placement: .97 } }),
  prime("Mohamed Sala", "2017-18", 25, 175, 71, "L", "invertedScorer", 1, "Darts inside from the right, carries at transition speed and bends or lifts finishes across the goalkeeper.", "right-to-inside sprint|left-foot curler|dinked one-on-one", [.87,.9,.98,.98,.75,.88,.68,.62,.76,.86,.9,.42,.99,.8], { secondaryPositions: [PrimaryPosition.ST, PrimaryPosition.LW], dribbling: { inside: 1 }, shooting: { chip: .86 } }),
  prime("Steven Gerrad", "2008-09", 28, 183, 83, "R", "boxToBoxShooter", 1, "Breaks lines with forceful carries and early diagonals, then arrives beyond the striker to strike on the run.", "surging central carry|driven diagonal|rising long shot", [.67,.82,.85,.89,.98,.79,.88,.76,.76,.91,.8,.64,.87,.71], { secondaryPositions: [PrimaryPosition.CAM, PrimaryPosition.CDM], shooting: { power: 1 }, passing: { switch: .97 } }),
  prime("Virgil Van Dyke", "2018-19", 27, 195, 92, "R", "libero", 1, "Delays and reads rather than diving in, dominates aerial contact and opens attacks with calm diagonal distribution.", "jockey and delay|aerial command|diagonal release", [.22,.71,.46,.18,.42,.72,.62,.26,.74,.74,.69,.79,.27,.83], { dribbling: { shielding: .96 }, shooting: { aerial: .9 }, passing: { switch: .97, execution: .95 }, receiving: { security: .98 } }),
  prime("Thierry Henri", "2003-04", 26, 188, 83, "R", "completeStriker", 1, "Drifts left to receive on the half-turn, glides into open grass and opens his body to place across goal.", "left-channel drift|gliding burst|far-corner placement", [.86,.91,.97,.96,.71,.82,.78,.53,.83,.82,.97,.61,.96,.77], { secondaryPositions: [PrimaryPosition.LW, PrimaryPosition.CAM], shooting: { placement: 1, chip: .84, aerial: .4 } }),
  prime("Dennis Bergkam", "1997-98", 28, 183, 78, "R", "creativeTen", 1, "Uses a cushioning or directional first touch to eliminate pressure before a disguised pass or delicate finish.", "directional first touch|one-touch layoff|disguised chip", [.55,.98,.59,.72,.68,.82,.97,.61,.99,.62,.99,.95,.69,.99], { secondaryPositions: [PrimaryPosition.ST], shooting: { placement: .97, chip: .96 }, receiving: { security: 1 } }),
  prime("Bukayo Sakha", "2023-24", 22, 178, 72, "L", "invertedScorer", 2, "Pins the right touchline, protects possession through contact and alternates cutbacks with controlled far-post finishes.", "touchline isolation|contact-balanced cut|far-post curler", [.82,.89,.84,.8,.68,.75,.69,.86,.84,.72,.89,.58,.86,.81], { secondaryPositions: [PrimaryPosition.LW], dribbling: { shielding: .8, inside: .93 }, shooting: { placement: .91 } }),
  prime("Frank Lampart", "2009-10", 31, 184, 88, "R", "boxToBoxShooter", 1, "Circulates simply, then appears late at the spot or box edge for first-time, rebound and long-range finishes.", "late box arrival|edge-of-box strike|first-time side-foot", [.4,.69,.57,.94,.91,.97,.71,.54,.87,.72,.72,.53,.94,.91], { secondaryPositions: [PrimaryPosition.CAM], shooting: { placement: .87 } }),
  prime("Didier Drogbah", "2009-10", 31, 189, 91, "R", "targetForward", 1, "Pins centre-backs, cushions direct balls, powers through contact and attacks crosses with violent contact.", "back-to-goal pin|power carry|near-post header", [.51,.78,.7,.98,.75,.95,.58,.63,.8,.79,.64,.94,.8,.86], { dribbling: { shielding: 1 }, shooting: { power: 1, aerial: .99 }, receiving: { shielding: 1 } }),
  prime("Eden Hazart", "2018-19", 27, 175, 74, "R", "wingDribbler", 1, "Invites pressure on the left, rolls through tackles with tiny touches and accelerates inside to create or place.", "stop-start lure|hip-roll escape|inside slalom", [1,1,.9,.75,.64,.67,.86,.74,.94,.57,.98,.87,.63,.9], { secondaryPositions: [PrimaryPosition.CAM, PrimaryPosition.RW], dribbling: { feint: .97, escape: 1, shielding: .84 }, shooting: { placement: .91 } }),
  prime("Wayne Roonie", "2009-10", 24, 176, 83, "R", "completeStriker", 1, "Drops aggressively to connect midfield, turns with force and sprints back into the box for varied finishes.", "deep striker drop|power turn|late box return", [.74,.87,.88,.91,.84,.9,.82,.68,.91,.82,.86,.91,.84,.88], { secondaryPositions: [PrimaryPosition.CAM, PrimaryPosition.LW], dribbling: { shielding: .9 }, passing: { switch: .85 } }),
  prime("David Beckam", "1998-99", 23, 183, 75, "R", "wideCreator", 1, "Creates separation without dribbling volume and whips bending service or long diagonals before pressure arrives.", "early whipped cross|deep diagonal|dead-ball bend", [.29,.74,.51,.55,.78,.72,.75,1,.88,.9,.72,.77,.63,.92], { secondaryPositions: [PrimaryPosition.CM], passing: { switch: 1, execution: 1 }, attributeFloors: { crossing: 20, longPassing: 19, freeKickAccuracy: 20 } }),
  prime("Georgie Beste", "1967-68", 21, 175, 65, "R", "wingDribbler", 1, "Attacks either side with balance, rapid feints and fearless carries, often continuing all the way to goal.", "two-way feint|touchline slalom|solo finish", [1,.99,.96,.84,.68,.78,.67,.82,.73,.73,.95,.68,.88,.71], { secondaryPositions: [PrimaryPosition.RW, PrimaryPosition.CAM], dribbling: { inside: .9, outside: .92, feint: 1 }, shooting: { placement: .91 } }),
  prime("Harry Kayne", "2020-21", 27, 188, 86, "R", "completeStriker", 1, "Alternates centre-forward pinning with deep playmaking, turns to release runners and then arrives for precise finishes.", "deep nine reception|early runner release|across-goal finish", [.43,.83,.5,.99,.82,.93,.97,.58,.89,.84,.84,.97,.78,.89], { secondaryPositions: [PrimaryPosition.CAM], dribbling: { shielding: .92 }, shooting: { placement: .98, aerial: .85 }, passing: { execution: .95 }, receiving: { shielding: .95 } }),
  prime("Gareth Baille", "2012-13", 23, 186, 81, "L", "powerWinger", 1, "Knocks beyond the full-back, overwhelms recovery runs and cuts into explosive long-range shooting lanes.", "long knock-and-run|outside sprint|left-foot thunderbolt", [.91,.79,1,.92,.97,.79,.62,.87,.68,.93,.78,.47,.96,.66], { secondaryPositions: [PrimaryPosition.LW, PrimaryPosition.ST], dribbling: { outside: .97 }, shooting: { power: 1 } }),
  prime("Alan Sheerer", "1994-95", 24, 183, 79, "R", "targetForward", 1, "Creates contact before arrival, spins into the box and attacks every delivery with headers, volleys and power.", "centre-back pin|near-post dart|power header", [.3,.69,.58,1,.7,.99,.46,.49,.64,.75,.58,.74,.93,.95], { shooting: { power: .99, aerial: .99 }, receiving: { shielding: .98 } }),
  prime("Peter Beardslay", "1987-88", 26, 173, 68, "R", "creativeTen", 2, "A mobile second striker who drops between lines, deceives with quick feet and prioritises combinations and creation.", "deceptive drop|quick-feet turn|unselfish final ball", [.79,.94,.76,.7,.77,.67,.95,.63,.99,.69,.97,.97,.69,.94], { secondaryPositions: [PrimaryPosition.ST], dribbling: { feint: .91 } }),
  prime("Paul McGratt", "1992-93", 33, 183, 84, "R", "defensiveReader", 2, "Tracks danger with exceptional timing, wins duels cleanly and gives the first secure pass.", "recovery read|clean interception|simple release", [.11,.61,.57,.08,.18,.52,.23,.21,.83,.5,.64,.8,.17,.88], { receiving: { security: .92 }, attributeFloors: { pace: 16, strength: 18, tackling: 20, interceptions: 19 } }),
  prime("Jakk Greelish", "2020-21", 25, 180, 81, "R", "wingDribbler", 2, "Comes toward the ball from the left, pauses to draw contact, shields and carries inside before slipping a teammate.", "left-side come-short|pause and draw foul|inside slip pass", [.92,.97,.65,.47,.62,.55,.89,.79,.95,.53,.92,.98,.48,.88], { secondaryPositions: [PrimaryPosition.CAM], dribbling: { shielding: .95 }, receiving: { shielding: .97 } }),
  prime("Dixie Deane", "1927-28", 21, 178, 73, "R", "targetForward", 2, "Occupies the six-yard area, reads rebounds early and attacks crosses with extraordinary timing and leap.", "six-yard occupation|rebound anticipation|hanging header", [.17,.56,.54,1,.35,.99,.23,.18,.45,.54,.43,.54,.94,.97], { shooting: { placement: .95, aerial: 1 }, attributeFloors: { jumping: 19, heading: 20, anticipation: 20 } }),
  prime("Bobby Moor", "1965-66", 24, 183, 80, "R", "libero", 1, "Intercepts through positioning and patience, remains composed under pressure and begins attacks with measured passes.", "standing interception|calm escape|measured line-breaker", [.31,.83,.49,.11,.31,.61,.77,.32,.86,.67,.91,.84,.24,.9], { secondaryPositions: [PrimaryPosition.CDM], dribbling: { escape: .93 }, passing: { switch: .91, execution: .99 }, receiving: { security: .99 } }),
  prime("Jamie Vardie", "2015-16", 29, 179, 74, "R", "channelFinisher", 2, "Bends relentless runs into either channel and finishes early after outrunning a high defensive line.", "curved channel run|counterattack knock-on|early low finish", [.41,.68,1,.97,.58,.9,.38,.31,.54,.91,.67,.12,1,.87], { shooting: { placement: .89 }, attributeFloors: { pace: 19, acceleration: 19, workRate: 18 } }),

  // Valdoria.
  prime("Alfredo Di Stefana", "1957-58", 31, 178, 80, "R", "completeStriker", 1, "Roams through every attacking line, receives deep, drives forward and reappears in the box to finish.", "all-line roaming|deep carry|second-wave finish", [.77,.88,.81,.95,.72,.87,.89,.65,.92,.78,.91,.95,.93,.86], { secondaryPositions: [PrimaryPosition.CAM, PrimaryPosition.CM] }),
  prime("Zinedin Zidan", "2001-02", 29, 185, 80, "R", "creativeTen", 1, "Receives under contact with an open scan, shields and pirouettes away, then controls the decisive moment.", "roulette escape|sole control|big-game volley", [.72,1,.61,.69,.81,.91,.97,.67,.95,.61,1,.9,.58,.89], { secondaryPositions: [PrimaryPosition.CM], dribbling: { escape: 1, shielding: .97 }, passing: { execution: .99 }, receiving: { security: 1, shielding: .99 } }),
  prime("Raul Gonzales", "2000-01", 23, 180, 68, "L", "poacher", 1, "Glides away from markers, links neatly around the box and uses anticipation and delicate placement rather than force.", "ghosted box run|one-touch combination|soft chip finish", [.45,.79,.7,.96,.57,.94,.61,.34,.87,.66,.75,.53,.99,.94], { secondaryPositions: [PrimaryPosition.CAM], shooting: { placement: .99, chip: .92, power: .61 } }),
  prime("Lionel Messio", "2014-15", 27, 170, 72, "L", "closeControlCreator", 1, "Waits between lines, lures pressure with tiny left-foot touches and then slaloms, threads or places.", "low-touch slalom|pause then burst|left-foot reverse pass|far-corner curl", [1,1,.97,.97,.91,.83,1,.71,1,.71,1,.91,.83,.97], { secondaryPositions: [PrimaryPosition.CAM, PrimaryPosition.ST], dribbling: { inside: 1, feint: .99, escape: 1 }, shooting: { placement: 1, chip: .97 }, passing: { execution: 1 }, receiving: { security: 1 } }),
  prime("Xavi Hernandes", "2010-11", 31, 170, 68, "R", "tempoController", 1, "Scans before receiving, opens with directional control and changes the angle and speed until a vertical lane appears.", "pre-reception scan|directional sole touch|third-man pass", [.37,.97,.48,.2,.51,.69,.95,.57,1,.45,1,1,.3,1], { secondaryPositions: [PrimaryPosition.CDM, PrimaryPosition.CAM], dribbling: { escape: .99 }, passing: { switch: .91, execution: 1 }, receiving: { security: 1 } }),
  prime("Andres Inyesta", "2011-12", 27, 171, 68, "R", "closeControlCreator", 1, "Receives to feet in crowded interiors, escapes laterally and carries vertically before an incisive combination.", "to-feet reception|lateral escape|vertical midfield carry", [.87,1,.72,.34,.55,.7,.95,.65,1,.53,1,.99,.51,.99], { secondaryPositions: [PrimaryPosition.CAM, PrimaryPosition.LW], dribbling: { feint: .95, escape: 1 }, shooting: { placement: .89 }, receiving: { security: 1 } }),
  prime("Antoin Griezman", "2015-16", 24, 176, 73, "L", "completeStriker", 2, "Floats into right-sided pockets, combines quickly and times sharp return runs for left-foot or first-time finishes.", "pocket drift|wall pass|delayed box dart", [.57,.86,.75,.9,.67,.93,.81,.62,.97,.72,.91,.9,.91,.95], { secondaryPositions: [PrimaryPosition.CAM, PrimaryPosition.RW], shooting: { placement: .95, aerial: .75 } }),
  prime("Diago Godin", "2013-14", 28, 187, 78, "R", "defensiveReader", 2, "Protects the box through compact positioning and attacks aerial danger or set-piece service before everyone else.", "box-line command|front-foot header|set-piece near-post run", [.09,.6,.45,.19,.31,.83,.21,.2,.64,.67,.51,.7,.31,.74], { shooting: { aerial: .97 }, attributeFloors: { heading: 18, aerialDuels: 20, bravery: 20, leadership: 19 } }),
  prime("Fernando Torrez", "2007-08", 23, 186, 78, "R", "channelFinisher", 1, "Starts between centre-back and full-back, bursts onto vertical service and finishes before recovery contact.", "inside-left channel run|stride touch|early across-goal finish", [.59,.84,.99,.97,.61,.91,.43,.29,.56,.91,.76,.19,1,.79], { shooting: { placement: .94 } }),
  prime("Iker Munian", "2011-12", 19, 170, 65, "R", "wingDribbler", 3, "Comes inside from the left, manipulates tight spaces with rapid touches and combines adventurously around a focal striker.", "left-to-centre drift|rapid toe touches|give-and-go", [.93,.99,.82,.41,.54,.61,.87,.73,.97,.63,.97,.91,.69,.92], { secondaryPositions: [PrimaryPosition.LW, PrimaryPosition.RW] }),
  prime("Andoni Zubizareta", "1986-87", 25, 187, 86, "R", "traditionalKeeper", 2, "Prioritises calm positioning, angle control and clean handling while keeping distribution conservative.", "quiet set position|angle close|secure claim", [.01,.43,.34,0,0,.1,.08,.09,.39,.55,.31,.73,.1,.55], { passing: { risk: .18, execution: .68 }, receiving: { security: .83 }, attributeFloors: { positioning: 19, handling: 19, oneOnOnes: 18, sweeping: 16, distributionGK: 13 } }),
  prime("Xabi Alonzo", "2011-12", 30, 183, 80, "R", "tempoController", 1, "Receives deep facing play, resists the first presser and dictates territory with clipped switches and vertical passes.", "deep open-body reception|clipped diagonal|vertical tempo change", [.29,.82,.49,.43,.83,.66,.87,.52,.9,.86,.97,.99,.25,.92], { secondaryPositions: [PrimaryPosition.CM], dribbling: { shielding: .78 }, passing: { switch: 1, execution: .99 }, receiving: { security: .99 } }),
  prime("David Villan", "2008-09", 27, 175, 69, "R", "completeStriker", 1, "Peels left, darts across the line and finishes quickly from varied angles with either foot.", "left-channel peel|two-foot snap shot|front-post dart", [.66,.86,.84,.99,.73,.95,.59,.43,.85,.78,.79,.55,.97,.9], { secondaryPositions: [PrimaryPosition.LW], shooting: { placement: .97, chip: .78 } }),
  prime("Gaizko Mendietta", "1999-00", 26, 173, 69, "R", "boxToBoxShooter", 2, "Covers both boxes, drifts past pressure with quick feet and supplies accurately before threatening from range.", "all-action carry|right-side delivery|edge-box rocket", [.71,.85,.8,.87,.95,.75,.83,.89,.79,.82,.84,.67,.8,.76], { secondaryPositions: [PrimaryPosition.CAM, PrimaryPosition.RW], shooting: { power: .95 }, attributeFloors: { penaltyTaking: 19, workRate: 19 } }),

  // Azzuriland.
  prime("Paolo Maldino", "1993-94", 26, 186, 85, "L", "defensiveReader", 1, "Controls the duel through angles and anticipation, carries only into secure space and advances elegantly.", "angle denial|recovery glide|clean standing tackle", [.29,.79,.75,.09,.28,.61,.43,.57,.87,.59,.83,.73,.47,.84], { secondaryPositions: [PrimaryPosition.CB], dribbling: { escape: .87 }, passing: { execution: .93 }, receiving: { security: .97 }, attributeFloors: { pace: 17, marking: 20, tackling: 20, positioning: 20 } }),
  prime("Franco Bareso", "1988-89", 28, 176, 70, "R", "libero", 1, "Steps out before danger forms, manipulates the offside line and progresses from behind play with total composure.", "offside-line step|libero carry|vertical build pass", [.53,.9,.67,.15,.47,.59,.85,.35,.89,.75,.97,.79,.54,.88], { secondaryPositions: [PrimaryPosition.CDM], dribbling: { escape: .95 }, passing: { switch: .93, execution: .99 }, receiving: { security: 1 }, attributeFloors: { anticipation: 20, decisions: 20, leadership: 20, interceptions: 20 } }),
  prime("Andriy Shevchenka", "2003-04", 27, 183, 72, "R", "channelFinisher", 1, "Accelerates diagonally across defenders, controls at speed and converts early with drive or placement.", "diagonal separation|running control|early power finish", [.63,.82,.95,.99,.69,.93,.54,.4,.65,.84,.8,.34,.99,.78], { shooting: { placement: .93, power: .93 } }),
  prime("Javi Zaneti", "2009-10", 36, 178, 75, "R", "attackingFullback", 1, "Carries relentlessly up either flank, protects through contact and chooses dependable combinations over speculation.", "relentless overlap|contact carry|safe inside combination", [.75,.86,.84,.19,.47,.57,.56,.73,.95,.63,.82,.8,.88,.9], { secondaryPositions: [PrimaryPosition.LB, PrimaryPosition.CDM, PrimaryPosition.CM], dribbling: { shielding: .91 }, receiving: { security: .95, shielding: .91 }, attributeFloors: { naturalFitness: 20, workRate: 20, teamwork: 19 } }),
  prime("Ronaldo Nazaria", "1996-97", 20, 183, 90, "R", "completeStriker", 1, "Receives facing goal, explodes through central gaps with stepovers and rounds or wrong-foots the goalkeeper.", "central explosive slalom|stepover burst|goalkeeper round", [1,.97,1,1,.72,.87,.58,.31,.73,.9,.99,.48,.99,.71], { dribbling: { feint: 1, shielding: .91 }, shooting: { placement: .99, chip: .9 }, receiving: { security: .97 }, attributeFloors: { dribbling: 20, pace: 20, acceleration: 20, finishing: 20 } }),
  prime("Diego Milita", "2009-10", 30, 183, 78, "R", "poacher", 2, "Uses subtle double movements and calm back-to-goal touches before separating for ruthless low finishes.", "double movement|box blind-side|calm low finish", [.31,.78,.61,.99,.56,.95,.49,.28,.69,.69,.69,.58,.98,.91], { dribbling: { shielding: .78 }, shooting: { placement: .98 } }),
  prime("Alex Del Piera", "1997-98", 23, 174, 73, "R", "creativeTen", 1, "Drifts left of the striker, combines delicate touches and curls trademark finishes from the inside channel.", "left half-space drift|quick wall pass|inside-channel curl", [.79,.95,.78,.9,.87,.81,.91,.65,.97,.68,.99,.9,.8,.9], { secondaryPositions: [PrimaryPosition.CAM], dribbling: { inside: .91, feint: .87 }, shooting: { placement: .99, chip: .88 } }),
  prime("Gianluigi Bufon", "2002-03", 25, 192, 92, "R", "traditionalKeeper", 1, "Holds an authoritative set position, waits in one-on-ones and claims danger before distributing safely.", "big set position|patient one-on-one|secure high claim", [.01,.5,.4,0,0,.1,.08,.1,.48,.59,.34,.77,.16,.62], { passing: { risk: .28, execution: .77 }, receiving: { security: .89 }, attributeFloors: { reflexes: 20, shotStopping: 20, oneOnOnes: 20, handling: 20, communication: 20 } }),
  prime("Pavel Nedvedo", "2002-03", 30, 177, 70, "R", "boxToBoxShooter", 1, "Runs beyond from the left or centre, strikes fiercely off either foot and plays forward with relentless tempo.", "two-foot drive|late central run|outside-box power shot", [.67,.84,.84,.91,.97,.81,.73,.79,.77,.87,.81,.61,.92,.72], { secondaryPositions: [PrimaryPosition.CM, PrimaryPosition.LW], shooting: { power: .99 }, attributeFloors: { naturalFitness: 20, workRate: 20, determination: 20 } }),
  prime("Diago Maradona", "1986-87", 26, 165, 67, "L", "closeControlCreator", 1, "Demands between lines, absorbs contact and accelerates through clusters before the killer pass or finish.", "contact-resistant slalom|explosive body feint|left-foot killer ball", [1,1,.99,.91,.91,.76,1,.73,.97,.75,1,.95,.85,.92], { dribbling: { feint: 1, escape: 1, shielding: .97 }, shooting: { placement: .97 }, passing: { risk: 1, execution: .99 }, receiving: { security: 1, shielding: .97 } }),
  prime("Marek Hamsiq", "2016-17", 29, 183, 79, "R", "boxToBoxShooter", 2, "Finds space as an advanced eight, carries centrally and times late arrivals for forceful shots or vertical passes.", "advanced-eight drift|central line break|late edge-box arrival", [.69,.83,.75,.83,.91,.82,.87,.61,.85,.79,.87,.7,.88,.78], { secondaryPositions: [PrimaryPosition.CM], shooting: { power: .89 } }),
  prime("Viktor Osimen", "2022-23", 24, 186, 77, "R", "channelFinisher", 2, "Constantly threatens depth, attacks loose space violently and converts crosses through leap and first contact.", "depth sprint|loose-ball chase|leaping header", [.47,.7,1,.98,.52,.99,.31,.22,.39,.88,.64,.15,1,.84], { dribbling: { shielding: .79 }, shooting: { aerial: .99, power: .91 }, attributeFloors: { jumping: 19, bravery: 20 } }),
  prime("Francesco Toti", "2006-07", 30, 180, 82, "R", "creativeTen", 1, "Operates as a false nine, lays off in one touch and alternates impossible through balls with chips and drives.", "false-nine drop|first-time flick|cucchiaio chip", [.59,.91,.55,.85,.89,.78,1,.68,.96,.86,.9,1,.67,1], { secondaryPositions: [PrimaryPosition.ST], dribbling: { shielding: .86 }, shooting: { chip: 1, power: .87 }, passing: { risk: .99 }, receiving: { shielding: .91 } }),
  prime("Daniele De Rosi", "2008-09", 25, 184, 83, "R", "boxToBoxShooter", 2, "Screens central space and punches vertical passes or long shots through midfield before recovering position.", "screen-and-step|vertical punch pass|long-range drive", [.33,.73,.61,.65,.95,.71,.79,.55,.76,.9,.81,.84,.45,.8], { secondaryPositions: [PrimaryPosition.CM, PrimaryPosition.CB], dribbling: { shielding: .85 }, shooting: { power: .97 }, passing: { switch: .91 }, receiving: { security: .91 }, attributeFloors: { tackling: 18, interceptions: 18, aggression: 18 } }),
  prime("Alessio Nesta", "2002-03", 26, 187, 79, "R", "defensiveReader", 1, "Waits, mirrors and times the intervention at the final instant, then exits with a composed touch and pass.", "last-instant tackle|duel mirror|calm first pass", [.17,.72,.59,.07,.21,.57,.36,.25,.83,.51,.8,.78,.19,.83], { dribbling: { escape: .83 }, passing: { execution: .91 }, receiving: { security: .97 }, attributeFloors: { tackling: 20, marking: 20, anticipation: 20, agility: 17 } }),

  // Gallonde.
  prime("Kylian Mbape", "2021-22", 23, 178, 75, "R", "channelFinisher", 1, "Stands up the full-back, pushes into huge stride length and attacks the left channel before lifting or placing.", "left-channel launch|long-stride knock-on|lifted sprint finish", [.85,.88,1,.97,.72,.82,.67,.64,.71,.9,.89,.38,1,.73], { secondaryPositions: [PrimaryPosition.LW, PrimaryPosition.RW], dribbling: { outside: .91, feint: .83 }, shooting: { placement: .95, chip: .91 } }),
  prime("Zlatan Ibrahimovik", "2012-13", 31, 195, 95, "R", "targetForward", 1, "Uses size and acrobatic technique to pin, cushion and improvise before volleys, back-heels and audacious finishes.", "chest-and-pin|backheel layoff|acrobatic volley", [.59,.84,.68,.93,.91,1,.73,.42,.91,.72,.78,.95,.72,.97], { secondaryPositions: [PrimaryPosition.CAM], dribbling: { shielding: 1, feint: .74 }, shooting: { power: .97, aerial: .91, chip: .82 }, passing: { risk: .75 }, receiving: { shielding: 1 } }),
  prime("Jean-Pierre Papen", "1990-91", 27, 176, 70, "R", "poacher", 1, "Hunts space for immediate contact and turns awkward service into spectacular volleys, headers or drives.", "Papinade volley|difficult-angle first-time|compact box movement", [.23,.68,.66,1,.79,1,.3,.2,.47,.73,.61,.31,.94,1], { shooting: { power: .97, aerial: .87 }, attributeFloors: { volleying: 20 } }),
  prime("Dimitri Payette", "2015-16", 28, 175, 77, "R", "creativeTen", 2, "Receives with his back to pressure, spins left and creates through bending delivery and disguised final passes.", "back-to-goal swivel|bending dead ball|disguised reverse pass", [.73,.95,.65,.7,.91,.72,.97,.95,.91,.7,.99,.91,.63,.89], { secondaryPositions: [PrimaryPosition.LW], dribbling: { escape: .97, shielding: .85 }, shooting: { placement: .91 }, passing: { risk: .93 }, receiving: { shielding: .93 }, attributeFloors: { freeKickAccuracy: 19 } }),
  prime("Radamel Falkau", "2011-12", 25, 177, 72, "R", "poacher", 1, "Coordinates every movement with delivery and uses elite leap and timing to dominate with one-touch finishing.", "coordinated near-post run|one-touch finish|timed leap header", [.19,.7,.7,1,.47,1,.35,.21,.45,.71,.58,.27,.99,1], { shooting: { placement: .97, aerial: 1, power: .91 }, attributeFloors: { jumping: 20, heading: 19 } }),
  prime("Kareem Benzema", "2021-22", 34, 185, 81, "R", "completeStriker", 1, "Leaves the line to knit play, receives softly around pressure and re-enters the box with perfect timing.", "left-side connective drop|velvet first touch|delayed box re-entry", [.67,.93,.7,.95,.71,.95,.91,.55,.99,.66,.95,.97,.88,.95], { secondaryPositions: [PrimaryPosition.CAM], dribbling: { escape: .87 }, shooting: { placement: .99, aerial: .85 }, passing: { risk: .77 }, receiving: { security: .99 } }),
  prime("Michel Platiny", "1983-84", 28, 179, 74, "R", "creativeTen", 1, "Conducts from advanced midfield, releases runners immaculately and ghosts into scoring zones for precise finishes.", "advanced conductor|weighted through pass|late scoring glide", [.49,.91,.65,.83,.85,.84,1,.72,.93,.64,.99,.87,.82,.92], { secondaryPositions: [PrimaryPosition.CM], shooting: { placement: .97 }, passing: { switch: .91, execution: 1 }, attributeFloors: { freeKickAccuracy: 20 } }),

  // Schwarzland.
  prime("Franz Bekenbauer", "1973-74", 28, 181, 75, "R", "libero", 1, "Begins as the spare defender, glides beyond the first line and becomes the first attacker through carry or pass.", "libero advance|outside-foot carry|long diagonal launch", [.71,.91,.72,.43,.83,.67,.91,.39,.84,.92,.99,.81,.58,.85], { secondaryPositions: [PrimaryPosition.CDM, PrimaryPosition.CM], dribbling: { escape: .95 }, shooting: { power: .85 }, passing: { switch: 1, execution: .99 }, receiving: { security: 1 } }),
  prime("Tomas Muler", "2012-13", 23, 185, 76, "R", "poacher", 1, "Interprets empty space, makes awkward one-touch combinations and arrives unseen for simple finishes.", "space interpreter|blind-side box arrival|scruffy one-touch finish", [.23,.57,.66,.91,.49,.99,.67,.6,.93,.77,.63,.57,1,.99], { secondaryPositions: [PrimaryPosition.ST, PrimaryPosition.RW], shooting: { placement: .85 } }),
  prime("Robert Lewandovski", "2019-20", 31, 185, 81, "R", "completeStriker", 1, "Pins and spins with immaculate control, adjusts in tiny spaces and converts every service type in one or two touches.", "pin-and-spin|micro-touch box setup|two-foot first-time finish", [.53,.91,.72,1,.63,1,.61,.37,.89,.74,.77,.78,.92,.99], { dribbling: { shielding: .93 }, shooting: { placement: .99, aerial: .93, power: .91 }, receiving: { security: .99, shielding: .97 } }),
  prime("Marco Reuss", "2013-14", 24, 180, 71, "R", "invertedScorer", 2, "Accelerates from either half-space, combines at speed and chooses a through pass or accurate finish without slowing.", "half-space burst|running combination|quick placed finish", [.77,.88,.95,.84,.72,.87,.91,.66,.95,.82,.93,.68,.94,.86], { secondaryPositions: [PrimaryPosition.LW, PrimaryPosition.ST], shooting: { placement: .95 } }),
  prime("Mats Humels", "2012-13", 24, 191, 94, "R", "libero", 2, "Steps into midfield when free and breaks lines precisely while using anticipation and aerial reach to defend.", "step-in carry|vertical split pass|aerial read", [.45,.75,.43,.17,.38,.69,.93,.27,.75,.89,.91,.78,.31,.82], { shooting: { aerial: .83 }, passing: { switch: .95, execution: .97 }, receiving: { security: .95 }, attributeFloors: { heading: 18, aerialDuels: 19 } }),
  prime("Florian Wirt", "2023-24", 20, 177, 71, "R", "creativeTen", 2, "Finds tiny pockets, receives already oriented forward and chains agile carries, wall passes and final balls.", "pocket scan|half-turn burst|fast wall pass", [.79,.95,.84,.67,.65,.74,.95,.67,.99,.68,1,.91,.75,.97], { secondaryPositions: [PrimaryPosition.LW], shooting: { placement: .89 }, receiving: { security: .97 } }),
  prime("Michael Balak", "2001-02", 25, 188, 85, "R", "boxToBoxShooter", 1, "Commands central transitions, switches play and surges into the box for long shots, volleys and headers.", "central power surge|late aerial arrival|long-range hammer", [.58,.79,.74,.91,.97,.88,.72,.59,.76,.84,.73,.58,.9,.75], { secondaryPositions: [PrimaryPosition.CAM, PrimaryPosition.CDM], dribbling: { shielding: .91 }, shooting: { power: .99, aerial: .91 }, passing: { switch: .93 } }),
  prime("Manuel Noyer", "2013-14", 28, 193, 93, "R", "sweeperKeeper", 1, "Starts high to erase through balls, attacks one-on-ones and becomes an extra build-up defender.", "high starting sweep|standing one-on-one|counter-launch throw", [.35,.85,.69,.01,.18,.21,.67,.17,.82,.87,.91,.83,.13,.97], { dribbling: { escape: .87 }, passing: { risk: .73, switch: .97, execution: .97 }, receiving: { security: .99 }, attributeFloors: { pace: 16, acceleration: 17 } }),

  // Oranjeland.
  prime("Johan Cruijf", "1971-72", 24, 178, 74, "R", "closeControlCreator", 1, "Roams from the nominal nine, manipulates space with scans and turns, then triggers the next rotation.", "false-nine roam|Cruyff turn|total-football rotation", [.91,.96,.93,.85,.73,.81,.99,.76,1,.7,1,1,.86,.97], { secondaryPositions: [PrimaryPosition.ST, PrimaryPosition.LW, PrimaryPosition.CM], dribbling: { feint: .99, escape: 1 }, shooting: { placement: .95 } }),
  prime("Marko Van Basten", "1988-89", 24, 188, 80, "R", "completeStriker", 1, "Controls difficult service elegantly, links around the area and converts from impossible angles through elite technique.", "aerial cushion|impossible-angle volley|elegant spin finish", [.51,.91,.71,1,.69,1,.62,.31,.87,.7,.86,.71,.92,.97], { dribbling: { shielding: .83 }, shooting: { placement: .99, aerial: .95, power: .91 }, receiving: { security: .99 }, attributeFloors: { volleying: 20 } }),
  prime("Rudd Gulit", "1987-88", 25, 191, 88, "R", "completeStriker", 1, "Overpowers midfield and defence with long carries while retaining playmaker touch and elite aerial timing.", "powerful free-role carry|aerial box crash|one-touch combination", [.81,.85,.91,.87,.72,.91,.87,.68,.91,.84,.88,.74,.9,.9], { secondaryPositions: [PrimaryPosition.ST, PrimaryPosition.CM], dribbling: { shielding: .99 }, shooting: { power: .95, aerial: .99 }, receiving: { shielding: .99 }, attributeFloors: { strength: 19, jumping: 19 } }),
  prime("Arjen Roben", "2013-14", 30, 180, 80, "L", "invertedScorer", 1, "Receives wide right, threatens outside and accelerates diagonally onto his left into a curling-shot lane.", "right-wing isolation|repeat inside cut|left-foot far curl", [.91,.91,.99,.97,.87,.77,.61,.58,.79,.84,.95,.43,.9,.75], { secondaryPositions: [PrimaryPosition.LW], dribbling: { inside: 1, outside: .39, feint: .91 }, shooting: { placement: 1 } }),
  prime("Robbin Van Persi", "2011-12", 28, 183, 71, "L", "completeStriker", 1, "Drops into the right half-space and converts early service with an exceptionally clean left-foot volley, drive or curl.", "right half-space drop|left-foot first-time volley|near-post drive", [.57,.89,.74,.99,.87,1,.79,.52,.87,.74,.95,.76,.86,.97], { secondaryPositions: [PrimaryPosition.RW], shooting: { placement: .97, power: .91 } }),

  // Nordheim.
  prime("Roar Strann", "1999-00", 29, 179, 74, "R", "boxToBoxShooter", 3, "Provides relentless two-way running, arrives late and releases quickly to preserve team tempo.", "two-way shuttle|late penalty-area arrival|quick release", [.33,.71,.63,.61,.67,.81,.54,.58,.93,.65,.74,.67,.8,.95], { secondaryPositions: [PrimaryPosition.CDM, PrimaryPosition.RW], attributeFloors: { workRate: 20, naturalFitness: 20, teamwork: 19 } }),
  prime("Niklas Bendtna", "2008-09", 21, 193, 84, "R", "targetForward", 3, "Offers a tall target, links more deftly than his frame suggests and attacks aerial service while drifting wide.", "high target reception|soft layoff|back-post header", [.37,.73,.58,.75,.57,.83,.51,.54,.81,.7,.68,.89,.65,.87], { secondaryPositions: [PrimaryPosition.RW], shooting: { aerial: .95 }, receiving: { shielding: .95 } }),
  prime("Ole Gunnar Solskjar", "1998-99", 26, 178, 74, "R", "poacher", 2, "Studies the defensive picture, drifts into a blind spot and finishes quickly with minimal backlift.", "blind-spot drift|minimal-backlift finish|late substitute timing", [.21,.72,.72,.99,.54,1,.37,.25,.61,.68,.7,.38,.99,.99], { secondaryPositions: [PrimaryPosition.RW], shooting: { placement: .99 } }),

  // Campoverde.
  prime("Arthur Ziko", "1981", 28, 172, 72, "R", "creativeTen", 1, "Controls between lines with sharp combinations, disguised passing and prolific late movement while threatening dead balls.", "between-lines conductor|late scoring run|bending free kick", [.73,.95,.76,.87,.89,.8,.99,.72,.99,.68,.99,.87,.84,.95], { secondaryPositions: [PrimaryPosition.CM], shooting: { placement: .97 }, passing: { execution: 1 }, attributeFloors: { freeKickAccuracy: 20 } }),
  prime("Adriano Emperador", "2004-05", 22, 189, 88, "L", "targetForward", 1, "Combines sprinter pace and heavyweight shielding, driving inside-left before unleashing extreme left-foot power.", "inside-left power carry|contact burst|left-foot cannon", [.75,.82,.95,.99,.93,.8,.46,.42,.58,.87,.82,.58,.92,.73], { dribbling: { inside: .91, shielding: 1 }, shooting: { power: 1 }, receiving: { shielding: 1 }, attributeFloors: { pace: 18, acceleration: 18, strength: 20, longShots: 19 } }),
  prime("Peleu Nascimento", "1961-62", 21, 173, 70, "R", "completeStriker", 1, "Moves freely between creator and scorer, beats pressure explosively and finishes with either foot or exceptional leap.", "free attacking roam|two-foot burst|improvised aerial finish", [.91,.97,.99,.99,.78,.93,.91,.69,.95,.81,.99,.78,.96,.95], { secondaryPositions: [PrimaryPosition.CAM], dribbling: { feint: .95 }, shooting: { placement: .99, aerial: .99, chip: .91 }, attributeFloors: { jumping: 19 } }),
  prime("Ney Marinho", "2015-16", 23, 175, 68, "R", "wingDribbler", 1, "Receives left in isolation, chains elastic direction changes and combines creatively before curling, chipping or slipping.", "elastico change|left-wing slalom|no-look combination", [1,1,.91,.83,.71,.78,.95,.81,.99,.61,.99,.86,.76,.91], { secondaryPositions: [PrimaryPosition.CAM, PrimaryPosition.RW], dribbling: { feint: 1, escape: .99 }, shooting: { placement: .97, chip: .95 }, passing: { risk: .95 }, receiving: { security: .99 } }),
  prime("Rivaldino Ferreira", "1998-99", 26, 186, 75, "L", "invertedScorer", 1, "Drifts left to central shooting space, protects with a long frame and produces sudden strikes, volleys and passes.", "left-to-centre drift|minimal-backlift rocket|acrobatic volley", [.77,.89,.75,.95,.97,.95,.87,.72,.8,.76,.91,.78,.83,.83], { secondaryPositions: [PrimaryPosition.LW, PrimaryPosition.ST], dribbling: { shielding: .85, inside: .95 }, shooting: { power: .97 } }),
  prime("Socratis Brasileiro", "1982", 28, 192, 80, "R", "creativeTen", 1, "Plays upright with panoramic vision, using one-touch back-heels, disguises and late strides into shooting positions.", "upright scan|one-touch backheel|late long-stride arrival", [.47,.88,.52,.77,.87,.83,.97,.65,1,.69,.95,.9,.79,1], { secondaryPositions: [PrimaryPosition.CM], dribbling: { shielding: .85 }, shooting: { placement: .89 }, passing: { risk: .95 } }),
  prime("Ricardo Kakao", "2006-07", 24, 186, 78, "R", "creativeTen", 1, "Receives forward and turns midfield into open grass with huge central strides before a pass or running finish.", "central long-stride carry|transition burst|running side-foot finish", [.85,.87,1,.87,.73,.82,.97,.63,.85,.91,1,.7,.91,.79], { secondaryPositions: [PrimaryPosition.CM], dribbling: { inside: .83 }, shooting: { placement: .95 }, attributeFloors: { pace: 19, acceleration: 19 } }),
  prime("Rogerio Seni", "2005", 32, 188, 85, "R", "setPieceKeeper", 2, "Keeps a composed position, distributes confidently and leaves goal for elite direct free kicks and penalties.", "set-piece walk-up|driven free kick|calm long distribution", [.07,.61,.46,.51,1,.72,.42,.18,.61,.87,.63,.81,.11,.75], { shooting: { power: .99, placement: .91 }, passing: { switch: .93, execution: .91 }, receiving: { security: .91 }, attributeFloors: { freeKickAccuracy: 20, penaltyTaking: 20 } }),
  prime("Ronaldo Gaucho", "2005-06", 25, 182, 80, "R", "closeControlCreator", 1, "Receives left with freedom, destabilises through elasticos and pauses, then invents no-look passes, chips or curls.", "elastico|no-look pass|sombrero control|delicate chip", [1,1,.83,.79,.83,.8,.99,.87,.99,.63,.99,.92,.67,.97], { secondaryPositions: [PrimaryPosition.LW], dribbling: { feint: 1, escape: .99 }, shooting: { placement: .95, chip: 1 }, passing: { risk: 1 }, receiving: { security: 1 } }),
  prime("Romaria Souza", "1993-94", 28, 167, 70, "R", "poacher", 1, "Waits near the last line, creates a yard with a toe-touch and wins one-on-ones by poke, dink or placement.", "box toe-touch|toe-poke finish|goalkeeper dink", [.57,.95,.84,1,.49,.95,.32,.19,.48,.65,.87,.26,.97,.95], { dribbling: { feint: .91 }, shooting: { placement: 1, chip: .99 } }),

  // Lusitana.
  prime("Eusebio Silvo", "1965-66", 24, 175, 76, "R", "completeStriker", 1, "Explodes through central space with powerful balance and strikes early from inside or outside the box.", "central power burst|early long strike|contact-resistant finish", [.81,.87,.99,1,.97,.86,.54,.41,.6,.87,.91,.43,.99,.75], { dribbling: { shielding: .91 }, shooting: { power: 1, placement: .95 } }),
  prime("Rui Costas", "1999-00", 27, 180, 74, "R", "creativeTen", 1, "Floats between midfield and attack, receives softly and prioritises the perfectly weighted assist over his own shot.", "free pocket drift|velvet half-turn|weighted final pass", [.65,.95,.67,.37,.66,.7,1,.71,.99,.57,1,.95,.62,.94], { secondaryPositions: [PrimaryPosition.CM], dribbling: { escape: .91 }, passing: { risk: .97, execution: 1 }, receiving: { security: .99 } }),
  prime("Anderson Deko", "2003-04", 26, 174, 73, "R", "tempoController", 1, "Press-resistant and combative, he changes tempo through short combinations, disguised vertical balls and switches.", "pressure swivel|tempo disguise|vertical split pass", [.59,.93,.7,.53,.85,.7,.97,.69,.99,.75,.99,.92,.54,.99], { secondaryPositions: [PrimaryPosition.CM], dribbling: { escape: .97 }, passing: { risk: .87, switch: .95 }, receiving: { security: .99 }, attributeFloors: { workRate: 18, aggression: 16 } }),
  prime("Cristiano Ronaldi", "2011-12", 27, 187, 83, "R", "invertedScorer", 1, "Starts left, explodes through stepovers into scoring zones and attacks the box for power finishes and towering headers.", "left-wing stepover burst|inside power shot|back-post leap", [.85,.88,1,1,.95,.95,.58,.79,.71,.9,.88,.38,1,.83], { secondaryPositions: [PrimaryPosition.ST, PrimaryPosition.RW], dribbling: { inside: .95, outside: .87, feint: .97 }, shooting: { power: 1, aerial: 1 }, attributeFloors: { jumping: 20, heading: 19, pace: 19, acceleration: 19 } }),
  prime("Luis Figgo", "1999-00", 27, 180, 75, "R", "wideCreator", 1, "Controls the right flank through repeated feints and alternates byline crosses with inside playmaking and switches.", "double feint|right-byline cross|inside diagonal", [.89,.95,.82,.57,.64,.71,.89,.99,.91,.75,.91,.82,.77,.88], { secondaryPositions: [PrimaryPosition.LW, PrimaryPosition.CAM], dribbling: { outside: .93, feint: .99, shielding: .79 }, passing: { switch: .95, execution: .99 }, receiving: { security: .97 } }),

  // Slavonica.
  prime("Dragan Dzajik", "1968", 22, 177, 76, "L", "wideCreator", 1, "A classic left winger with long stride who wrong-foots the full-back at speed and supplies exact crosses.", "full-speed body swerve|left-touchline sprint|precision cross", [.91,.88,.97,.69,.79,.7,.6,1,.74,.85,.83,.58,.92,.72], { dribbling: { outside: .99, feint: .95 }, shooting: { placement: .87 }, passing: { execution: .99 }, attributeFloors: { freeKickAccuracy: 19 } }),
  prime("Dejan Savicevik", "1993-94", 27, 181, 77, "L", "closeControlCreator", 1, "Plays a free role at his own tempo, gliding past markers before a surgically timed assist, chip or running shot.", "languid pause|left-foot glide|surprise chip", [.95,.99,.87,.82,.76,.79,.99,.87,.91,.71,.99,.89,.77,.9], { secondaryPositions: [PrimaryPosition.RW, PrimaryPosition.ST], dribbling: { feint: .97 }, shooting: { chip: .97, placement: .91 }, passing: { risk: .97 } }),
  prime("Predrag Mijatovik", "1997-98", 28, 177, 73, "R", "completeStriker", 2, "Moves fluidly between second striker and nine, controls tightly and chooses clever combinations or clean finishes.", "second-striker drift|tight box turn|calm decisive finish", [.69,.91,.77,.88,.65,.89,.85,.55,.93,.67,.95,.83,.86,.88], { secondaryPositions: [PrimaryPosition.CAM], dribbling: { feint: .83 }, shooting: { placement: .95 } }),
  prime("Luka Modriq", "2017-18", 32, 172, 66, "R", "tempoController", 1, "Scans constantly, turns away with outside-foot touches and progresses through carries, combinations or precise diagonals.", "outside-foot escape|press-resistant turn|trivela diagonal", [.65,.99,.68,.35,.73,.66,.95,.65,1,.69,1,.99,.52,.99], { secondaryPositions: [PrimaryPosition.CDM, PrimaryPosition.CAM], dribbling: { escape: 1 }, passing: { switch: .99, execution: 1 }, receiving: { security: 1 } }),
  prime("Zvonimir Bobanov", "1993-94", 25, 185, 79, "R", "creativeTen", 2, "Organises from multiple midfield lanes, uses feints to find scarce space and combines long passing with forceful shooting.", "midfield feint|space-finding turn|long diagonal", [.63,.87,.69,.7,.87,.76,.91,.72,.86,.75,.93,.86,.69,.84], { secondaryPositions: [PrimaryPosition.CM, PrimaryPosition.RW], dribbling: { feint: .89, shielding: .83 }, shooting: { power: .89 }, passing: { switch: .97, execution: .95 } }),

  // Caledonia and Emeraldia.
  prime("Henrik Larson", "2000-01", 29, 177, 74, "R", "completeStriker", 2, "Works across the line, loses markers intelligently and combines selflessly before finishing by foot, head or volley.", "marker-losing arc|selfless layoff|compact volley", [.45,.85,.75,.99,.61,.97,.71,.48,.91,.72,.78,.67,.97,.95], { shooting: { placement: .95, aerial: .91 }, attributeFloors: { workRate: 18 } }),
  prime("Jimi Johnstone", "1966-67", 22, 163, 60, "R", "wingDribbler", 2, "Keeps impossibly close control on the right, changes direction repeatedly and beats full-backs before cutting back.", "low-centre weave|repeat direction change|right-byline cutback", [1,1,.93,.55,.54,.64,.57,.89,.83,.76,.95,.65,.88,.74], { secondaryPositions: [PrimaryPosition.LW], dribbling: { outside: .97, feint: 1, escape: .99 } }),
  prime("Ally McCoyst", "1991-92", 29, 178, 74, "R", "poacher", 2, "Never stops adjusting in the box, senses loose space and shoots early from positions others would decline.", "constant box shuffle|loose-space instinct|early one-on-one finish", [.27,.68,.7,1,.67,.98,.32,.23,.49,.75,.63,.29,.99,.98], { shooting: { placement: .96, power: .84 } }),
  prime("Paul Gascoine", "1990-91", 23, 177, 80, "R", "creativeTen", 1, "Receives in traffic, rolls away with strength and spontaneous skill, then drives centrally to create or shoot.", "shoulder roll|central weaving carry|improvised final ball", [.88,.97,.85,.77,.83,.72,.95,.72,.94,.74,.98,.9,.74,.88], { secondaryPositions: [PrimaryPosition.CM], dribbling: { feint: .97, shielding: .89, escape: .98 }, shooting: { power: .87 }, passing: { risk: .96 }, receiving: { security: .97 } }),
  prime("Damian Duf", "2002-03", 23, 177, 73, "L", "powerWinger", 2, "Carries directly down the left with repeated pace, threatens either the byline or inside lane and crosses on the run.", "left-line burst|inside-out touch|running cross", [.89,.87,.96,.65,.63,.68,.58,.92,.75,.88,.86,.55,.94,.73], { secondaryPositions: [PrimaryPosition.RW], dribbling: { outside: .94, inside: .79 }, passing: { execution: .87 } }),
  prime("Robby Kean", "2007-08", 27, 175, 72, "R", "completeStriker", 2, "Buzzes around a partner, spins into channels and combines expressive touches with sharp, varied finishing.", "partner orbit|channel spin|cartwheel-era snap finish", [.65,.86,.86,.93,.62,.93,.68,.49,.9,.79,.91,.82,.91,.92], { secondaryPositions: [PrimaryPosition.CAM], shooting: { placement: .94, chip: .84 } }),

  // Alpenheim, Danubria and Anatolia.
  prime("Xherdan Shaqiry", "2012-13", 21, 169, 72, "L", "invertedScorer", 2, "Uses a stocky base and direct carry from the right, then passes or shoots left-footed with almost no backlift.", "stocky contact carry|minimal-backlift strike|surprise first-time finish", [.79,.89,.91,.85,.91,.91,.82,.8,.79,.86,.89,.72,.83,.84], { secondaryPositions: [PrimaryPosition.CAM, PrimaryPosition.LW], dribbling: { inside: .94, shielding: .91 }, shooting: { power: .93 } }),
  prime("Gheorghe Hagy", "1993-94", 29, 174, 73, "L", "creativeTen", 1, "Commands the right-to-central lane and attempts audacious left-foot shots and passes from distances few consider.", "right-side inward drift|left-foot thunderbolt|audacious long assist", [.71,.93,.76,.9,.99,.74,.98,.84,.85,.92,.96,.88,.72,.85], { secondaryPositions: [PrimaryPosition.RW], shooting: { power: .99, placement: .93 }, passing: { risk: 1, switch: .96 }, attributeFloors: { freeKickAccuracy: 20, longShots: 20 } }),
  prime("Alex De Souzza", "2004-05", 27, 175, 73, "R", "creativeTen", 2, "Finds central pockets at a patient tempo, disguises the final pass and arrives for placed shots and elite dead balls.", "patient pocket reception|disguised through ball|placed free kick", [.58,.92,.58,.75,.86,.79,.98,.73,.96,.63,.99,.94,.68,.92], { secondaryPositions: [PrimaryPosition.CM], shooting: { placement: .96 }, passing: { execution: .98 }, attributeFloors: { freeKickAccuracy: 19 } }),

  // Final cross-league inspirations.
  prime("Roberto Carloz", "1997-98", 28, 168, 70, "L", "attackingFullback", 1, "Explodes repeatedly beyond the left wing, uses huge outside touches and delivers or shoots with extreme power.", "overlap launch|outside knock-on|swerving power strike", [.86,.82,1,.68,.98,.73,.59,.95,.72,.94,.82,.52,.99,.7], { dribbling: { outside: .99 }, shooting: { power: 1 }, passing: { execution: .9 }, attributeFloors: { pace: 20, acceleration: 20, longShots: 19, freeKickAccuracy: 19 } }),
  prime("Ricardo Quaresmo", "2007-08", 24, 175, 74, "R", "wideCreator", 2, "Isolates a full-back, uses extravagant outside-foot touches and bends crosses or shots with the trivela.", "outside-foot feint|trivela cross|right-wing isolation", [.94,.94,.86,.72,.8,.68,.75,.99,.74,.77,.92,.71,.81,.76], { secondaryPositions: [PrimaryPosition.LW], dribbling: { outside: 1, feint: .99 }, passing: { risk: .94, execution: .92 }, shooting: { placement: .86 } }),
  prime("Predrag Djordjevik", "2002-03", 26, 180, 75, "L", "wideCreator", 3, "Runs the left lane tirelessly, attacks the back post and combines reliable delivery with forceful left-foot shooting.", "tireless left overlap|back-post arrival|driven left cross", [.72,.81,.82,.73,.79,.78,.6,.91,.8,.84,.82,.61,.88,.81], { secondaryPositions: [PrimaryPosition.LB], shooting: { power: .88 }, attributeFloors: { workRate: 19, naturalFitness: 18 } }),
  prime("Djibril Cise", "2003-04", 22, 183, 78, "R", "channelFinisher", 2, "Lives on the shoulder, knocks into open grass and relies on explosive separation before an early power finish.", "last-line launch|open-grass knock-on|early power drive", [.55,.71,1,.97,.76,.86,.4,.35,.51,.94,.73,.17,1,.76], { shooting: { power: .97 }, attributeFloors: { pace: 20, acceleration: 20 } }),
];

export const ICONIC_PRIME_PROFILES: Readonly<Record<string, IconicPrimeProfile>> = Object.freeze(
  Object.fromEntries(PROFILE_SEEDS.map((seed) => {
    const profile = resolveSeed(seed);
    return [profile.id, Object.freeze(profile)];
  })),
);

const PROFILE_BY_ALIAS = new Map(Object.values(ICONIC_PRIME_PROFILES).map((profile) => [profile.alias, profile]));

type IconicProfileLookup = Pick<Player, "iconicPrimeProfileId" | "modernPlayerIdentityId"> &
  Partial<Pick<Player, "firstName" | "lastName">>;

export function getIconicPrimeProfile(playerOrId: IconicProfileLookup | string | undefined): IconicPrimeProfile | undefined {
  if (typeof playerOrId === "string") return ICONIC_PRIME_PROFILES[playerOrId];
  // A contemporary-mode identity can resemble the transformed iconic spelling,
  // but must never inherit the special mode's prime mechanics.
  if (playerOrId?.modernPlayerIdentityId) return undefined;
  const byId = playerOrId?.iconicPrimeProfileId
    ? ICONIC_PRIME_PROFILES[playerOrId.iconicPrimeProfileId]
    : undefined;
  if (byId) return byId;
  // Save compatibility: careers created before this optional field existed
  // still have the stable transformed first/last name and gain the mechanics.
  const alias = playerOrId?.firstName && playerOrId.lastName
    ? `${playerOrId.firstName} ${playerOrId.lastName}`
    : undefined;
  return alias ? PROFILE_BY_ALIAS.get(alias) : undefined;
}

export function getIconicPrimeProfileByAlias(alias: string): IconicPrimeProfile | undefined {
  return PROFILE_BY_ALIAS.get(alias);
}

/** Apply prime identity without introducing an aggregate/overall rating. */
export function applyIconicPrimeProfile(player: Player, profile: IconicPrimeProfile): void {
  player.iconicPrimeProfileId = profile.id;
  player.age = profile.primeAge;
  player.height = profile.height;
  player.weight = profile.weight;
  player.preferredFoot = profile.preferredFoot;
  player.secondaryPositions = [...new Set([...profile.secondaryPositions, ...player.secondaryPositions])]
    .filter((position) => position !== player.primaryPosition);
  for (const [key, floor] of Object.entries(profile.attributeFloors) as [PrimeAttributeKey, number][]) {
    player[key] = Math.max(player[key], floor);
  }
  player.reputation = Math.max(player.reputation, profile.tier === 1 ? 96 : profile.tier === 2 ? 91 : 86);
  player.potentialCeiling = Math.max(player.potentialCeiling, profile.tier === 1 ? 20 : profile.tier === 2 ? 19 : 18);
}
