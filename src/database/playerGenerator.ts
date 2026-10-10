/**
 * Player generation algorithm.
 * Stats are 1-20. Hidden potential drives current ability.
 */
import {
  Personality,
  PlaystyleTag,
  PrimaryPosition,
  type Player,
  type PlayerSeasonStats,
} from "@/types";
import { SeededRNG, clamp, randomSeed } from "@/database/rng";
import { generateName } from "@/database/nameGenerator";

/** Attribute keys that are generated (kept as a typed list) */
export const TECHNICAL_ATTRS = [
  "ballControl", "dribbling", "shortPassing", "longPassing", "crossing",
  "finishing", "longShots", "heading", "freeKickAccuracy", "penaltyTaking",
  "technique", "volleying",
] as const;

export const PHYSICAL_ATTRS = [
  "pace", "acceleration", "strength", "jumping", "agility", "balance", "naturalFitness",
] as const;

export const MENTAL_ATTRS = [
  "anticipation", "composure", "concentration", "creativity", "decisions",
  "determination", "flair", "leadership", "offTheBall", "positioning",
  "teamwork", "workRate", "aggression", "bravery",
] as const;

export const DEFENSIVE_ATTRS = [
  "marking", "tackling", "slideTackling", "interceptions", "aerialDuels",
] as const;

export const GK_ATTRS = [
  "reflexes", "shotStopping", "oneOnOnes", "communication", "punching",
  "throwing", "kicking", "handling", "sweeping", "distributionGK",
] as const;

type AttrKey =
  | (typeof TECHNICAL_ATTRS)[number]
  | (typeof PHYSICAL_ATTRS)[number]
  | (typeof MENTAL_ATTRS)[number]
  | (typeof DEFENSIVE_ATTRS)[number]
  | (typeof GK_ATTRS)[number];

export const ALL_ATTRS: AttrKey[] = [
  ...TECHNICAL_ATTRS, ...PHYSICAL_ATTRS, ...MENTAL_ATTRS, ...DEFENSIVE_ATTRS, ...GK_ATTRS,
];

/**
 * Position weight overrides: every attribute defaults to 1.0;
 * only the interesting multipliers are listed per position.
 * e.g. Striker gets Finishing 1.3, Tackling 0.3.
 */
type WeightMap = Partial<Record<AttrKey, number>>;

const POSITION_OVERRIDES: Record<PrimaryPosition, WeightMap> = {
  GK: {
    reflexes: 1.5, shotStopping: 1.5, oneOnOnes: 1.4, handling: 1.4, communication: 1.2,
    punching: 1.2, throwing: 1.1, kicking: 1.1, sweeping: 1.2, distributionGK: 1.2,
    positioning: 1.1, concentration: 1.2, composure: 1.1, bravery: 1.1,
    finishing: 0.2, dribbling: 0.2, shortPassing: 0.5, longPassing: 0.7, crossing: 0.2,
    tackling: 0.2, marking: 0.2, slideTackling: 0.2, interceptions: 0.3,
    pace: 0.5, acceleration: 0.6, agility: 0.9,
  },
  RB: {
    pace: 1.2, acceleration: 1.2, crossing: 1.3, tackling: 1.2, interceptions: 1.15,
    marking: 1.15, workRate: 1.2,
    teamwork: 1.1, offTheBall: 1.05, dribbling: 1.05, shortPassing: 1.05,
    finishing: 0.5, longShots: 0.5, heading: 0.9,
    penaltyTaking: 0.5, freeKickAccuracy: 0.7,
  },
  LB: {
    pace: 1.2, acceleration: 1.2, crossing: 1.3, tackling: 1.2, interceptions: 1.15,
    marking: 1.15, workRate: 1.2, teamwork: 1.1, dribbling: 1.05, shortPassing: 1.05,
    finishing: 0.5, longShots: 0.5, heading: 0.9,
    penaltyTaking: 0.5, freeKickAccuracy: 0.7,
  },
  CB: {
    marking: 1.4, tackling: 1.3, slideTackling: 1.2, interceptions: 1.3, aerialDuels: 1.3,
    heading: 1.3, strength: 1.2, jumping: 1.25, bravery: 1.15, positioning: 1.3,
    composure: 1.05, concentration: 1.2, aggression: 1.1,
    pace: 0.9, acceleration: 0.9, dribbling: 0.6, crossing: 0.5, finishing: 0.4,
    longShots: 0.4, agility: 0.8, freeKickAccuracy: 0.5, penaltyTaking: 0.5,
  },
  CDM: {
    shortPassing: 1.2, longPassing: 1.2, interceptions: 1.3, tackling: 1.25, marking: 1.15,
    positioning: 1.3, composure: 1.15, concentration: 1.15, teamwork: 1.2, decisions: 1.15,
    creativity: 1.05,
    finishing: 0.5, crossing: 0.7, dribbling: 0.9,
  },
  CM: {
    shortPassing: 1.25, longPassing: 1.2, technique: 1.15, creativity: 1.15,
    decisions: 1.15, teamwork: 1.15, offTheBall: 1.1, composure: 1.1,
    tackling: 1.05, interceptions: 1.05, workRate: 1.1,
    finishing: 0.8, heading: 0.9, crossing: 0.9,
  },
  CAM: {
    creativity: 1.35, technique: 1.3, dribbling: 1.25, flair: 1.3, ballControl: 1.25,
    shortPassing: 1.2, offTheBall: 1.2, composure: 1.15, longShots: 1.15,
    freeKickAccuracy: 1.1, acceleration: 1.05, agility: 1.1,
    tackling: 0.4, marking: 0.35, slideTackling: 0.3, interceptions: 0.5,
    heading: 0.7, strength: 0.85,
  },
  RW: {
    pace: 1.3, acceleration: 1.3, dribbling: 1.3, ballControl: 1.2, crossing: 1.3,
    agility: 1.2, flair: 1.15, offTheBall: 1.15, finishing: 1.0, technique: 1.1,
    tackling: 0.5, marking: 0.4, slideTackling: 0.4, interceptions: 0.55,
    heading: 0.7, strength: 0.85,
  },
  LW: {
    pace: 1.3, acceleration: 1.3, dribbling: 1.3, ballControl: 1.2, crossing: 1.15,
    agility: 1.2, flair: 1.2, offTheBall: 1.15, finishing: 1.1, technique: 1.15,
    tackling: 0.5, marking: 0.4, slideTackling: 0.4, interceptions: 0.55,
    heading: 0.7, strength: 0.85,
  },
  ST: {
    finishing: 1.3, composure: 1.25, offTheBall: 1.3, heading: 1.2, longShots: 1.1,
    strength: 1.15, jumping: 1.1, anticipation: 1.2, agility: 1.05, volleying: 1.1,
    penaltyTaking: 1.1, dribbling: 1.05,
    tackling: 0.3, marking: 0.25, slideTackling: 0.25, interceptions: 0.4,
    crossing: 0.8,
  },
};

/** Fully expanded position -> attribute multiplier map (default 1.0) */
export const positionWeights: Record<PrimaryPosition, Record<string, number>> = Object.fromEntries(
  (Object.keys(POSITION_OVERRIDES) as PrimaryPosition[]).map((pos) => {
    const overrides = { ...POSITION_OVERRIDES[pos] };
    const full: Record<string, number> = {};
    for (const attr of ALL_ATTRS) full[attr] = 1.0;
    for (const [k, v] of Object.entries(overrides)) if (typeof v === "number") full[k] = v;
    return [pos, full];
  }),
) as Record<PrimaryPosition, Record<string, number>>;

/** Weighted random age per the design doc */
export function rollAge(rng: SeededRNG): number {
  const bucket = rng.weighted<number>([
    [rng.int(22, 28), 40],
    [rng.int(18, 21), 25],
    [rng.int(29, 32), 20],
    [rng.int(16, 17), 10],
    [rng.int(33, 38), 5],
  ]);
  return bucket;
}

/** Real football position distribution (more CMs and CBs than GKs) */
const POSITION_DISTRIBUTION: [PrimaryPosition, number][] = [
  [PrimaryPosition.GK, 6],
  [PrimaryPosition.RB, 8],
  [PrimaryPosition.CB, 16],
  [PrimaryPosition.LB, 8],
  [PrimaryPosition.CDM, 9],
  [PrimaryPosition.CM, 16],
  [PrimaryPosition.CAM, 9],
  [PrimaryPosition.RW, 8],
  [PrimaryPosition.LW, 8],
  [PrimaryPosition.ST, 12],
];

const ALL_POSITIONS = Object.values(PrimaryPosition);

export interface GeneratePlayerOptions {
  age?: number;
  position?: PrimaryPosition;
  nationality?: string;
  potentialCeiling?: number;
  isYouth?: boolean;
  clubId?: string;
  seed?: number;
}

/** Bell curve centered at 11, std dev 3, clamped 4-20 */
function rollPotential(rng: SeededRNG): number {
  return rng.normal(11, 3, 4, 20);
}

const POSITION_NEIGHBORS: Record<PrimaryPosition, PrimaryPosition[]> = {
  GK: [],
  RB: [PrimaryPosition.RW, PrimaryPosition.CB, PrimaryPosition.LB],
  CB: [PrimaryPosition.CDM, PrimaryPosition.RB, PrimaryPosition.LB],
  LB: [PrimaryPosition.LW, PrimaryPosition.CB, PrimaryPosition.RB],
  CDM: [PrimaryPosition.CM, PrimaryPosition.CB],
  CM: [PrimaryPosition.CDM, PrimaryPosition.CAM],
  CAM: [PrimaryPosition.CM, PrimaryPosition.ST, PrimaryPosition.LW, PrimaryPosition.RW],
  RW: [PrimaryPosition.LW, PrimaryPosition.CAM, PrimaryPosition.ST],
  LW: [PrimaryPosition.RW, PrimaryPosition.CAM, PrimaryPosition.ST],
  ST: [PrimaryPosition.CAM, PrimaryPosition.LW, PrimaryPosition.RW],
};

const PERSONALITY_WEIGHTS: [Personality, number][] = [
  [Personality.Professional, 18],
  [Personality.Relaxed, 14],
  [Personality.FairlyProfessional, 14],
  [Personality.Ambitious, 12],
  [Personality.Spirited, 10],
  [Personality.Reserved, 10],
  [Personality.Perfectionist, 8],
  [Personality.Temperamental, 6],
  [Personality.Flaky, 5],
  [Personality.Mercenary, 3],
];

function emptySeasonStats(): PlayerSeasonStats {
  return { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, lastRating: 0 };
}

export function generatePlayer(options: GeneratePlayerOptions = {}): Player {
  const rng = options.seed !== undefined ? new SeededRNG(options.seed) : new SeededRNG(randomSeed());
  const nationality = options.nationality ?? "Bretherland";
  const { firstName, lastName } = generateName(nationality, rng);

  const age = options.age ?? rollAge(rng);
  const position = options.position ?? rng.weighted(POSITION_DISTRIBUTION);
  const potentialCeiling = options.potentialCeiling ?? rollPotential(rng);

  // Current ability grows toward ceiling with age until ~30
  let developmentProgress: number;
  if (age < 22) developmentProgress = 0.7 + age * 0.015; // 0.94 at 21
  else if (age <= 30) developmentProgress = 1.0;
  else developmentProgress = 1.0;
  developmentProgress = clamp(developmentProgress, 0.6, 1.0);

  const weights = positionWeights[position];
  const attrs: Record<string, number> = {};
  for (const attr of ALL_ATTRS) {
    const base = potentialCeiling * weights[attr] * rng.float(0.7, 1.15);
    let value = base * developmentProgress;
    // Physical decline after 30
    if (age > 30 && PHYSICAL_ATTRS.includes(attr as (typeof PHYSICAL_ATTRS)[number])) {
      value -= (age - 30) * 0.4;
    }
    value += rng.float(-2, 2); // random noise
    attrs[attr] = clamp(Math.round(value), 1, 20);
  }

  const playstyles = assignPlaystyles(attrs, position, rng);
  const personality = rng.weighted(PERSONALITY_WEIGHTS);
  const morale = Math.round(rng.float(55, 80));
  const shirtNumber = rng.int(1, 99);

  // Secondary positions: neighbors the player plausibly covers
  const neighbors = POSITION_NEIGHBORS[position] ?? [];
  const secondaryPositions = neighbors.filter(() => rng.chance(0.35));

  const reputation = clamp(
    Math.round(potentialCeiling * 4 + rng.float(-8, 8) + (age < 21 ? 3 : 0)),
    5,
    95,
  );

  const isYouth = options.isYouth ?? age <= 18;
  const developmentRate = Number(rng.float(0.8, 1.3).toFixed(2));

  const value = estimateValue(potentialCeiling, age, reputation);

  return {
    id: `p_${firstName}_${lastName}_${Math.floor(rng.next() * 1e9)
      .toString(36)
      .padStart(6, "0")}`.toLowerCase().replace(/\s+/g, ""),
    firstName,
    lastName,
    nationality,
    age,
    height: rng.int(165, 198),
    weight: rng.int(62, 94),
    preferredFoot: rng.chance(0.72) ? "Right" : "Left",
    primaryPosition: position,
    secondaryPositions,
    ...attrs,
    playstyles,
    contract: {
      clubId: options.clubId ?? "",
      weeklyWage: Math.round(value / 60),
      contractYearsRemaining: rng.int(1, 5),
      transferValue: value,
    },
    condition: 94,
    matchSharpness: 68,
    injury: null,
    trainingProgress: {},
    morale,
    personality,
    reputation,
    potentialCeiling,
    developmentRate,
    isYouth,
    shirtNumber,
    seasonStats: emptySeasonStats(),
  } as Player;
}

/** Rough market value in currency units */
export function estimateValue(potential: number, age: number, reputation: number): number {
  const ageFactor =
    age <= 21 ? 1.35 : age <= 25 ? 1.25 : age <= 29 ? 1.0 : age <= 32 ? 0.7 : 0.45;
  const abilityFactor = Math.pow(potential / 20, 2.6);
  return Math.round(abilityFactor * ageFactor * (reputation / 50) * 40_000_000 + 50_000);
}

/** Assign 1-3 PlaystyleTags based on highest attributes */
function assignPlaystyles(
  attrs: Record<string, number>,
  position: PrimaryPosition,
  rng: SeededRNG,
): PlaystyleTag[] {
  const candidates: [PlaystyleTag, number][] = [];
  const add = (tag: PlaystyleTag, score: number) => candidates.push([tag, score]);

  if (attrs.finishing >= 13) add(PlaystyleTag.ClinicalFinisher, attrs.finishing);
  if (attrs.finishing >= 11 && attrs.offTheBall >= 13 && position === PrimaryPosition.ST)
    add(PlaystyleTag.Poacher, attrs.offTheBall + attrs.finishing);
  if (attrs.heading >= 14 && attrs.strength >= 13)
    add(PlaystyleTag.TargetMan, attrs.heading + attrs.strength);
  if (attrs.shortPassing >= 14 && attrs.creativity >= 13)
    add(PlaystyleTag.Playmaker, attrs.shortPassing + attrs.creativity);
  if (attrs.workRate >= 14 && attrs.teamwork >= 13)
    add(PlaystyleTag.BoxToBox, attrs.workRate + attrs.teamwork);
  if (attrs.tackling >= 14 && attrs.interceptions >= 13)
    add(PlaystyleTag.BallWinner, attrs.tackling + attrs.interceptions);
  if (attrs.dribbling >= 14 && attrs.acceleration >= 13)
    add(PlaystyleTag.Dribbler, attrs.dribbling + attrs.acceleration);
  if (attrs.pace >= 14 && (position === PrimaryPosition.RW || position === PrimaryPosition.LW))
    add(PlaystyleTag.Winger, attrs.pace + attrs.crossing);
  if (attrs.crossing >= 14) add(PlaystyleTag.Crosser, attrs.crossing);
  if (attrs.longShots >= 14) add(PlaystyleTag.LongShotSpecialist, attrs.longShots);
  if (attrs.freeKickAccuracy >= 15 || attrs.penaltyTaking >= 15)
    add(PlaystyleTag.SetPieceSpecialist, attrs.freeKickAccuracy + attrs.penaltyTaking);
  if (attrs.aerialDuels >= 14 && attrs.jumping >= 13)
    add(PlaystyleTag.AerialThreat, attrs.aerialDuels + attrs.jumping);
  if (attrs.marking >= 13 && attrs.shortPassing >= 12 && position === PrimaryPosition.CB)
    add(PlaystyleTag.BallPlayingDefender, attrs.shortPassing + attrs.marking);
  if (attrs.positioning >= 14 && position === PrimaryPosition.CB && attrs.pace <= 12)
    add(PlaystyleTag.Sweeper, attrs.positioning);
  if (attrs.pace >= 13 && attrs.crossing >= 12 && (position === PrimaryPosition.RB || position === PrimaryPosition.LB))
    add(PlaystyleTag.FullBackRunner, attrs.pace + attrs.crossing);
  if (attrs.workRate >= 14 && attrs.acceleration >= 12 && position === PrimaryPosition.ST)
    add(PlaystyleTag.PressingForward, attrs.workRate + attrs.acceleration);
  if (attrs.flair >= 14 && attrs.dribbling >= 13 && (position === PrimaryPosition.LW || position === PrimaryPosition.RW || position === PrimaryPosition.CAM))
    add(PlaystyleTag.CreativeInsideForward, attrs.flair + attrs.dribbling);
  if (attrs.pace >= 15 && attrs.acceleration >= 14)
    add(PlaystyleTag.PaceAbuser, attrs.pace + attrs.acceleration + attrs.dribbling * 0.3);
  if (attrs.creativity >= 14 && attrs.decisions >= 13 && Math.max(attrs.shortPassing, attrs.longPassing) >= 13)
    add(PlaystyleTag.ThroughBallSpecialist, attrs.creativity + attrs.decisions + attrs.shortPassing * 0.4);
  if (attrs.ballControl >= 14 && attrs.composure >= 13 && attrs.balance >= 12)
    add(PlaystyleTag.PressResistant, attrs.ballControl + attrs.composure + attrs.balance * 0.5);
  if (attrs.offTheBall >= 14 && attrs.anticipation >= 13)
    add(PlaystyleTag.SpaceInterpreter, attrs.offTheBall + attrs.anticipation);
  if (attrs.ballControl >= 15 && attrs.technique >= 14)
    add(PlaystyleTag.FirstTouchSpecialist, attrs.ballControl + attrs.technique);
  if (attrs.crossing >= 13 && attrs.decisions >= 12 && attrs.acceleration >= 12 &&
      [PrimaryPosition.RB, PrimaryPosition.LB, PrimaryPosition.RW, PrimaryPosition.LW].includes(position))
    add(PlaystyleTag.CutbackSpecialist, attrs.crossing + attrs.decisions + attrs.acceleration * 0.35);
  if (attrs.interceptions >= 14 && attrs.anticipation >= 13)
    add(PlaystyleTag.Interceptor, attrs.interceptions + attrs.anticipation);
  if (attrs.leadership >= 15) add(PlaystyleTag.Leader, attrs.leadership);

  candidates.sort((a, b) => b[1] - a[1]);
  const count = rng.weighted<number>([[1, 45], [2, 40], [3, 15]]);
  const picked: PlaystyleTag[] = [];
  for (const [tag] of candidates) {
    if (picked.length >= count) break;
    if (!picked.includes(tag)) picked.push(tag);
  }
  if (picked.length === 0) {
    picked.push(rng.chance(0.5) ? PlaystyleTag.Leader : PlaystyleTag.BallWinner);
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Squad generation
// ---------------------------------------------------------------------------

export interface SquadPlan {
  gk: number;
  def: number;
  mid: number;
  fwd: number;
}

/**
 * Generate 25-30 players for a club with realistic distribution:
 * 2-3 GKs, 7-8 defenders, 7-8 midfielders, 5-6 forwards.
 */
export function generateSquad(
  clubId: string,
  leagueLevel: number,
  nationality: string,
  rng: SeededRNG,
  baseSeed: number,
): Player[] {
  const plan: SquadPlan = {
    gk: rng.int(2, 3),
    def: rng.int(7, 8),
    mid: rng.int(7, 8),
    fwd: rng.int(5, 6),
  };

  const defPositions: PrimaryPosition[] = [];
  for (let i = 0; i < plan.def; i++) {
    defPositions.push(
      i === 0 ? PrimaryPosition.RB
        : i === 1 ? PrimaryPosition.LB
        : i % 4 === 2 ? PrimaryPosition.CB
        : i % 4 === 3 ? PrimaryPosition.CB
        : rng.pick([PrimaryPosition.CB, PrimaryPosition.RB, PrimaryPosition.LB]),
    );
  }

  const midPositions: PrimaryPosition[] = [];
  for (let i = 0; i < plan.mid; i++) {
    midPositions.push(
      i === 0 ? PrimaryPosition.CDM
        : i === 1 ? PrimaryPosition.CAM
        : rng.pick([PrimaryPosition.CM, PrimaryPosition.CM, PrimaryPosition.CAM, PrimaryPosition.CDM]),
    );
  }

  const fwdPositions: PrimaryPosition[] = [];
  for (let i = 0; i < plan.fwd; i++) {
    fwdPositions.push(
      i % 3 === 0 ? PrimaryPosition.ST
        : rng.pick([PrimaryPosition.ST, PrimaryPosition.RW, PrimaryPosition.LW]),
    );
  }

  const wanted: PrimaryPosition[] = [
    ...Array<PrimaryPosition>(plan.gk).fill(PrimaryPosition.GK),
    ...defPositions,
    ...midPositions,
    ...fwdPositions,
  ];

  // League level 1 = strongest: bias potential upward
  const potentialBoost = leagueLevel <= 2 ? 3 : leagueLevel <= 5 ? 1 : 0;

  const players: Player[] = [];
  for (let i = 0; i < wanted.length; i++) {
    const seed = baseSeed + i * 7919;
    const player = generatePlayer({
      seed,
      position: wanted[i],
      nationality,
      clubId,
      potentialCeiling: clamp(
        new SeededRNG(seed + 13).normal(11 + potentialBoost, 3, 4, 20),
        4,
        20,
      ),
    });
    player.contract.clubId = clubId;
    // Wage scales with league level
    const levelFactor = Math.max(0.25, 1.15 - leagueLevel * 0.05);
    player.contract.weeklyWage = Math.round(player.contract.weeklyWage * levelFactor);
    players.push(player);
  }

  // Unique shirt numbers
  const used = new Set<number>();
  for (const p of players) {
    let n = p.shirtNumber;
    while (used.has(n)) n = (n % 99) + 1;
    p.shirtNumber = n;
    used.add(n);
  }

  return players;
}
