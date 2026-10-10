/**
 * MatchSimulator — pure TypeScript match simulation (NO React).
 * Runs on a Web Worker (see matchWorker.ts) at 10 ticks per real second.
 *
 * Pitch: 1000 x 650 game units. 10 units = 1 meter (1000 units ~ 100m).
 * Home defends x=0 and attacks x=1000; away is mirrored.
 */
import {
  Difficulty,
  MatchEventType,
  MATCH_HEATMAP_COLUMNS,
  MATCH_HEATMAP_ROWS,
  MentalityLevel,
  PlayStyle,
  PlaystyleTag,
  PressingIntensity,
  TempoSetting,
  TimeWasting,
  WidthSetting,
  DefensiveLine,
  type MatchAnalysis,
  type MatchEvent,
  type MatchInjuryRecord,
  type MatchPlanAttackApproach,
  type MatchStats,
  type OpponentMatchPlan,
  type OpponentPlanChangeRecord,
  type OpponentPlayerPlan,
  type Player,
  type PlayerMatchAnalysis,
  type PlayerRoleAssignment,
  type PersistentManagerMemory,
  type TacticalChangeRecord,
  type TacticalEvent,
  type TacticalEventOutcome,
  type TacticalEventType,
  type TacticalMatchPhase,
  type TacticalSetup,
} from "@/types";
import { SeededRNG, clamp } from "@/database/rng";
import {
  resolveAerialDuel,
  resolveDribble,
  resolveHeader,
  resolveHoldOff,
  resolveLooseBallDuel,
  resolvePass,
  resolvePenalty,
  resolveShot,
  resolveTackle,
} from "@/engine/actionResolver";
import { getFormation, mirrorFormation } from "@/engine/formations";
import { mergeDirectives, type PlayerDirectives } from "@/engine/directives";
import { buildAIOpponentMatchPlan, sanitizeOpponentMatchPlan } from "@/engine/matchPlan";
import { MATCH_TIME_SCALE } from "@/engine/matchClock";
import { buildTacticalAnalytics, expectedGoalsAt } from "@/engine/tacticalAnalytics";
import {
  isPlayerAvailable,
  matchStartingEnergy,
  playerCondition,
  playerSharpness,
  postMatchCondition,
  rollMatchInjury,
} from "@/engine/fitness";
import {
  directivesForPlayerRole,
  playerRoleLabel,
  resolvePlayerRoleAssignment,
} from "@/engine/playerRoles";
import {
  chooseSpatialTarget,
  hasPlaystyle,
  playerAcceleration,
  playerSprintSpeed,
  styleBehavior,
  type BrainAgent,
  type PlayerIntent,
} from "@/engine/playerBrain";
import {
  chooseDribbleRoute,
  type CarryPhase,
  type DribblePattern,
  type DribbleRoute,
} from "@/engine/movementPatterns";

export const PITCH_W = 1000;
export const PITCH_H = 650;
export const UNITS_PER_METER = 10;

export type Side = "home" | "away";

export interface TeamSide {
  clubId: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  isHome: boolean;
  starters: Player[];
  bench: Player[];
  /** formation role per starter index */
  roles: string[];
  /** traditional 1-11 positional number per starter index */
  displayNumbers: number[];
  /** formation base position per starter index (already mirrored for away) */
  basePositions: { x: number; y: number }[];
  tactics: TacticalSetup;
  isUserTeam: boolean;
  /** Identity and tactical skill used by the adaptive opposition coach. */
  manager?: {
    id: string;
    name: string;
    tacticalFlexibility: number;
    reputation: number;
  };
  /** Persistent knowledge this exact AI manager has of the user. */
  managerMemory?: PersistentManagerMemory;
  /** Fixture-specific instructions against exact opposition players. */
  opponentPlan?: OpponentMatchPlan;
  /** Parsed team-wide natural-language instruction. */
  teamDirectives?: PlayerDirectives;
  /** Parsed individual/assigned instructions, keyed by playerId (user team only). */
  directives?: Record<string, PlayerDirectives>;
}

export interface SimOptions {
  seed: number;
  fixtureId?: string;
  /** Career difficulty controls opposition observation, reaction and decision quality. */
  difficulty?: Difficulty;
  /**
   * World/movement seconds per real second (default 0.5). Decoupling it from
   * the fixed match clock preserves calibrated action density over each half.
   */
  worldScale?: number;
}

export type Phase =
  | "kickoff"
  | "open"
  | "flight"
  | "setpiece"
  | "penalty"
  | "celebration"
  | "halftime"
  | "fulltime";

interface ActiveDribblePlan extends DribbleRoute {
  waypointIndex: number;
  startedAt: number;
  expiresAt: number;
}

interface SimPlayer {
  p: Player;
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** velocity in pitch units per world second */
  vx: number;
  vy: number;
  /** independently refreshed spatial decision */
  brainTx: number;
  brainTy: number;
  brainNextAt: number;
  intent: PlayerIntent;
  /** Stable multi-waypoint route chosen from control/value, not an animation state. */
  dribblePlan: ActiveDribblePlan | null;
  nextTouchAt: number;
  lastKnockOnAt: number;
  /** Formation position such as CB, CM or ST. */
  role: string;
  /** Explicit football job and duty executed within that position. */
  roleAssignment: PlayerRoleAssignment;
  /** tactical shirt number (1 keeper, 4/5 centre-backs, 10 creator, etc.) */
  number: number;
  tackleCd: number;
  /** world-time until which this player bursts forward (give-and-go) */
  runUntil: number;
  /** 1=fresh; high pressing and repeated sprints reduce it */
  energy: number;
  conditionBefore: number;
  rating: number;
  /** unavailable to simulation (red card or injury); telemetry distinguishes them */
  sentOff: boolean;
  injured: boolean;
  yellow: boolean;
  goals: number;
  assists: number;
}

interface PlayerTelemetryRuntime {
  data: PlayerMatchAnalysis;
  active: boolean;
  secondsPlayed: number;
  sprinting: boolean;
}

export interface AICoachProfile {
  firstReviewMinute: number;
  reviewIntervalMinutes: number;
  decisionQuality: number;
  usesMatchTrends: boolean;
  canChangeFormation: boolean;
  maxPlannedSubstitutions: number;
}

const AI_COACH_PROFILES: Record<Difficulty, AICoachProfile> = {
  [Difficulty.Beginner]: {
    firstReviewMinute: 65, reviewIntervalMinutes: 22, decisionQuality: 0.18,
    usesMatchTrends: false, canChangeFormation: false, maxPlannedSubstitutions: 1,
  },
  [Difficulty.Amateur]: {
    firstReviewMinute: 58, reviewIntervalMinutes: 18, decisionQuality: 0.3,
    usesMatchTrends: false, canChangeFormation: false, maxPlannedSubstitutions: 2,
  },
  [Difficulty.SemiPro]: {
    firstReviewMinute: 50, reviewIntervalMinutes: 15, decisionQuality: 0.46,
    usesMatchTrends: false, canChangeFormation: true, maxPlannedSubstitutions: 3,
  },
  [Difficulty.Professional]: {
    firstReviewMinute: 40, reviewIntervalMinutes: 12, decisionQuality: 0.63,
    usesMatchTrends: true, canChangeFormation: true, maxPlannedSubstitutions: 4,
  },
  [Difficulty.WorldClass]: {
    firstReviewMinute: 30, reviewIntervalMinutes: 9, decisionQuality: 0.77,
    usesMatchTrends: true, canChangeFormation: true, maxPlannedSubstitutions: 5,
  },
  [Difficulty.Legendary]: {
    firstReviewMinute: 22, reviewIntervalMinutes: 7, decisionQuality: 0.9,
    usesMatchTrends: true, canChangeFormation: true, maxPlannedSubstitutions: 5,
  },
  [Difficulty.Ultimate]: {
    firstReviewMinute: 15, reviewIntervalMinutes: 5, decisionQuality: 0.98,
    usesMatchTrends: true, canChangeFormation: true, maxPlannedSubstitutions: 5,
  },
  [Difficulty.Legend]: {
    firstReviewMinute: 22, reviewIntervalMinutes: 7, decisionQuality: 0.9,
    usesMatchTrends: true, canChangeFormation: true, maxPlannedSubstitutions: 5,
  },
};

export function getAICoachProfile(difficulty: Difficulty | string | undefined): AICoachProfile {
  return AI_COACH_PROFILES[difficulty as Difficulty] ?? AI_COACH_PROFILES[Difficulty.SemiPro];
}

export type PassFlavor = "driven" | "std" | "through" | "switch" | "pullback" | "lofted";

export interface PassTarget {
  idx: number;
  x: number;
  y: number;
  score: number;
  risky?: boolean;
  flavor?: PassFlavor;
  long?: boolean;
}

interface Flight {
  kind: "pass" | "shot" | "cross" | "knockOn";
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
  dur: number;
  side: Side;
  targetIdx?: number;
  shotOutcome?: { goal: boolean; saved: boolean; blocked: boolean; wide: boolean };
  passOutcome?: { success: boolean; intercepted: boolean };
  /** arc height in game units (lofted passes, crosses) */
  arcH?: number;
  flavor?: PassFlavor;
  passerId?: string;
  /** Prevent the same defender rolling for interception every simulation tick. */
  challengedIds?: string[];
  dribbleAttempt?: boolean;
  beatDefenderId?: string;
  /** Structured qualifier for the physical route used to knock the ball on. */
  movementPattern?: DribblePattern;
  countsAsPass?: boolean;
  penalty?: boolean;
  analyticsType?: TacticalEventType;
  analyticsEventId?: string;
}

/** Ball-speed profiles per pass flavour (metres per second). */
function passSpeed(flavor: PassFlavor, rng: SeededRNG): number {
  switch (flavor) {
    case "driven": return rng.float(21, 27);
    case "through": return rng.float(24, 30);
    case "switch": return rng.float(14, 18);
    case "pullback": return rng.float(17, 21);
    case "lofted": return rng.float(13, 16);
    default: return rng.float(15, 21);
  }
}

/** Passing personality per play style. */
interface PassProfile {
  shortPref: number; progW: number; laneW: number; openW: number; riskTol: number;
}
const PASS_PROFILE: Record<string, PassProfile> = {
  TikiTaka: { shortPref: 12, progW: 0.16, laneW: 2.4, openW: 1.3, riskTol: 0.3 },
  PossessionBased: { shortPref: 13, progW: 0.2, laneW: 2.3, openW: 1.35, riskTol: 0.3 },
  RouteOne: { shortPref: 30, progW: 0.32, laneW: 0.9, openW: 0.7, riskTol: 0.8 },
  LongBallDirect: { shortPref: 30, progW: 0.3, laneW: 1.0, openW: 0.7, riskTol: 0.75 },
  DirectCounterAttack: { shortPref: 24, progW: 0.27, laneW: 1.3, openW: 0.9, riskTol: 0.6 },
  WingPlay: { shortPref: 18, progW: 0.25, laneW: 1.6, openW: 1.1, riskTol: 0.5 },
  GegenpressingStyle: { shortPref: 13, progW: 0.32, laneW: 1.7, openW: 1.1, riskTol: 0.45 },
  ParkTheBus: { shortPref: 22, progW: 0.2, laneW: 1.9, openW: 1.1, riskTol: 0.3 },
  TotalFootball: { shortPref: 16, progW: 0.27, laneW: 1.6, openW: 1.1, riskTol: 0.5 },
  Balanced: { shortPref: 17, progW: 0.28, laneW: 1.6, openW: 1.0, riskTol: 0.5 },
};

/** Tactical line a formation role belongs to (drives team shape). */
export function lineOf(role: string): "GK" | "DEF" | "MID" | "FWD" {
  if (role === "GK") return "GK";
  if (["RB", "CB", "LB", "RWB", "LWB"].includes(role)) return "DEF";
  if (["RW", "LW", "ST", "CF"].includes(role)) return "FWD";
  return "MID";
}

/**
 * Assign classic positional numbers while guaranteeing uniqueness in the XI.
 * The numbers are visual/tactical identifiers, so changing formation updates
 * them without mutating a player's registered squad number in the save.
 */
export function assignTacticalNumbers(roles: string[]): number[] {
  const preferences: Record<string, number[]> = {
    GK: [1],
    RB: [2, 12], RWB: [2, 7, 12],
    LB: [3, 13], LWB: [3, 11, 13],
    CB: [4, 5, 6],
    CDM: [6, 4, 8], DM: [6, 4, 8],
    CM: [8, 6, 10],
    CAM: [10, 8, 7], AM: [10, 8, 7],
    RM: [7, 8, 11], RW: [7, 11, 10],
    LM: [11, 7, 10], LW: [11, 7, 10],
    ST: [9, 10, 11], CF: [10, 9, 11],
  };
  const used = new Set<number>();
  return roles.map((role) => {
    const choices = [...(preferences[role] ?? []), ...Array.from({ length: 18 }, (_, i) => i + 1)];
    const number = choices.find((n) => !used.has(n)) ?? used.size + 1;
    used.add(number);
    return number;
  });
}

/**
 * Contextual willingness to shoot. Normal players will try credible efforts
 * from 18–32m; "shoot more" raises that appetite out to 39m, never from the
 * halfway line. Conversion is resolved separately from actual attributes.
 */
export function shotDecisionProbability(
  player: Player,
  role: string,
  distanceM: number,
  mentality: MentalityLevel,
  style: PlayStyle,
  shootMore: boolean,
): number {
  const longQuality = (player.longShots + player.technique + player.decisions) / 60;
  let urge: number;
  if (distanceM < 15) {
    urge = 0.9;
  } else if (distanceM < 23) {
    urge = clamp(0.34 + (23 - distanceM) * 0.035 + (mentality - 3) * 0.04, 0.12, 0.82);
  } else if (distanceM < 31) {
    urge = clamp(0.065 + longQuality * 0.18 + (mentality - 3) * 0.018, 0.045, 0.28);
  } else if (distanceM < 36) {
    urge = clamp(0.012 + longQuality * 0.085 + (mentality - 3) * 0.01, 0.012, 0.13);
  } else {
    urge = 0.001;
  }

  if (shootMore && distanceM >= 18 && distanceM < 39) {
    urge = Math.max(urge, 0.16 + longQuality * 0.31);
  }
  if (style === PlayStyle.TikiTaka || style === PlayStyle.PossessionBased) urge *= shootMore ? 0.92 : 0.78;
  if (style === PlayStyle.LongBallDirect || style === PlayStyle.RouteOne) urge *= 1.1;
  if ((role === "CB" || role === "CDM") && !shootMore) urge *= 0.42;
  if (distanceM >= 39) urge = 0.001;
  return clamp(urge, 0.001, 0.92);
}

interface SetPiece {
  kind: "throw" | "goalKick" | "corner" | "freeKick";
  side: Side;
  x: number;
  y: number;
  timer: number;
  takerIdx: number;
}

export interface MatchSnapshot {
  gameTime: number;
  addedTime90: number;
  homeScore: number;
  awayScore: number;
  phase: Phase;
  ball: {
    x: number;
    y: number;
    height: number;
    airborne: boolean;
    mode: "controlled" | "flight" | "loose" | "dead";
  };
  homePositions: { x: number; y: number; speed: number; intent: PlayerIntent; movementPattern?: DribblePattern }[];
  awayPositions: { x: number; y: number; speed: number; intent: PlayerIntent; movementPattern?: DribblePattern }[];
  possession: Side | "loose";
  homeLineup: LineupEntry[];
  awayLineup: LineupEntry[];
  stats: MatchStats;
  events: MatchEvent[];
  ratings: Record<string, number>;
  /** Included at full time; omitted from live snapshots to keep worker messages small. */
  analysis?: MatchAnalysis;
}

export interface LineupEntry {
  playerId: string;
  shirtNumber: number;
  name: string;
  position: string;
  tacticalRole: PlayerRoleAssignment["role"];
  duty: PlayerRoleAssignment["duty"];
  rating: number;
  goals: number;
  yellow: boolean;
  sentOff: boolean;
  injured: boolean;
}

function emptyStats(): MatchStats {
  return {
    possessionHome: 0, shotsHome: 0, shotsOnTargetHome: 0,
    passesAttemptedHome: 0, passesCompletedHome: 0, tacklesHome: 0, foulsHome: 0, cornersHome: 0,
    carriesHome: 0, throwInsHome: 0, crossesHome: 0, throughBallsHome: 0,
    dribblesAttemptedHome: 0, dribblesCompletedHome: 0, knockOnsHome: 0,
    possessionAway: 0, shotsAway: 0, shotsOnTargetAway: 0,
    passesAttemptedAway: 0, passesCompletedAway: 0, tacklesAway: 0, foulsAway: 0, cornersAway: 0,
    carriesAway: 0, throwInsAway: 0, crossesAway: 0, throughBallsAway: 0,
    dribblesAttemptedAway: 0, dribblesCompletedAway: 0, knockOnsAway: 0,
  };
}

type KickoffReason = "start" | "half" | "restart";

interface GoalCelebration {
  side: Side;
  scorerIndex: number;
  targetX: number;
  targetY: number;
}

export class MatchSimulator {
  readonly home: TeamSide;
  readonly away: TeamSide;
  private rng: SeededRNG;
  private injuryRng: SeededRNG;
  private worldScale: number;
  private worldTime = 0;

  gameTime = 0;
  addedTime90 = 0;
  homeScore = 0;
  awayScore = 0;
  phase: Phase = "kickoff";
  isRunning = false;

  private homePlayers: SimPlayer[] = [];
  private awayPlayers: SimPlayer[] = [];
  private ball = { x: PITCH_W / 2, y: PITCH_H / 2 };
  private ballHeight = 0;
  private carrier: { side: Side; i: number } | null = null;
  /** World-time when the current player first controlled the ball. */
  private carrierSince = 0;
  /** Ball velocity between visible dribbling touches (pitch units / world second). */
  private controlledBallVelocity = { x: 0, y: 0 };
  private controlledBallTarget = { x: PITCH_W / 2, y: PITCH_H / 2 };
  private looseBallVelocity = { x: 0, y: 0 };
  private looseDribbleRace: { side: Side; idx: number; attempted: boolean } | null = null;
  private lastTouchSide: Side = "home";
  private flight: Flight | null = null;
  private setPiece: SetPiece | null = null;
  private celebration: GoalCelebration | null = null;
  private phaseTimer = 0;
  private decisionCd = 0;
  private looseLockSide: Side | null = null;
  private looseLockT = 0;
  private possessionSide: Side = "home";
  private lastPossessionChangeAt = 0;
  private assistWindow: { side: Side; playerId: string; t: number } | null = null;
  private lastTurnover: { side: Side; t: number } | null = null;
  private events: MatchEvent[] = [];
  private stats = emptyStats();
  private pendingState = false;
  private difficulty: Difficulty;
  private coachProfile: AICoachProfile;
  private aiNextReview: Record<Side, number> = { home: Infinity, away: Infinity };
  private telemetry = new Map<string, PlayerTelemetryRuntime>();
  private nextHeatmapSampleAt = 0;
  private tacticalChanges: TacticalChangeRecord[] = [];
  private injuries: MatchInjuryRecord[] = [];
  private nextInjuryCheckAt = 7 * 60;
  private tacticalEvents: TacticalEvent[] = [];
  private tacticalEventCounter = 0;
  private possessionId = 1;
  private sequenceIndex = 0;
  private pendingFlightEventId: string | null = null;
  private opponentPlans: Partial<Record<Side, OpponentMatchPlan>> = {};
  private opponentPlanChanges: OpponentPlanChangeRecord[] = [];
  private readonly fixtureId: string;
  private readonly initialFormations: Record<Side, string>;
  private readonly initialPlayStyles: Record<Side, PlayStyle>;
  /** Match-clock timestamp for throttled, inspectable instruction commentary. */
  private instructionCommentaryAt = new Map<string, number>();
  /** Avoid allocating a merged team/player object on every movement check. */
  private mergedDirectiveCache: Record<Side, Map<string, PlayerDirectives>> = {
    home: new Map(),
    away: new Map(),
  };
  private subsUsed: Record<Side, number> = { home: 0, away: 0 };
  private substitutedOut = new Set<string>();
  private stoppage = 0;
  private finished = false;
  private halftimeTaken = false;
  private concedingSide: Side | null = null;
  private penaltyState: { side: Side; timer: number; resolved: boolean; takerIdx: number } | null = null;

  onEvent: ((e: MatchEvent) => void) | null = null;
  onHalfTime: (() => void) | null = null;
  onFullTime: (() => void) | null = null;

  constructor(home: TeamSide, away: TeamSide, options: SimOptions) {
    this.home = home;
    this.away = away;
    this.rng = new SeededRNG(options.seed);
    this.injuryRng = new SeededRNG((options.seed ^ 0x49a71c) >>> 0);
    this.nextInjuryCheckAt = this.injuryRng.float(6, 12) * 60;
    this.worldScale = options.worldScale ?? 0.5;
    this.difficulty = options.difficulty ?? Difficulty.SemiPro;
    this.coachProfile = getAICoachProfile(this.difficulty);
    this.initialFormations = {
      home: home.tactics.formation,
      away: away.tactics.formation,
    };
    this.initialPlayStyles = {
      home: home.tactics.playStyle,
      away: away.tactics.playStyle,
    };

    this.homePlayers = this.buildPlayers(home);
    this.awayPlayers = this.buildPlayers(away);
    this.homePlayers.forEach((sp) => this.createTelemetry("home", sp, true));
    this.awayPlayers.forEach((sp) => this.createTelemetry("away", sp, true));
    this.fixtureId = options.fixtureId ?? home.opponentPlan?.fixtureId ?? away.opponentPlan?.fixtureId ?? `match-${options.seed}`;
    for (const side of ["home", "away"] as Side[]) {
      const team = this.team(side);
      const opposition = this.team(this.other(side));
      this.opponentPlans[side] = team.isUserTeam
        ? sanitizeOpponentMatchPlan(
            team.opponentPlan,
            this.fixtureId,
            [...team.starters, ...team.bench],
            [...opposition.starters, ...opposition.bench],
            "user",
          )
        : buildAIOpponentMatchPlan(
            this.fixtureId,
            team.starters.map((player, index) => ({ player, role: team.roles[index] ?? player.primaryPosition })),
            opposition.starters.map((player, index) => ({ player, role: opposition.roles[index] ?? player.primaryPosition })),
            this.difficulty,
            team.managerMemory,
          );
      const initialPlan = this.opponentPlans[side];
      if (initialPlan) {
        this.opponentPlanChanges.push({
          side,
          minute: 0,
          plan: { ...initialPlan, instructions: initialPlan.instructions.map((instruction) => ({ ...instruction })) },
        });
      }
    }
    if (!home.isUserTeam) this.aiNextReview.home = this.coachProfile.firstReviewMinute;
    if (!away.isUserTeam) this.aiNextReview.away = this.coachProfile.firstReviewMinute;

    this.stoppage = this.rng.int(90, 180);
    this.startKickoff("home", "start");
    this.isRunning = true;
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  private buildPlayers(side: TeamSide): SimPlayer[] {
    return side.starters.map((p, i) => {
      const base = side.basePositions[i] ?? { x: 500, y: 325 };
      return {
        p, x: base.x, y: base.y, tx: base.x, ty: base.y,
        vx: 0, vy: 0,
        brainTx: base.x, brainTy: base.y, brainNextAt: 0, intent: "hold", dribblePlan: null,
        nextTouchAt: 0, lastKnockOnAt: -Infinity,
        role: side.roles[i] ?? "CM",
        roleAssignment: resolvePlayerRoleAssignment(
          side.tactics.playerRoles?.[p.id],
          side.roles[i] ?? "CM",
          side.tactics.playStyle,
        ),
        number: side.displayNumbers[i] ?? p.shirtNumber,
        tackleCd: 0,
        runUntil: 0,
        energy: matchStartingEnergy(p),
        conditionBefore: playerCondition(p),
        rating: 6.5,
        sentOff: false,
        injured: false,
        yellow: false,
        goals: 0, assists: 0,
      };
    });
  }

  private createTelemetry(side: Side, sp: SimPlayer, started: boolean): PlayerTelemetryRuntime {
    const minute = Math.max(0, Math.floor(this.gameTime / 60));
    const runtime: PlayerTelemetryRuntime = {
      active: true,
      secondsPlayed: 0,
      sprinting: false,
      data: {
        playerId: sp.p.id,
        clubId: this.team(side).clubId,
        side,
        playerName: `${sp.p.firstName} ${sp.p.lastName}`,
        shirtNumber: sp.number,
        position: sp.role,
        tacticalRole: sp.roleAssignment.role,
        duty: sp.roleAssignment.duty,
        started,
        minuteOn: started ? 0 : minute,
        minuteOff: minute,
        minutesPlayed: 0,
        rating: 6.5,
        conditionBefore: sp.conditionBefore,
        conditionAfter: sp.conditionBefore,
        touches: 0,
        carries: 0,
        passesAttempted: 0,
        passesCompleted: 0,
        passesFailed: 0,
        keyPasses: 0,
        throughBalls: 0,
        crossesAttempted: 0,
        crossesCompleted: 0,
        shots: 0,
        shotsOnTarget: 0,
        goals: 0,
        assists: 0,
        dribblesAttempted: 0,
        dribblesCompleted: 0,
        possessionLost: 0,
        tacklesAttempted: 0,
        tacklesWon: 0,
        interceptions: 0,
        recoveries: 0,
        clearances: 0,
        blocks: 0,
        aerialDuels: 0,
        aerialDuelsWon: 0,
        foulsCommitted: 0,
        foulsWon: 0,
        offsides: 0,
        saves: 0,
        yellowCards: 0,
        redCards: 0,
        distanceCoveredKm: 0,
        sprints: 0,
        heatmap: Array(MATCH_HEATMAP_COLUMNS * MATCH_HEATMAP_ROWS).fill(0),
      },
    };
    this.telemetry.set(sp.p.id, runtime);
    return runtime;
  }

  private playerTelemetry(playerId: string | undefined): PlayerTelemetryRuntime | undefined {
    return playerId ? this.telemetry.get(playerId) : undefined;
  }

  private addPlayerStat(playerId: string | undefined, key: keyof PlayerMatchAnalysis, amount = 1): void {
    const runtime = this.playerTelemetry(playerId);
    if (!runtime) return;
    const numeric = runtime.data as unknown as Record<string, number>;
    numeric[key] = (numeric[key] ?? 0) + amount;
  }

  private syncTelemetry(sp: SimPlayer, deactivate = false): void {
    const runtime = this.playerTelemetry(sp.p.id);
    if (!runtime) return;
    runtime.data.rating = Number(clamp(sp.rating, 1, 10).toFixed(1));
    runtime.data.goals = sp.goals;
    runtime.data.assists = sp.assists;
    runtime.data.yellowCards = sp.yellow ? 1 : 0;
    runtime.data.redCards = sp.sentOff && !sp.injured ? 1 : 0;
    runtime.data.position = sp.role;
    runtime.data.tacticalRole = sp.roleAssignment.role;
    runtime.data.duty = sp.roleAssignment.duty;
    if (runtime.active || deactivate) {
      runtime.data.minuteOff = Math.max(runtime.data.minuteOn, Math.floor(this.gameTime / 60));
      runtime.data.minutesPlayed = Math.max(1, Math.round(runtime.secondsPlayed / 60));
    }
    runtime.data.conditionAfter = postMatchCondition(
      sp.conditionBefore,
      runtime.data.minutesPlayed,
      runtime.data.distanceCoveredKm,
      runtime.data.sprints,
      sp.p.naturalFitness,
    );
    if (deactivate) runtime.active = false;
  }

  private tickTelemetry(dtClock: number): void {
    for (const side of ["home", "away"] as Side[]) {
      for (const sp of this.players(side)) {
        const runtime = this.playerTelemetry(sp.p.id);
        if (!runtime || !runtime.active) continue;
        runtime.secondsPlayed += dtClock;
        const speed = Math.hypot(sp.vx, sp.vy) / UNITS_PER_METER;
        runtime.data.distanceCoveredKm += (speed * dtClock) / 1000;
        const sprintingNow = speed >= 6.35;
        if (sprintingNow && !runtime.sprinting) runtime.data.sprints += 1;
        runtime.sprinting = sprintingNow;
        this.syncTelemetry(sp);
        if (sp.sentOff) this.syncTelemetry(sp, true);
      }
    }

    if (this.gameTime < this.nextHeatmapSampleAt) return;
    this.nextHeatmapSampleAt = this.gameTime + 30;
    for (const side of ["home", "away"] as Side[]) {
      for (const sp of this.players(side)) {
        const runtime = this.playerTelemetry(sp.p.id);
        if (!runtime?.active || sp.sentOff) continue;
        const viewedX = side === "home" ? sp.x : PITCH_W - sp.x;
        const col = clamp(Math.floor((viewedX / PITCH_W) * MATCH_HEATMAP_COLUMNS), 0, MATCH_HEATMAP_COLUMNS - 1);
        const row = clamp(Math.floor((sp.y / PITCH_H) * MATCH_HEATMAP_ROWS), 0, MATCH_HEATMAP_ROWS - 1);
        runtime.data.heatmap[row * MATCH_HEATMAP_COLUMNS + col] += 1;
      }
    }
  }

  getAnalysis(): MatchAnalysis {
    for (const side of ["home", "away"] as Side[]) {
      for (const sp of this.players(side)) this.syncTelemetry(sp);
    }
    const players: Record<string, PlayerMatchAnalysis> = {};
    for (const [playerId, runtime] of this.telemetry) {
      const data = runtime.data;
      players[playerId] = {
        ...data,
        passesFailed: Math.max(0, data.passesAttempted - data.passesCompleted),
        distanceCoveredKm: Number(data.distanceCoveredKm.toFixed(2)),
        heatmap: [...data.heatmap],
      };
    }
    const tacticalEvents = this.tacticalEvents.map((event) => ({
      ...event,
      outcome: event.outcome === "attempted" ? "failed" as const : event.outcome,
    }));
    const tacticalAnalytics = buildTacticalAnalytics(tacticalEvents);
    return {
      schemaVersion: 2,
      heatmapColumns: MATCH_HEATMAP_COLUMNS,
      heatmapRows: MATCH_HEATMAP_ROWS,
      generatedAtMinute: Math.floor(this.gameTime / 60),
      initialHomeFormation: this.initialFormations.home,
      initialAwayFormation: this.initialFormations.away,
      finalHomeFormation: this.home.tactics.formation,
      finalAwayFormation: this.away.tactics.formation,
      players,
      tacticalChanges: this.tacticalChanges.map((change) => ({ ...change, changes: [...change.changes] })),
      tacticalEvents,
      teamSummaries: tacticalAnalytics.teamSummaries,
      passNetworks: tacticalAnalytics.passNetworks,
      injuries: this.injuries.map((injury) => ({ ...injury })),
      initialHomePlayStyle: this.initialPlayStyles.home,
      initialAwayPlayStyle: this.initialPlayStyles.away,
      finalHomePlayStyle: this.home.tactics.playStyle,
      finalAwayPlayStyle: this.away.tactics.playStyle,
      opponentPlans: {
        home: this.opponentPlans.home
          ? { ...this.opponentPlans.home, instructions: this.opponentPlans.home.instructions.map((instruction) => ({ ...instruction })) }
          : undefined,
        away: this.opponentPlans.away
          ? { ...this.opponentPlans.away, instructions: this.opponentPlans.away.instructions.map((instruction) => ({ ...instruction })) }
          : undefined,
      },
      opponentPlanChanges: this.opponentPlanChanges.map((change) => ({
        ...change,
        plan: { ...change.plan, instructions: change.plan.instructions.map((instruction) => ({ ...instruction })) },
      })),
    };
  }

  private orientedPoint(side: Side, x: number, y: number): { x: number; y: number } {
    return side === "home"
      ? { x: Math.round(x), y: Math.round(y) }
      : { x: Math.round(PITCH_W - x), y: Math.round(PITCH_H - y) };
  }

  private tacticalPhaseFor(side: Side, x: number): TacticalMatchPhase {
    if (this.setPiece || this.penaltyState || this.phase === "setpiece" || this.phase === "penalty") return "setPiece";
    if (this.lastTurnover && this.lastTurnover.side === side && this.worldTime - this.lastTurnover.t < 6) return "counterAttack";
    if (this.possessionSide !== side) return "defensiveTransition";
    const viewed = this.orientedPoint(side, x, PITCH_H / 2).x;
    return viewed < 390 ? "buildUp" : "settledAttack";
  }

  private recordTacticalEvent(input: {
    side: Side;
    type: TacticalEventType;
    outcome?: TacticalEventOutcome;
    playerId?: string;
    relatedPlayerId?: string;
    x: number;
    y: number;
    endX?: number;
    endY?: number;
    pressure?: number;
    qualifier?: string;
    expectedGoals?: number;
  }): string {
    const start = this.orientedPoint(input.side, input.x, input.y);
    const end = input.endX !== undefined && input.endY !== undefined
      ? this.orientedPoint(input.side, input.endX, input.endY)
      : undefined;
    const id = `te-${++this.tacticalEventCounter}`;
    this.sequenceIndex += 1;
    this.tacticalEvents.push({
      id,
      second: Number(this.gameTime.toFixed(1)),
      minute: Math.floor(this.gameTime / 60),
      side: input.side,
      clubId: this.team(input.side).clubId,
      type: input.type,
      outcome: input.outcome ?? "attempted",
      playerId: input.playerId,
      relatedPlayerId: input.relatedPlayerId,
      x: start.x,
      y: start.y,
      endX: end?.x,
      endY: end?.y,
      pressure: Number(clamp(input.pressure ?? 0, 0, 1).toFixed(2)),
      phase: this.tacticalPhaseFor(input.side, input.x),
      possessionId: this.possessionId,
      sequenceIndex: this.sequenceIndex,
      qualifier: input.qualifier,
      expectedGoals: input.expectedGoals,
    });
    // A full match normally stays well below this, but malformed custom loops
    // must not make a career save grow without limit.
    if (this.tacticalEvents.length > 3000) this.tacticalEvents.shift();
    return id;
  }

  private updateTacticalEvent(
    id: string | undefined | null,
    outcome: TacticalEventOutcome,
    relatedPlayerId?: string,
  ): void {
    if (!id) return;
    const event = this.tacticalEvents.find((candidate) => candidate.id === id);
    if (!event) return;
    event.outcome = outcome;
    if (relatedPlayerId) event.relatedPlayerId = relatedPlayerId;
  }

  private finalizePendingFlight(receivingSide: Side, receiverId?: string): void {
    if (!this.pendingFlightEventId) return;
    const event = this.tacticalEvents.find((candidate) => candidate.id === this.pendingFlightEventId);
    this.pendingFlightEventId = null;
    if (!event) return;
    const retained = event.side === receivingSide;
    event.outcome = event.type === "dribble"
      ? retained ? "won" : "lost"
      : retained ? "complete" : "failed";
    if (receiverId && retained) event.relatedPlayerId = receiverId;
  }

  private players(side: Side): SimPlayer[] {
    return side === "home" ? this.homePlayers : this.awayPlayers;
  }

  private other(side: Side): Side {
    return side === "home" ? "away" : "home";
  }

  private attackDir(side: Side): 1 | -1 {
    return side === "home" ? 1 : -1;
  }

  private goalX(side: Side): number {
    return side === "home" ? PITCH_W : 0;
  }

  private ownGoalX(side: Side): number {
    return side === "home" ? 0 : PITCH_W;
  }

  private team(side: Side): TeamSide {
    return side === "home" ? this.home : this.away;
  }

  private directives(side: Side, sp: SimPlayer): PlayerDirectives {
    const cached = this.mergedDirectiveCache[side].get(sp.p.id);
    if (cached) return cached;
    const team = this.team(side);
    const roleDirectives = directivesForPlayerRole(sp.roleAssignment, sp.role);
    const teamPlan = mergeDirectives(roleDirectives, team.teamDirectives);
    const individual = team.directives?.[sp.p.id];
    const directives = individual ? mergeDirectives(teamPlan, individual) : teamPlan;
    this.mergedDirectiveCache[side].set(sp.p.id, directives);
    return directives;
  }

  /** Seconds since this side last won possession (Infinity if no recent turnover). */
  private transitionAge(side: Side): number {
    return this.lastTurnover?.side === side ? this.worldTime - this.lastTurnover.t : Infinity;
  }

  private carryPhase(side: Side, sp: SimPlayer): CarryPhase {
    if (this.transitionAge(side) < 6) return "transition";
    const viewedX = side === "home" ? sp.x : PITCH_W - sp.x;
    if (viewedX < 360) return "buildUp";
    if (viewedX > 690) return "finish";
    return "create";
  }

  private chooseCarrierRoute(side: Side, sp: SimPlayer, beatenOpponentId?: string): DribbleRoute {
    const targeted = beatenOpponentId
      ? undefined
      : this.attackingPlanNear(side, sp.x, sp.y, ["pace", "dribble"]);
    const activeTarget = targeted && targeted.distance < 210 ? targeted : undefined;
    return chooseDribbleRoute({
      player: sp.p,
      role: sp.role,
      tacticalRole: sp.roleAssignment.role,
      current: { x: sp.x, y: sp.y },
      velocity: { x: sp.vx, y: sp.vy },
      opponents: this.players(this.other(side))
        .filter((opponent) => !opponent.sentOff)
        .map((opponent) => ({
          id: opponent.p.id,
          x: opponent.x,
          y: opponent.y,
          pace: opponent.p.pace,
          acceleration: opponent.p.acceleration,
          anticipation: opponent.p.anticipation,
        })),
      teammates: this.players(side)
        .filter((teammate) => teammate !== sp && !teammate.sentOff)
        .map((teammate) => ({ x: teammate.x, y: teammate.y })),
      attackingDirection: this.attackDir(side),
      pressure: this.pressureOn(side, this.indexOfPlayer(side, sp)),
      phase: this.carryPhase(side, sp),
      style: this.team(side).tactics.playStyle,
      instructions: this.directives(side, sp),
      beatenOpponentId,
      targetOpponentId: activeTarget?.target.p.id,
      targetApproach: activeTarget?.instruction.attackApproach === "pace" || activeTarget?.instruction.attackApproach === "dribble"
        ? activeTarget.instruction.attackApproach
        : undefined,
    });
  }

  private installDribblePlan(
    side: Side,
    sp: SimPlayer,
    beatenOpponentId?: string,
    route = this.chooseCarrierRoute(side, sp, beatenOpponentId),
  ): ActiveDribblePlan {
    const active: ActiveDribblePlan = {
      ...route,
      waypoints: route.waypoints.map((point) => ({ ...point })),
      waypointIndex: 0,
      startedAt: this.worldTime,
      expiresAt: this.worldTime + route.durationSeconds,
    };
    sp.dribblePlan = active;
    sp.intent = "carry";
    return active;
  }

  private currentDribbleTarget(side: Side, sp: SimPlayer, pressure: number): { plan: ActiveDribblePlan; point: { x: number; y: number } } {
    let plan = sp.dribblePlan;
    if (
      !plan || this.worldTime >= plan.expiresAt ||
      (pressure > 0.68 && plan.pitchControl < 0.48 &&
       plan.pattern !== "escapeTurn" && this.worldTime - plan.startedAt > 0.3)
    ) {
      plan = this.installDribblePlan(side, sp);
    }

    while (
      plan.waypointIndex < plan.waypoints.length &&
      Math.hypot(sp.x - plan.waypoints[plan.waypointIndex].x, sp.y - plan.waypoints[plan.waypointIndex].y) < 13
    ) {
      plan.waypointIndex += 1;
    }
    if (plan.waypointIndex >= plan.waypoints.length) plan = this.installDribblePlan(side, sp);
    return { plan, point: plan.waypoints[plan.waypointIndex] };
  }

  private movementQualifier(route: DribbleRoute): string {
    return `movement:${route.pattern};control:${route.pitchControl.toFixed(2)};value:${route.possessionValueGain.toFixed(2)}`;
  }

  /** Apply tactical changes immediately without restarting the match. */
  updateTactics(side: Side, tactics: TacticalSetup, reason?: string): void {
    const team = this.team(side);
    const before = team.tactics;
    const changed: string[] = [];
    const labels: [keyof TacticalSetup, string][] = [
      ["formation", "Formation"], ["playStyle", "Style"], ["mentality", "Mentality"],
      ["tempo", "Tempo"], ["passingLength", "Passing length"], ["defensiveLine", "Defensive line"],
      ["pressing", "Pressing"], ["width", "Width"], ["timeWasting", "Time wasting"],
      ["counterAttack", "Counter attack"], ["offsideTrap", "Offside trap"],
    ];
    for (const [key, label] of labels) {
      if (before[key] !== tactics[key]) changed.push(`${label}: ${String(before[key])} → ${String(tactics[key])}`);
    }
    team.tactics = {
      ...tactics,
      playerRoles: { ...(tactics.playerRoles ?? {}) },
      positionOverrides: { ...tactics.positionOverrides },
    };
    const formation = getFormation(tactics.formation);
    const slots = side === "home" ? formation.positions : mirrorFormation(formation).positions;
    const players = this.players(side);

    // Reassign the current XI to new slots by positional suitability while
    // preserving array/player identity (the renderer's shirt dots stay bound
    // to the same footballer). A formation switch therefore does not put a
    // centre-back at striker merely because both occupied index 3.
    const freePlayers = new Set(players.map((_, i) => i));
    const slotForPlayer = new Map<number, (typeof slots)[number]>();
    const roleChanges: string[] = [];
    const orderedSlots = [...slots].sort((a, b) => (a.role === "GK" ? -1 : b.role === "GK" ? 1 : 0));
    for (const slot of orderedSlots) {
      let bestIdx = -1;
      let best = -Infinity;
      for (const i of freePlayers) {
        const score = roleFitScore(players[i].p, slot.role);
        if (score > best) { best = score; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        freePlayers.delete(bestIdx);
        slotForPlayer.set(bestIdx, slot);
      }
    }
    players.forEach((sp, i) => {
      const slot = slotForPlayer.get(i) ?? slots[i];
      if (!slot) return;
      const previousAssignment = sp.roleAssignment;
      sp.role = slot.role;
      sp.roleAssignment = resolvePlayerRoleAssignment(
        tactics.playerRoles?.[sp.p.id],
        slot.role,
        tactics.playStyle,
      );
      if (
        previousAssignment.role !== sp.roleAssignment.role ||
        previousAssignment.duty !== sp.roleAssignment.duty
      ) {
        roleChanges.push(`${sp.p.lastName}: ${playerRoleLabel(sp.roleAssignment)}`);
      }
      const override = tactics.positionOverrides[sp.p.id];
      const base = override
        ? { x: side === "home" ? override.x : PITCH_W - override.x, y: override.y }
        : { x: slot.baseX, y: slot.baseY };
      team.roles[i] = slot.role;
      team.basePositions[i] = base;
      const tracked = this.playerTelemetry(sp.p.id);
      if (tracked) {
        tracked.data.position = slot.role;
        tracked.data.tacticalRole = sp.roleAssignment.role;
        tracked.data.duty = sp.roleAssignment.duty;
      }
    });
    if (roleChanges.length > 0) {
      changed.push(...roleChanges.slice(0, 4));
      if (roleChanges.length > 4) changed.push(`+${roleChanges.length - 4} more role changes`);
    }
    this.mergedDirectiveCache[side].clear();
    // Keep match numbers stable after kickoff so the manager can always track
    // the same player, even if their role changes with a formation switch.
    if (changed.length > 0) {
      this.tacticalChanges.push({
        side,
        clubId: team.clubId,
        minute: Math.floor(this.gameTime / 60),
        source: team.isUserTeam ? "user" : "ai",
        reason: reason ?? (team.isUserTeam ? "Live manager adjustment" : "Opposition coach adjustment"),
        formationBefore: before.formation,
        formationAfter: tactics.formation,
        changes: changed,
      });
    }
    this.pendingState = true;
  }

  /** Apply an exact-opponent match plan immediately during a live match. */
  updateOpponentPlan(side: Side, plan: OpponentMatchPlan): void {
    const team = this.team(side);
    const opposition = this.team(this.other(side));
    const previous = this.opponentPlans[side];
    const before = previous?.instructions ?? [];
    const sanitized = sanitizeOpponentMatchPlan(
      plan,
      this.fixtureId,
      [...team.starters, ...team.bench],
      [...opposition.starters, ...opposition.bench],
      team.isUserTeam ? "user" : "ai",
    );
    if (previous && JSON.stringify(previous.instructions) === JSON.stringify(sanitized.instructions)) return;
    this.opponentPlans[side] = sanitized;
    const minute = Math.floor(this.gameTime / 60);
    this.opponentPlanChanges.push({
      side,
      minute,
      plan: { ...sanitized, instructions: sanitized.instructions.map((instruction) => ({ ...instruction })) },
    });
    this.tacticalChanges.push({
      side,
      clubId: team.clubId,
      minute,
      source: team.isUserTeam ? "user" : "ai",
      reason: "Opponent-specific match plan updated",
      formationBefore: team.tactics.formation,
      formationAfter: team.tactics.formation,
      changes: [
        `${before.length} → ${sanitized.instructions.length} targeted assignments`,
        ...sanitized.instructions.slice(0, 3).map((instruction) => `Plan against ${instruction.targetPlayerName}`),
      ],
    });
    this.pendingState = true;
  }

  private planAgainst(side: Side, targetPlayerId: string | undefined): OpponentPlayerPlan | undefined {
    return targetPlayerId
      ? this.opponentPlans[side]?.instructions.find((instruction) => instruction.targetPlayerId === targetPlayerId)
      : undefined;
  }

  private planForMarker(side: Side, markerPlayerId: string): OpponentPlayerPlan | undefined {
    return this.opponentPlans[side]?.instructions.find((instruction) => instruction.markerPlayerId === markerPlayerId);
  }

  private attackingPlanNear(
    side: Side,
    x: number,
    y: number,
    approaches?: readonly MatchPlanAttackApproach[],
  ): { instruction: OpponentPlayerPlan; target: SimPlayer; distance: number } | undefined {
    let best: { instruction: OpponentPlayerPlan; target: SimPlayer; distance: number } | undefined;
    for (const instruction of this.opponentPlans[side]?.instructions ?? []) {
      if (instruction.attackApproach === "none" || (approaches && !approaches.includes(instruction.attackApproach))) continue;
      const target = this.players(this.other(side)).find(
        (opponent) => opponent.p.id === instruction.targetPlayerId && !opponent.sentOff,
      );
      if (!target) continue;
      const distance = Math.hypot(target.x - x, target.y - y);
      if (!best || distance < best.distance) best = { instruction, target, distance };
    }
    return best;
  }

  /** Update validated natural-language plans during a live match. */
  updateDirectives(
    side: Side,
    directives: Record<string, PlayerDirectives>,
    teamDirectives?: PlayerDirectives,
  ): void {
    const team = this.team(side);
    team.directives = directives;
    team.teamDirectives = teamDirectives;
    this.mergedDirectiveCache[side].clear();
    if (this.carrier?.side === side) {
      const carrier = this.players(side)[this.carrier.i];
      if (carrier && this.shouldClearImmediately(side, carrier)) this.decisionCd = 0;
    }
    this.pendingState = true;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  start(): void {
    this.isRunning = true;
  }

  pause(): void {
    this.isRunning = false;
  }

  resume(): void {
    if (this.phase === "halftime") {
      this.gameTime = 2700;
      this.startKickoff("away", "half");
    }
    if (this.phase === "fulltime") return;
    this.isRunning = true;
  }

  /** Advance one simulation step. dtReal in seconds (typically 0.1). */
  tick(dtReal: number): void {
    if (!this.isRunning || this.finished) return;
    if (this.phase === "halftime" || this.phase === "fulltime") return;

    // Match pace is fixed: regulation advances at eight real minutes per half.
    // The independent world clock preserves realistic movement/action density.
    const dtClock = dtReal * MATCH_TIME_SCALE;
    const dtWorld = dtReal * this.worldScale;
    this.gameTime += dtClock;
    this.worldTime += dtWorld;
    this.tickTelemetry(dtClock);

    // ---- added time at 90'
    if (this.gameTime >= 5400 && this.addedTime90 === 0) {
      this.addedTime90 = this.stoppage;
    }
    if (this.addedTime90 > 0 && this.gameTime >= 5400 + this.addedTime90 && this.phase !== "celebration") {
      this.gameTime = 5400 + this.addedTime90;
      this.finishMatch();
      return;
    }

    // ---- half time
    if (this.gameTime >= 2700 && !this.halftimeTaken && this.gameTime < 5400) {
      this.halftimeTaken = true;
      this.gameTime = 2700;
      this.phase = "halftime";
      this.isRunning = false;
      this.pushEvent(MatchEventType.HalfTime, undefined, undefined, "Half time");
      this.onHalfTime?.();
      return;
    }

    this.phaseTimer -= dtWorld;
    this.decisionCd -= dtWorld;
    for (const sp of [...this.homePlayers, ...this.awayPlayers]) sp.tackleCd -= dtWorld;
    this.looseLockT -= dtWorld;
    if (this.looseLockT <= 0) this.looseLockSide = null;

    switch (this.phase) {
      case "kickoff":
        this.tickKickoff(dtWorld);
        break;
      case "celebration":
        this.tickCelebration(dtWorld);
        break;
      case "setpiece":
        this.tickSetPiece(dtWorld);
        this.tickMovement(dtWorld, false);
        break;
      case "penalty":
        this.tickPenalty(dtWorld);
        this.tickMovement(dtWorld, false);
        break;
      case "flight":
        this.tickFlight(dtWorld);
        this.tickPossessionStat();
        this.tickMovement(dtWorld, false);
        break;
      case "open":
        this.tickOpen(dtWorld);
        this.tickMovement(dtWorld, false);
        break;
      default:
        this.tickMovement(dtWorld, false);
    }

    this.tickInjuries();
    this.tickAIManager();
    this.pendingState = true;
  }

  private tickInjuries(): void {
    if (this.gameTime < this.nextInjuryCheckAt || this.gameTime >= 5340) return;
    this.nextInjuryCheckAt = this.gameTime + this.injuryRng.float(8, 15) * 60;
    const candidates = (["home", "away"] as Side[]).flatMap((side) =>
      this.players(side)
        .map((player, idx) => ({ side, player, idx }))
        .filter(({ player }) => !player.sentOff),
    );
    if (candidates.length === 0) return;
    const averageRisk = candidates.reduce((sum, { player }) => {
      const conditionRisk = Math.max(0, 80 - player.conditionBefore) * 0.0012;
      const fatigueRisk = Math.max(0, 0.82 - player.energy) * 0.18;
      const ageRisk = Math.max(0, player.p.age - 30) * 0.002;
      return sum + 0.035 + conditionRisk + fatigueRisk + ageRisk;
    }, 0) / candidates.length;
    if (!this.injuryRng.chance(clamp(averageRisk, 0.025, 0.14))) return;

    const selected = this.injuryRng.weighted(candidates.map((candidate) => {
      const { player } = candidate;
      const vulnerability = 1 + Math.max(0, 82 - player.conditionBefore) * 0.06 +
        Math.max(0, 0.86 - player.energy) * 7 + Math.max(0, player.p.age - 29) * 0.08;
      return [candidate, vulnerability] as [typeof candidate, number];
    }));
    const rolled = rollMatchInjury(selected.player.p, this.injuryRng);
    const team = this.team(selected.side);
    this.injuries.push({
      ...rolled,
      clubId: team.clubId,
      side: selected.side,
      minute: Math.floor(this.gameTime / 60),
    });
    selected.player.injured = true;
    selected.player.sentOff = true;
    selected.player.energy = Math.min(selected.player.energy, 0.55);
    selected.player.vx = 0;
    selected.player.vy = 0;
    this.syncTelemetry(selected.player, true);
    if (this.carrier?.side === selected.side && this.carrier.i === selected.idx) {
      this.carrier = null;
      this.looseBallVelocity = { x: 0, y: 0 };
    }
    this.stoppage += this.injuryRng.int(35, 100);
    this.pushEvent(
      MatchEventType.Injury,
      team.clubId,
      selected.player.p.id,
      `${selected.player.p.firstName} ${selected.player.p.lastName} has suffered a ${rolled.name.toLowerCase()}`,
    );

    if (!team.isUserTeam && this.subsUsed[selected.side] < 5) {
      const benchIndex = team.bench
        .map((player, idx) => ({ player, idx, score: roleFitScore(player, selected.player.role) }))
        .filter(({ player }) => isPlayerAvailable(player) && !this.players(selected.side).some((active) => active.p.id === player.id))
        .sort((a, b) => b.score - a.score)[0]?.idx;
      if (benchIndex !== undefined) this.substitute(selected.side, selected.idx, benchIndex);
    }
  }

  private finishMatch(): void {
    this.phase = "fulltime";
    this.isRunning = false;
    this.finished = true;
    this.pushEvent(MatchEventType.FullTime, undefined, undefined, "Full time");
    this.onFullTime?.();
  }

  /** Fast-forward to the next stop (half/full time) without real-time pacing. */
  skipToStop(): void {
    this.isRunning = true;
    let guard = 0;
    while (
      this.phase !== "halftime" &&
      this.phase !== "fulltime" &&
      !this.finished &&
      guard++ < 120000
    ) {
      this.tick(0.1);
    }
  }

  hasNewState(): boolean {
    const p = this.pendingState;
    this.pendingState = false;
    return p;
  }

  getState(): MatchSnapshot {
    return {
      gameTime: this.gameTime,
      addedTime90: this.addedTime90,
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      phase: this.phase,
      ball: {
        ...this.ball,
        height: this.ballHeight,
        airborne: this.ballHeight > 7,
        mode: this.flight ? "flight" : this.carrier ? "controlled" : this.phase === "open" ? "loose" : "dead",
      },
      homePositions: this.homePlayers.map((p) => ({
        x: p.x,
        y: p.y,
        speed: Math.hypot(p.vx, p.vy) / UNITS_PER_METER,
        intent: p.intent,
        movementPattern: p.dribblePlan?.pattern,
      })),
      awayPositions: this.awayPlayers.map((p) => ({
        x: p.x,
        y: p.y,
        speed: Math.hypot(p.vx, p.vy) / UNITS_PER_METER,
        intent: p.intent,
        movementPattern: p.dribblePlan?.pattern,
      })),
      possession: this.carrier
        ? this.carrier.side
        : this.flight
          ? this.flight.side
          : this.phase === "open" || this.phase === "setpiece"
            ? this.possessionSide
            : "loose",
      homeLineup: this.lineup(this.homePlayers),
      awayLineup: this.lineup(this.awayPlayers),
      stats: this.getStats(),
      events: [...this.events],
      ratings: this.getRatings(),
      analysis: this.phase === "fulltime" ? this.getAnalysis() : undefined,
    };
  }

  private lineup(players: SimPlayer[]): LineupEntry[] {
    return players.map((sp) => ({
      playerId: sp.p.id,
      shirtNumber: sp.number,
      name: `${sp.p.firstName} ${sp.p.lastName}`,
      position: sp.role,
      tacticalRole: sp.roleAssignment.role,
      duty: sp.roleAssignment.duty,
      rating: Number(sp.rating.toFixed(1)),
      goals: sp.goals,
      yellow: sp.yellow,
      sentOff: sp.sentOff && !sp.injured,
      injured: sp.injured,
    }));
  }

  private getRatings(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const sp of [...this.homePlayers, ...this.awayPlayers]) {
      this.syncTelemetry(sp);
      out[sp.p.id] = Number(clamp(sp.rating, 1, 10).toFixed(1));
    }
    return out;
  }

  getStats(): MatchStats {
    const s = { ...this.stats };
    const total = s.possessionHome + s.possessionAway;
    s.possessionHome = total > 0 ? Math.round((s.possessionHome / total) * 100) : 50;
    s.possessionAway = 100 - s.possessionHome;
    return s;
  }

  getEvents(): MatchEvent[] {
    return [...this.events];
  }

  /** User/AI substitution. starterIdx indexes the starting XI. */
  substitute(side: Side, starterIdx: number, benchIdx: number): boolean {
    if (this.subsUsed[side] >= 5) return false;
    const team = side === "home" ? this.home : this.away;
    const players = this.players(side);
    const target = players[starterIdx];
    const benchPlayer = team.bench[benchIdx];
    if (!target || !benchPlayer) return false;
    if (target.sentOff && !target.injured) return false;
    if (!isPlayerAvailable(benchPlayer)) return false;
    if (this.substitutedOut.has(benchPlayer.id)) return false;
    if (players.some((sp) => sp.p.id === benchPlayer.id)) return false;

    const outgoingId = target.p.id;
    this.substitutedOut.add(outgoingId);
    this.syncTelemetry(target, true);
    target.p = benchPlayer;
    target.roleAssignment = resolvePlayerRoleAssignment(
      team.tactics.playerRoles?.[benchPlayer.id],
      target.role,
      team.tactics.playStyle,
    );
    this.mergedDirectiveCache[side].delete(outgoingId);
    this.mergedDirectiveCache[side].delete(benchPlayer.id);
    target.rating = 6.5;
    target.conditionBefore = playerCondition(benchPlayer);
    target.energy = matchStartingEnergy(benchPlayer);
    target.runUntil = 0;
    target.dribblePlan = null;
    target.vx = 0;
    target.vy = 0;
    target.brainNextAt = this.worldTime;
    target.nextTouchAt = this.worldTime;
    target.lastKnockOnAt = -Infinity;
    target.sentOff = false;
    target.injured = false;
    target.yellow = false;
    target.goals = 0;
    target.assists = 0;
    this.createTelemetry(side, target, false);
    this.subsUsed[side] += 1;
    this.tacticalChanges.push({
      side,
      clubId: team.clubId,
      minute: Math.floor(this.gameTime / 60),
      source: team.isUserTeam ? "user" : "ai",
      reason: team.isUserTeam ? "Manager substitution" : "Coach reacted with fresh legs",
      formationBefore: team.tactics.formation,
      formationAfter: team.tactics.formation,
      changes: [
        `${this.telemetry.get(outgoingId)?.data.playerName ?? "Player"} off`,
        `${benchPlayer.firstName} ${benchPlayer.lastName} on as ${playerRoleLabel(target.roleAssignment)}`,
      ],
      playerOffId: outgoingId,
      playerOnId: benchPlayer.id,
    });
    this.pushEvent(
      MatchEventType.Substitution,
      team.clubId,
      benchPlayer.id,
      `${team.shortName}: ${benchPlayer.firstName} ${benchPlayer.lastName} is on`,
    );
    // An AI coach reassigns exact markers/targets when either lineup changes;
    // it uses the same validated plan path as the live user controls.
    for (const coachSide of [side, this.other(side)] as Side[]) {
      if (!this.team(coachSide).isUserTeam) this.refreshAIOpponentPlan(coachSide);
    }
    this.pendingState = true;
    return true;
  }

  // -------------------------------------------------------------------------
  // Phases
  // -------------------------------------------------------------------------

  private startKickoff(side: Side, reason: KickoffReason): void {
    this.phase = "kickoff";
    this.phaseTimer = 1.6;
    this.possessionSide = side;
    if (reason !== "start") this.possessionId += 1;
    this.sequenceIndex = 0;
    this.pendingFlightEventId = null;
    this.carrier = null;
    this.flight = null;
    this.setPiece = null;
    this.celebration = null;
    this.penaltyState = null;
    this.ball = { x: PITCH_W / 2, y: PITCH_H / 2 };
    this.ballHeight = 0;
    this.resetShapes();

    const players = this.players(side);
    let best = 0;
    let bestDist = Infinity;
    players.forEach((sp, i) => {
      if (sp.sentOff) return;
      const d = Math.abs(sp.x - PITCH_W / 2) + Math.abs(sp.y - PITCH_H / 2);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    this.carrier = { side, i: best };
    this.carrierSince = this.worldTime;
    const kp = players[best];
    if (kp) {
      this.ball.x = kp.x;
      this.ball.y = kp.y;
    }

    if (reason === "start") {
      this.pushEvent(MatchEventType.KickOff, undefined, undefined, "Kick off!");
    } else if (reason === "half") {
      this.pushEvent(MatchEventType.KickOff, undefined, undefined, "Second half under way");
    }
  }

  private resetShapes(): void {
    for (const side of ["home", "away"] as Side[]) {
      const team = side === "home" ? this.home : this.away;
      this.players(side).forEach((sp, i) => {
        const base = team.basePositions[i] ?? { x: 500, y: 325 };
        sp.x = base.x;
        sp.y = base.y;
        sp.tx = base.x;
        sp.ty = base.y;
        sp.vx = 0;
        sp.vy = 0;
        sp.brainTx = base.x;
        sp.brainTy = base.y;
        sp.brainNextAt = this.worldTime;
        sp.intent = "hold";
        sp.dribblePlan = null;
      });
    }
  }

  private tickKickoff(dt: number): void {
    this.tickMovement(dt, true);
    if (this.phaseTimer <= 0 && this.carrier) {
      this.phase = "open";
      this.decisionCd = this.rng.float(0.4, 0.9);
    }
  }

  private tickCelebration(dt: number): void {
    if (this.phaseTimer <= 0) {
      const side = this.concedingSide ?? "home";
      this.concedingSide = null;
      this.startKickoff(side, "restart");
      return;
    }

    const celebration = this.celebration;
    if (!celebration) return;
    const scoringPlayers = this.players(celebration.side);
    const scorer = scoringPlayers[celebration.scorerIndex];

    // Keep the actual scoring positions for the replayable moment, then let
    // the scorer run toward a corner while nearby team-mates form a moving
    // huddle. This replaces the old instant teleport back to formation.
    scoringPlayers.forEach((sp, i) => {
      if (sp.sentOff) return;
      if (sp.role === "GK") {
        const base = this.team(celebration.side).basePositions[i];
        if (base) {
          sp.tx = base.x;
          sp.ty = base.y;
          this.movePlayer(sp, dt, 0.45);
        }
        return;
      }
      if (i === celebration.scorerIndex) {
        sp.tx = celebration.targetX;
        sp.ty = celebration.targetY;
        this.movePlayer(sp, dt, 1.06);
        return;
      }
      const angle = i * 2.18;
      const ring = 25 + (i % 3) * 10;
      const anchorX = scorer?.x ?? celebration.targetX;
      const anchorY = scorer?.y ?? celebration.targetY;
      sp.tx = clamp(anchorX + Math.cos(angle) * ring, 18, 982);
      sp.ty = clamp(anchorY + Math.sin(angle) * ring, 14, 636);
      this.movePlayer(sp, dt, 0.92);
    });

    // The conceding team walks back rather than joining normal open-play
    // movement around a ball that is already in the net.
    const defendingSide = this.other(celebration.side);
    this.players(defendingSide).forEach((sp, i) => {
      if (sp.sentOff) return;
      const base = this.team(defendingSide).basePositions[i];
      if (!base) return;
      sp.tx = base.x;
      sp.ty = base.y;
      this.movePlayer(sp, dt, 0.55);
    });
  }

  // -------------------------------------------------------------------------
  // Movement & shape
  // -------------------------------------------------------------------------

  private tickMovement(dt: number, frozen: boolean): void {
    for (const side of ["home", "away"] as Side[]) {
      const team = this.team(side);
      const tactics = team.tactics;
      const style = tactics.playStyle ?? PlayStyle.Balanced;
      const behavior = styleBehavior(style);
      const dir = this.attackDir(side);
      const hasBall =
        (this.carrier && this.carrier.side === side) ||
        (this.flight && this.flight.side === side) ||
        (!this.carrier && !this.flight && this.possessionSide === side);
      const transition = this.transitionAge(side);
      const justWon = hasBall && transition < 5.5;
      const justLost = !hasBall && this.transitionAge(this.other(side)) < 5.5;
      const possessionStyle = style === PlayStyle.TikiTaka || style === PlayStyle.PossessionBased;
      const directStyle =
        style === PlayStyle.RouteOne ||
        style === PlayStyle.LongBallDirect ||
        style === PlayStyle.DirectCounterAttack;
      const wingStyle = style === PlayStyle.WingPlay;
      const gegen = style === PlayStyle.GegenpressingStyle;
      const park = style === PlayStyle.ParkTheBus;
      const total = style === PlayStyle.TotalFootball;

      let widthF = 0.78 + (tactics.width ?? WidthSetting.Normal) * 0.11;
      if (wingStyle) widthF += 0.12;
      if (possessionStyle || park) widthF -= 0.06;
      widthF *= hasBall
        ? behavior.attackingWidth
        : 1 / Math.sqrt(Math.max(0.72, behavior.compactness));
      widthF = clamp(widthF, 0.62, 1.32);

      const mentality = tactics.mentality ?? MentalityLevel.Balanced;
      const line = tactics.defensiveLine ?? DefensiveLine.Normal;
      let pressing = tactics.pressing ?? PressingIntensity.Standard;
      if (gegen) pressing = Math.max(pressing, PressingIntensity.High);
      if (park) pressing = Math.min(pressing, PressingIntensity.Low);

      const players = this.players(side);
      const brainTeammates: BrainAgent[] = players
        .filter((sp) => !sp.sentOff)
        .map((sp) => ({ id: sp.p.id, role: sp.role, x: sp.x, y: sp.y }));
      const brainOpponents: BrainAgent[] = this.players(this.other(side))
        .filter((sp) => !sp.sentOff)
        .map((sp) => ({ id: sp.p.id, role: sp.role, x: sp.x, y: sp.y }));
      const markAssignments = new Map<string, BrainAgent>();
      if (!hasBall) {
        const markers = players
          .filter((sp) => !sp.sentOff && sp.role !== "GK")
          .sort((a, b) => {
            const priority = (p: SimPlayer) => lineOf(p.role) === "DEF" ? 0 : lineOf(p.role) === "MID" ? 1 : 2;
            return priority(a) - priority(b);
          });
        const threats = brainOpponents.filter((op) => op.role !== "GK");
        const assigned = new Set<string>();
        const assignedMarkers = new Set<string>();

        // Exact user/AI match-plan jobs are allocated first. Generic zonal
        // assignments then fill the remaining players and threats around them.
        for (const instruction of this.opponentPlans[side]?.instructions ?? []) {
          if (!instruction.markerPlayerId) continue;
          const marker = markers.find((candidate) => candidate.p.id === instruction.markerPlayerId);
          const target = threats.find((candidate) => candidate.id === instruction.targetPlayerId);
          if (!marker || !target) continue;
          markAssignments.set(marker.p.id, target);
          assigned.add(target.id);
          assignedMarkers.add(marker.p.id);
        }

        for (const marker of markers) {
          if (assignedMarkers.has(marker.p.id)) continue;
          const available = threats.filter((threat) => !assigned.has(threat.id));
          const pool = available.length > 0 ? available : threats;
          const target = [...pool].sort((a, b) => {
            const dangerA = Math.abs(a.x - this.ownGoalX(side)) * 0.22;
            const dangerB = Math.abs(b.x - this.ownGoalX(side)) * 0.22;
            const distanceA = Math.hypot(a.x - marker.x, a.y - marker.y);
            const distanceB = Math.hypot(b.x - marker.x, b.y - marker.y);
            return distanceA + dangerA - (distanceB + dangerB);
          })[0];
          if (target) {
            markAssignments.set(marker.p.id, target);
            assigned.add(target.id);
          }
        }
      }
      const active = players
        .map((sp, i) => ({ sp, i, d: Math.hypot(sp.x - this.ball.x, sp.y - this.ball.y) }))
        .filter((o) => !o.sp.sentOff && o.sp.role !== "GK");
      const oppositionCarrier = this.carrier?.side === this.other(side)
        ? this.players(this.other(side))[this.carrier.i]
        : undefined;
      const receptionPlan = this.planAgainst(side, oppositionCarrier?.p.id);
      const planPressAdjustment = (candidate: SimPlayer): number => {
        if (!receptionPlan) return 0;
        if (receptionPlan.pressing === "standOff") return 240;
        if (receptionPlan.pressing !== "pressOnReceive") return 0;
        if (candidate.p.id === receptionPlan.markerPlayerId) return -190;
        return receptionPlan.doubleTeam ? -105 : receptionPlan.markerPlayerId ? 45 : -80;
      };
      const pressOrder = [...active].sort((a, b) => {
        const aDirective = this.directives(side, a.sp);
        const bDirective = this.directives(side, b.sp);
        const aTrait = hasPlaystyle(a.sp.p, PlaystyleTag.PressingForward) ? 90 :
          hasPlaystyle(a.sp.p, PlaystyleTag.BallWinner) ? 35 : 0;
        const bTrait = hasPlaystyle(b.sp.p, PlaystyleTag.PressingForward) ? 90 :
          hasPlaystyle(b.sp.p, PlaystyleTag.BallWinner) ? 35 : 0;
        const ad = a.d - (aDirective.pressHard ? 120 : aDirective.defensiveDuty ? 65 : 0) - aTrait +
          (aDirective.pressLess ? 240 : 0) + planPressAdjustment(a.sp);
        const bd = b.d - (bDirective.pressHard ? 120 : bDirective.defensiveDuty ? 65 : 0) - bTrait +
          (bDirective.pressLess ? 240 : 0) + planPressAdjustment(b.sp);
        return ad - bd;
      });
      // One player engages and, at high intensity, one supports. Team-wide
      // "press hard" raises urgency and prioritises players; it must never
      // bypass this assignment and send four or more dots onto the carrier.
      // Gegenpressing changes who/when, not the physical number able to tackle.
      let pressCount = pressing === PressingIntensity.None
        ? 0
        : pressing >= PressingIntensity.High || gegen || justLost
          ? 2
          : 1;
      if (receptionPlan?.pressing === "pressOnReceive") {
        pressCount = receptionPlan.doubleTeam ? 2 : Math.max(1, pressCount);
      } else if (receptionPlan?.pressing === "standOff") {
        pressCount = 0;
      }
      pressCount = Math.min(2, pressCount);
      const pressers = new Set(pressOrder.slice(0, pressCount).map((o) => o.i));

      players.forEach((sp, i) => {
        if (sp.sentOff) return;
        const base = team.basePositions[i] ?? { x: 500, y: 325 };
        const directive = this.directives(side, sp);
        // A defensive assignment changes the player's functional line rather
        // than merely suppressing one forward run. This is how a nominal
        // striker can become part of the midfield/defensive block.
        const roleLine = directive.defensiveDuty && sp.role !== "GK" ? "MID" : lineOf(sp.role);

        if (this.phase === "setpiece" && this.setPiece) {
          const setup = this.setPiecePosition(this.setPiece, side, i);
          sp.tx = setup.x;
          sp.ty = setup.y;
          sp.intent = side === this.setPiece.side ? (i === this.setPiece.takerIdx ? "hold" : "receive") : "mark";
          this.movePlayer(sp, dt, setup.intensity);
          return;
        }
        if (this.phase === "penalty" && this.penaltyState) {
          const setup = this.penaltyPosition(side, i);
          if (setup) {
            sp.tx = setup.x;
            sp.ty = setup.y;
            sp.intent = side === this.penaltyState.side && i === this.penaltyState.takerIdx ? "hold" : "recover";
            this.movePlayer(sp, dt, setup.intensity);
            return;
          }
        }

        // The carrier follows a stable, scored route through reachable space.
        // Candidate paths include line breaks, half-space diagonals, cuts,
        // byline bursts, feints and pressure escapes. The normal acceleration
        // and independent-touch physics execute the route waypoint by waypoint.
        if (this.carrier && this.carrier.side === side && this.carrier.i === i) {
          const pressure = this.pressureOn(side, i);
          const { plan, point } = this.currentDribbleTarget(side, sp, pressure);
          sp.tx = clamp(point.x, 20, 980);
          sp.ty = clamp(point.y, 18, 632);
          sp.intent = "carry";

          const carrierTargeting = this.attackingPlanNear(side, sp.x, sp.y, ["pace", "dribble"]);
          if (carrierTargeting && sp.role !== "GK" && carrierTargeting.distance < 210) {
            sp.runUntil = Math.max(
              sp.runUntil,
              this.worldTime + (carrierTargeting.instruction.attackApproach === "pace" ? 1.05 : 0.72),
            );
          }

          const burst = sp.runUntil > this.worldTime ? Math.max(0.92, plan.intensity) : plan.intensity;
          const intensity = directive.conserveEnergy ? Math.min(0.52, burst) : burst;
          this.drainEnergy(sp, dt, 0.72 + intensity * 0.62);
          this.movePlayer(sp, dt, intensity);
          this.tickControlledBall(side, sp, dt, pressure);
          return;
        }

        // Receiver attacks the destination of a through ball / switch while it
        // is in flight. This creates a real race rather than teleporting the
        // receiver when the pass arrives.
        if (
          (this.flight?.kind === "pass" || this.flight?.kind === "knockOn" || this.flight?.kind === "cross") &&
          this.flight.side === side &&
          this.flight.targetIdx === i
        ) {
          sp.tx = this.flight.toX;
          sp.ty = this.flight.toY;
          const isRace = this.flight.kind === "knockOn" || this.flight.flavor === "through";
          sp.intent = isRace ? "runBehind" : "receive";
          this.drainEnergy(sp, dt, isRace ? 1.35 : this.flight.kind === "cross" ? 1.05 : 0.85);
          this.movePlayer(sp, dt, isRace ? 1 : this.flight.kind === "cross" ? 0.82 : 0.56);
          return;
        }

        // Cover defenders can win a knock-on race; they do not wait at their
        // formation anchor while the attacker runs unopposed to a scripted win.
        if (
          (this.flight?.kind === "knockOn" || this.flight?.kind === "cross") &&
          this.flight.side !== side &&
          this.nearestPlayerIndex(side, this.flight.toX, this.flight.toY) === i
        ) {
          sp.tx = this.flight.toX;
          sp.ty = this.flight.toY;
          sp.intent = "recover";
          const recoveryIntensity = this.flight.kind === "knockOn" ? 1 : 0.84;
          this.drainEnergy(sp, dt, this.flight.kind === "knockOn" ? 1.4 : 1.05);
          this.movePlayer(sp, dt, recoveryIntensity);
          return;
        }

        // Keeper reacts to the shot trajectory and has to move/dive; the save
        // resolver no longer teleports a stationary marker to the ball.
        if (sp.role === "GK" && this.flight?.kind === "shot" && this.flight.side !== side) {
          sp.tx = clamp(this.ownGoalX(side) + this.attackDir(side) * 20, 8, 992);
          sp.ty = clamp(this.flight.toY, 286, 364);
          sp.intent = "recover";
          this.drainEnergy(sp, dt, 1.2);
          this.movePlayer(sp, dt, 1);
          return;
        }

        // Goalkeeper sweeps higher behind a high line / possession side, but
        // retreats in a low block.
        if (sp.role === "GK") {
          const distToOwn = Math.abs(this.ball.x - this.ownGoalX(side));
          const sweeperKeeper = sp.roleAssignment.role === "SweeperKeeper";
          const dutySweep = sp.roleAssignment.duty === "Attack" ? 40 : sp.roleAssignment.duty === "Support" ? 24 : 10;
          const roleSweep = sweeperKeeper && !park ? dutySweep : 0;
          const sweep = park ? 0 : (line + (hasBall ? 1 : 0)) * 6;
          const goalOffset = clamp(42 + Math.min(distToOwn, 350) * 0.035 + sweep + roleSweep, 40, 135);
          sp.tx = side === "home" ? goalOffset : PITCH_W - goalOffset;
          sp.ty = clamp(325 + (this.ball.y - 325) * (sweeperKeeper ? 0.36 : 0.27), 218, 432);
          this.movePlayer(sp, dt, sweeperKeeper ? 0.46 : 0.34);
          return;
        }

        if (frozen) {
          sp.tx = side === "home" ? Math.min(base.x, 480) : Math.max(base.x, 520);
          sp.ty = 325 + (base.y - 325) * widthF;
          this.movePlayer(sp, dt, 0.28);
          return;
        }

        // Formation is the reference structure. Each line then reacts
        // differently to possession and the chosen football identity.
        let tx = base.x;
        let ty = 325 + (base.y - 325) * widthF;
        const lineShift = (line - DefensiveLine.Normal) * 24;
        const mentalityShift = (mentality - MentalityLevel.Balanced) * 13;
        const ballShiftX = (this.ball.x - 500) * (possessionStyle ? 0.12 : 0.16);
        const ballShiftY = (this.ball.y - 325) * (possessionStyle || park ? 0.26 : 0.34);

        if (hasBall) {
          const advanceByLine =
            roleLine === "DEF" ? (possessionStyle ? 38 : directStyle ? 15 : 28) :
            roleLine === "MID" ? (directStyle ? 78 : possessionStyle ? 54 : 62) :
            (directStyle || justWon ? 72 : possessionStyle ? 35 : 52);
          tx += dir * (advanceByLine + mentalityShift + ballShiftX);
          ty += ballShiftY;
        } else {
          const block = park ? -75 : directStyle ? -34 : gegen ? 18 : -18;
          const lineFactor = roleLine === "DEF" ? 1 : roleLine === "MID" ? 0.72 : 0.38;
          tx += dir * (block + lineShift * lineFactor + mentalityShift * 0.35 + ballShiftX);
          ty += ballShiftY;
          // Compact vertical distances between the three outfield lines.
          if (park || possessionStyle || gegen) {
            const centreX = side === "home" ? 360 : 640;
            tx += (centreX - tx) * (park ? 0.14 : 0.08);
          }
        }

        if (!hasBall && tactics.offsideTrap && roleLine === "DEF") {
          // Step as one unit; reduce the small stagger encoded in formation
          // coordinates so a runner cannot exploit a lone deep full-back.
          const formationLine = side === "home" ? 215 : 785;
          tx = tx * 0.35 + (formationLine + dir * lineShift) * 0.65;
        }

        const isFullBack = ["RB", "LB", "RWB", "LWB"].includes(sp.role);
        const isWide = ["RB", "LB", "RWB", "LWB", "RW", "LW", "RM", "LM"].includes(sp.role);
        const isForward = ["ST", "CF", "RW", "LW"].includes(sp.role);

        // Overloads and role-/playstyle-specific runs.
        if (!hasBall && hasPlaystyle(sp.p, PlaystyleTag.Sweeper) && roleLine === "DEF") {
          tx -= dir * 38;
          ty += (this.ball.y - ty) * 0.16;
          sp.intent = "cover";
        }
        if (hasBall && hasPlaystyle(sp.p, PlaystyleTag.BallPlayingDefender) && roleLine === "DEF") {
          tx += dir * 24;
        }
        if (hasBall && isFullBack) {
          const overlap = wingStyle || total || gegen || directive.forwardRuns;
          const sameFlank = (base.y < 325) === (this.ball.y < 325);
          if (overlap && (sameFlank || wingStyle)) tx += dir * (sp.role.includes("WB") ? 105 : 78);
          else if (possessionStyle) {
            // Inverted full-back forms a midfield rest-defence triangle.
            ty += (325 - ty) * 0.28;
            tx += dir * 32;
          }
        }
        if (hasBall && isForward && directStyle && !directive.defensiveDuty) tx += dir * (justWon ? 85 : 42);
        if (hasBall && sp.runUntil > this.worldTime && !directive.defensiveDuty) tx += dir * 105;
        if (hasBall && directive.forwardRuns && !directive.holdPosition && !directive.defensiveDuty) tx += dir * 72;
        if (hasBall && directive.targetMan) {
          tx -= dir * 38;
          ty += (325 - ty) * 0.28;
        }

        // Width / half-space instructions.
        if (directive.stayWide && isWide) ty = base.y < 325 ? 42 : 608;
        if (directive.cutInside && isWide) ty += (325 - ty) * 0.56;
        if (wingStyle && isWide && !directive.cutInside) ty = base.y < 325 ? Math.min(ty, 72) : Math.max(ty, 578);
        if ((possessionStyle || total) && ["CM", "CAM", "CF"].includes(sp.role)) {
          // stagger midfielders into different half spaces
          ty += (i % 2 === 0 ? -1 : 1) * 24;
        }
        if (directive.roam || total) {
          const wave = Math.sin(this.worldTime * 0.5 + i * 1.7);
          ty += wave * (directive.roam ? 48 : 24);
          tx += dir * Math.cos(this.worldTime * 0.37 + i) * (directive.roam ? 30 : 14);
        }

        const channelTargeting = this.attackingPlanNear(side, sp.x, sp.y);
        if (hasBall && channelTargeting && !directive.defensiveDuty) {
          const { instruction: channelPlan, target: channelTarget } = channelTargeting;
          if (channelPlan.attackApproach === "pace" && (isForward || isWide)) {
            tx = dir > 0 ? Math.max(tx, channelTarget.x + 72) : Math.min(tx, channelTarget.x - 72);
            ty = ty * 0.36 + (channelTarget.y + (i % 2 === 0 ? -24 : 24)) * 0.64;
          } else if (channelPlan.attackApproach === "aerial") {
            if (isWide) ty = base.y < 325 ? Math.min(ty, 58) : Math.max(ty, 592);
            if (["ST", "CF", "CAM"].includes(sp.role)) {
              tx = tx * 0.45 + (channelTarget.x + dir * 32) * 0.55;
              ty = ty * 0.4 + channelTarget.y * 0.6;
            }
          } else if (channelPlan.attackApproach === "dribble" && isWide) {
            ty = ty * 0.42 + channelTarget.y * 0.58;
            tx += dir * 38;
          }
        }

        // Duties alter physical depth; roles then add recognisable movement
        // patterns. They never modify attributes or guarantee an outcome.
        if (sp.roleAssignment.duty === "Attack") tx += dir * (hasBall ? 46 : 18);
        else if (sp.roleAssignment.duty === "Defend") tx -= dir * (hasBall ? 22 : 34);

        const tacticalRole = sp.roleAssignment.role;
        if (tacticalRole === "Mezzala") {
          const halfSpaceY = base.y < 325 ? 205 : 445;
          ty = ty * 0.48 + halfSpaceY * 0.52;
          if (hasBall) tx += dir * (sp.roleAssignment.duty === "Attack" ? 42 : 20);
        } else if (tacticalRole === "AdvancedPlaymaker") {
          ty += (325 - ty) * 0.28;
          tx += dir * (hasBall ? 18 : 6);
        } else if (tacticalRole === "ShadowStriker") {
          tx += dir * (hasBall ? 82 : 48);
          ty += (325 - ty) * 0.5;
        } else if (tacticalRole === "FalseNine") {
          tx -= dir * (hasBall ? 92 : 58);
          ty += (325 - ty) * 0.28;
        } else if (tacticalRole === "DeepLyingForward") {
          tx -= dir * (hasBall ? 60 : 35);
        } else if (tacticalRole === "TargetForward") {
          tx -= dir * (hasBall ? 34 : 16);
          ty += (325 - ty) * 0.22;
        } else if (tacticalRole === "Poacher") {
          tx += dir * (hasBall ? 62 : 38);
          ty += (325 - ty) * 0.62;
        } else if (tacticalRole === "CompleteForward") {
          ty += Math.sin(this.worldTime * 0.42 + i) * 34;
        }

        // Hold-position is deliberately strong: keep the player's formation
        // anchor, only sliding with the ball as a connected block.
        if (directive.holdPosition) {
          tx = base.x + dir * (hasBall ? 16 : (lineShift * (roleLine === "DEF" ? 1 : 0.35)));
          ty = 325 + (base.y - 325) * widthF + ballShiftY * 0.35;
        }

        // A true defensive duty overrides the nominal formation anchor. A
        // forward given this job drops into the block, stays behind attacking
        // play, tracks a nearby opponent and can become a real presser.
        if (directive.defensiveDuty) {
          const anchorFromOwnGoal = hasBall ? 380 : 285;
          tx = this.ownGoalX(side) + dir * anchorFromOwnGoal + ballShiftX * 0.28;
          ty = 325 + (this.ball.y - 325) * (hasBall ? 0.32 : 0.48);
          if (!hasBall) {
            const mark = this.closestOpponent(side, sp);
            if (mark && Math.hypot(mark.x - sp.x, mark.y - sp.y) < 260) {
              const goalSideX = mark.x - dir * 24;
              tx = tx * 0.42 + goalSideX * 0.58;
              ty = ty * 0.3 + mark.y * 0.7;
            }
          }
        }

        // Position-specific defensive/build-up geometry remains visible even
        // when a generic hold instruction is also active.
        if (tacticalRole === "CoverDefender" && !hasBall) {
          tx -= dir * 38;
        } else if (tacticalRole === "Stopper" && !hasBall) {
          tx += dir * 32;
        } else if (tacticalRole === "WideCentreBack") {
          const outside = base.y < 325 ? -1 : 1;
          ty += outside * (sp.roleAssignment.duty === "Attack" ? 68 : 42);
          if (hasBall && sp.roleAssignment.duty !== "Defend") tx += dir * 35;
        } else if (tacticalRole === "InvertedFullBack") {
          ty += (325 - ty) * 0.64;
          tx += dir * (hasBall ? 32 : 10);
        } else if (tacticalRole === "HalfBack") {
          tx = this.ownGoalX(side) + dir * (hasBall ? 255 : 295);
          ty += (325 - ty) * 0.55;
        } else if (tacticalRole === "Anchor") {
          tx = this.ownGoalX(side) + dir * (hasBall ? 335 : 305);
          ty += (325 - ty) * 0.42;
        }

        // A named marking job is a physical approach angle, not a hidden
        // debuff. The marker still has to accelerate, keep up and win a duel.
        const exactMarkingPlan = this.planForMarker(side, sp.p.id);
        const assignedTarget = markAssignments.get(sp.p.id);
        const assignedTargetPlan = assignedTarget ? this.planAgainst(side, assignedTarget.id) : undefined;
        const markingPlan = exactMarkingPlan ?? (
          assignedTargetPlan && (
            assignedTargetPlan.tightMarking || assignedTargetPlan.showOnto !== "normal" || assignedTargetPlan.preventCrosses
          ) ? assignedTargetPlan : undefined
        );
        const plannedTarget = markingPlan
          ? this.players(this.other(side)).find((opponent) => opponent.p.id === markingPlan.targetPlayerId && !opponent.sentOff)
          : undefined;
        if (!hasBall && markingPlan && plannedTarget) {
          const towardCentre = Math.sign(325 - plannedTarget.y) || 1;
          const distance = markingPlan.tightMarking ? 17 : 29;
          let plannedY = plannedTarget.y;
          if (markingPlan.showOnto === "outside") plannedY += towardCentre * 19;
          if (markingPlan.showOnto === "inside") plannedY -= towardCentre * 19;
          if (markingPlan.showOnto === "weakFoot") {
            // Occupy the preferred-foot shoulder, making the weaker-foot route
            // the path of least resistance.
            plannedY += plannedTarget.p.preferredFoot === "Right" ? -18 : 18;
          }
          // Cross denial closes the touchline shoulder rather than applying a
          // statistical crossing penalty to the winger.
          if (markingPlan.preventCrosses) plannedY -= towardCentre * 22;
          const plannedX = plannedTarget.x - dir * distance;
          const weight = markingPlan.tightMarking ? 0.86 : 0.68;
          tx = tx * (1 - weight) + plannedX * weight;
          ty = ty * (1 - weight) + plannedY * weight;
          sp.intent = "mark";
        }

        // Defensive actions: a designated set presses; everyone else protects
        // the formation. Gegenpressing activates immediately after losing it.
        const isPresser = !hasBall &&
          pressers.has(i) &&
          !directive.pressLess &&
          !directive.conserveEnergy &&
          (Math.hypot(sp.x - this.ball.x, sp.y - this.ball.y) <
            (directive.pressHard ? 260 : directive.defensiveDuty ? 235 : justLost ? 260 : 205));
        if (isPresser) {
          const urgency = gegen || pressing >= PressingIntensity.High ? 0.9 : 0.73;
          tx += (this.ball.x - tx) * urgency;
          ty += (this.ball.y - ty) * urgency;
        } else if (!hasBall && directive.tightMarking) {
          const mark = this.closestOpponent(side, sp);
          if (mark) {
            // Goal-side shoulder, not directly on top of the opponent.
            tx = mark.x - dir * 18;
            ty = mark.y + (325 - mark.y) * 0.05;
          }
        }

        // A local football brain periodically chooses between holding shape,
        // offering a safe angle, overlapping, running behind, covering and
        // marking. It remains anchored to the formation calculation above,
        // so eleven independent players still behave as a connected team.
        if (!isPresser && this.worldTime >= sp.brainNextAt) {
          const carrierPlayer = this.carrier?.side === side
            ? players[this.carrier.i]
            : null;
          const brain = chooseSpatialTarget({
            player: sp.p,
            playerIndex: i,
            role: sp.role,
            current: { x: sp.x, y: sp.y },
            baseTarget: { x: tx, y: ty },
            ball: this.ball,
            carrier: carrierPlayer ? { x: carrierPlayer.x, y: carrierPlayer.y } : null,
            teammates: brainTeammates,
            opponents: brainOpponents,
            markTarget: markAssignments.get(sp.p.id),
            attackingDirection: dir,
            style: tactics.playStyle,
            hasPossession: hasBall,
            transitionAge: transition,
            runActive: sp.runUntil > this.worldTime,
            stayWide: Boolean(directive.stayWide || hasPlaystyle(sp.p, PlaystyleTag.Winger)),
            cutInside: Boolean(directive.cutInside || hasPlaystyle(sp.p, PlaystyleTag.CreativeInsideForward)),
            holdPosition: Boolean(directive.holdPosition || directive.defensiveDuty),
            forwardRuns: Boolean(
              directive.forwardRuns || hasPlaystyle(sp.p, PlaystyleTag.BoxToBox) ||
              hasPlaystyle(sp.p, PlaystyleTag.FullBackRunner) || hasPlaystyle(sp.p, PlaystyleTag.Poacher),
            ),
          });
          sp.brainTx = brain.x;
          sp.brainTy = brain.y;
          sp.intent = brain.intent;
          // Better decision-makers scan and update a little more frequently.
          sp.brainNextAt = this.worldTime + clamp(0.58 - sp.p.decisions * 0.014, 0.28, 0.56);
        }
        if (!isPresser) {
          const brainWeight = hasBall ? 0.58 : 0.34;
          tx = tx * (1 - brainWeight) + sp.brainTx * brainWeight;
          ty = ty * (1 - brainWeight) + sp.brainTy * brainWeight;
        } else {
          sp.intent = "press";
        }

        // In loose-ball situations the nearest player from each side attacks
        // the second ball while the rest preserve the team structure.
        if (!this.carrier && !this.flight && this.phase === "open" && pressOrder[0]?.i === i) {
          tx = this.ball.x;
          ty = this.ball.y;
        }

        sp.tx = clamp(tx, 18, 982);
        sp.ty = clamp(ty, 12, 638);
        const sprinting = isPresser || sp.runUntil > this.worldTime || (justWon && isForward);
        const activeRun = hasBall && [
          "runBehind", "overlap", "underlap", "comeShort", "crossReceiver", "giveAndGo", "pullWide",
        ].includes(sp.intent);
        this.drainEnergy(sp, dt, sprinting ? 1.35 : activeRun ? 1.05 : hasBall ? 0.72 : 0.55);
        this.movePlayer(
          sp,
          dt,
          sprinting ? 1 : activeRun ? 0.76 : directive.conserveEnergy ? 0.16 : hasBall ? 0.2 : 0.22,
        );
      });
    }
  }

  private opponentsWithin(side: Side, x: number, y: number, metres: number): number {
    let n = 0;
    for (const op of this.players(this.other(side))) {
      if (!op.sentOff && Math.hypot(op.x - x, op.y - y) / UNITS_PER_METER <= metres) n++;
    }
    return n;
  }

  private drainEnergy(sp: SimPlayer, dt: number, effort: number): void {
    const fitness = clamp(sp.p.naturalFitness, 1, 20);
    const drain = dt * effort * (0.00052 - fitness * 0.000012);
    sp.energy = clamp(sp.energy - drain, 0.58, 1);
  }

  /**
   * Accelerated steering rather than teleporting toward every new target at
   * top speed. Shape adjustments are a walk/jog; only presses, recovery runs,
   * through-ball races and selected carries approach the player's sprint cap.
   */
  private movePlayer(sp: SimPlayer, dt: number, intensity: number): void {
    const dx = sp.tx - sp.x;
    const dy = sp.ty - sp.y;
    const distanceToTarget = Math.hypot(dx, dy);
    const controlsBall = Boolean(
      this.carrier && this.carrier.side === (this.homePlayers.includes(sp) ? "home" : "away") &&
      this.players(this.carrier.side)[this.carrier.i] === sp,
    );
    const fatigue = 0.76 + sp.energy * 0.24;
    const maxSpeedMps = playerSprintSpeed(sp.p, controlsBall) * clamp(intensity, 0.22, 1.05) * fatigue;
    let desiredSpeed = maxSpeedMps * UNITS_PER_METER;

    // Arrive without orbiting or snapping: decelerate inside roughly 2.5 m.
    if (distanceToTarget < 26) desiredSpeed *= clamp(distanceToTarget / 26, 0, 1);
    const nx = distanceToTarget > 0 ? dx / distanceToTarget : 0;
    const ny = distanceToTarget > 0 ? dy / distanceToTarget : 0;

    // Sharp turns cost speed. Agile players redirect more efficiently.
    const currentSpeed = Math.hypot(sp.vx, sp.vy);
    if (currentSpeed > 1 && desiredSpeed > 0) {
      const facing = clamp((sp.vx * nx + sp.vy * ny) / currentSpeed, -1, 1);
      const agilityRetention = 0.42 + sp.p.agility * 0.025;
      desiredSpeed *= 1 - ((1 - facing) * 0.5) * (1 - agilityRetention);
    }

    const desiredVx = nx * desiredSpeed;
    const desiredVy = ny * desiredSpeed;
    const dvx = desiredVx - sp.vx;
    const dvy = desiredVy - sp.vy;
    const delta = Math.hypot(dvx, dvy);
    const accel = playerAcceleration(sp.p) * UNITS_PER_METER * fatigue;
    const maxDelta = accel * dt;
    if (delta <= maxDelta || delta === 0) {
      sp.vx = desiredVx;
      sp.vy = desiredVy;
    } else {
      sp.vx += (dvx / delta) * maxDelta;
      sp.vy += (dvy / delta) * maxDelta;
    }

    const stepX = sp.vx * dt;
    const stepY = sp.vy * dt;
    const step = Math.hypot(stepX, stepY);
    if (distanceToTarget > 0 && step >= distanceToTarget) {
      sp.x = sp.tx;
      sp.y = sp.ty;
      sp.vx *= 0.25;
      sp.vy *= 0.25;
    } else {
      sp.x += stepX;
      sp.y += stepY;
    }

    const clampedX = clamp(sp.x, 8, 992);
    const clampedY = clamp(sp.y, 8, 642);
    if (clampedX !== sp.x) sp.vx = 0;
    if (clampedY !== sp.y) sp.vy = 0;
    sp.x = clampedX;
    sp.y = clampedY;
  }

  /**
   * Controlled possession is a sequence of touches, not an attached sprite.
   * The ball travels independently to a lead point, then the next touch is
   * chosen from the carrier's new speed, pressure and control attributes.
   */
  private tickControlledBall(side: Side, sp: SimPlayer, dt: number, pressure: number): void {
    const speed = Math.hypot(sp.vx, sp.vy);
    const toTargetX = sp.tx - sp.x;
    const toTargetY = sp.ty - sp.y;
    const targetDistance = Math.hypot(toTargetX, toTargetY);
    let dx = speed > 7 ? sp.vx / speed : targetDistance > 0 ? toTargetX / targetDistance : this.attackDir(side);
    let dy = speed > 7 ? sp.vy / speed : targetDistance > 0 ? toTargetY / targetDistance : 0;

    const ballDistance = Math.hypot(this.ball.x - sp.x, this.ball.y - sp.y);
    if (this.worldTime >= sp.nextTouchAt || ballDistance > 31) {
      const pressResistant = hasPlaystyle(sp.p, PlaystyleTag.PressResistant);
      const closeControl = (sp.p.dribbling + sp.p.ballControl + sp.p.agility) / 60;
      const cadence = clamp(
        0.42 - closeControl * 0.12 - Math.min(speed / 90, 1) * 0.07 + pressure * 0.035,
        0.22,
        0.46,
      );
      const speedMps = speed / UNITS_PER_METER;
      let leadM = 0.68 + speedMps * cadence * (0.68 + closeControl * 0.17);
      // Bursts use a longer touch into grass; cuts/feints/escape turns keep the
      // ball closer. Either way the ball travels independently to the target.
      leadM *= sp.dribblePlan?.touchScale ?? 1;
      leadM *= 1 - pressure * (pressResistant ? 0.28 : 0.42);
      leadM = clamp(leadM, 0.58, 3.15);

      // A skilled carrier nudges away from the nearest challenge without
      // changing the player's body position instantaneously.
      const opponent = pressure > 0.15 ? this.closestOpponent(side, sp) : null;
      if (opponent) {
        const ox = sp.x - opponent.x;
        const oy = sp.y - opponent.y;
        const od = Math.hypot(ox, oy);
        if (od > 0) {
          dx = dx * 0.82 + (ox / od) * 0.18;
          dy = dy * 0.82 + (oy / od) * 0.18;
          const nd = Math.hypot(dx, dy);
          if (nd > 0) { dx /= nd; dy /= nd; }
        }
      }

      this.controlledBallTarget.x = clamp(sp.x + dx * leadM * UNITS_PER_METER, -20, PITCH_W + 20);
      this.controlledBallTarget.y = clamp(sp.y + dy * leadM * UNITS_PER_METER, -20, PITCH_H + 20);
      sp.nextTouchAt = this.worldTime + cadence;
      this.addPlayerStat(sp.p.id, "touches");
      this.lastTouchSide = side;
    }

    const remaining = Math.max(dt, sp.nextTouchAt - this.worldTime + dt);
    this.controlledBallVelocity.x = (this.controlledBallTarget.x - this.ball.x) / remaining;
    this.controlledBallVelocity.y = (this.controlledBallTarget.y - this.ball.y) / remaining;
    this.ball.x += this.controlledBallVelocity.x * dt;
    this.ball.y += this.controlledBallVelocity.y * dt;
    this.ballHeight = 0;
  }

  // -------------------------------------------------------------------------
  // Open play
  // -------------------------------------------------------------------------

  private tickOpen(dt: number): void {
    if (this.carrier) {
      this.tickCarrier();
      this.tickTackles();
    } else {
      this.tickLooseBall(dt);
    }
    this.tickPossessionStat();
    this.checkBounds();
  }

  private tickPossessionStat(): void {
    const side = this.carrier?.side ?? (this.flight ? this.flight.side : this.possessionSide);
    if (side === "home") this.stats.possessionHome += 1;
    else this.stats.possessionAway += 1;
  }

  private pressureOn(side: Side, idx: number): number {
    const p = this.players(side)[idx];
    if (!p) return 0;
    let nearest = Infinity;
    let closeOpponents = 0;
    for (const op of this.players(this.other(side))) {
      if (op.sentOff) continue;
      const d = Math.hypot(op.x - p.x, op.y - p.y) / UNITS_PER_METER;
      if (d < nearest) nearest = d;
      if (d < 9) closeOpponents += 1;
    }
    const contact = clamp((8 - nearest) / 8, 0, 1);
    const crowd = Math.max(0, closeOpponents - 1) * 0.1;
    return clamp(contact + crowd, 0, 1);
  }

  private opponentInterceptionsNear(side: Side, x: number, y: number): number {
    let best = 0;
    for (const op of this.players(this.other(side))) {
      if (op.sentOff) continue;
      const d = Math.hypot(op.x - x, op.y - y) / UNITS_PER_METER;
      if (d < 12) best = Math.max(best, op.p.interceptions);
    }
    return best;
  }

  private tickCarrier(): void {
    if (!this.carrier) return;
    const side = this.carrier.side;
    const sp = this.players(side)[this.carrier.i];
    if (!sp) {
      this.carrier = null;
      return;
    }

    if (this.decisionCd > 0) {
      // A cooldown chosen in open space cannot remain blindly fixed after the
      // press arrives. Collapse the remaining window as contact develops.
      const pressure = this.pressureOn(side, this.carrier.i);
      if (pressure > 0.38) {
        const pressuredWindow = 0.07 + (1 - pressure) * 0.2;
        this.decisionCd = Math.min(this.decisionCd, pressuredWindow);
      }
      if (this.decisionCd > 0) return;
    }
    this.makeDecision(side, sp);
  }

  private shouldClearImmediately(side: Side, sp: SimPlayer, pressure?: number): boolean {
    if (!this.directives(side, sp).clearImmediately) return false;
    const dir = this.attackDir(side);
    const distanceFromOwnGoal = Math.abs(sp.x - this.ownGoalX(side));
    const inOwnHalf = (sp.x - 500) * dir < 0;
    const livePressure = pressure ?? this.pressureOn(side, this.indexOfPlayer(side, sp));
    return distanceFromOwnGoal < 335 || (inOwnHalf && livePressure > 0.34);
  }

  private makeDecision(side: Side, sp: SimPlayer): void {
    const team = this.team(side);
    const dir = this.attackDir(side);
    const idx = this.players(side).indexOf(sp);
    const directive = this.directives(side, sp);
    const style = team.tactics.playStyle ?? PlayStyle.Balanced;
    const behavior = styleBehavior(style);
    const pressure = this.pressureOn(side, idx);
    const distanceFromOwnGoal = Math.abs(sp.x - this.ownGoalX(side));
    const nearbyAttackTargeting = this.attackingPlanNear(side, sp.x, sp.y);
    const nearbyAttackPlan = nearbyAttackTargeting && nearbyAttackTargeting.distance < 165
      ? nearbyAttackTargeting.instruction
      : undefined;

    // An urgent-clearance plan has priority over style and role, but only in a
    // credible danger zone. Reception itself removes the cooldown, so this is
    // the first action rather than a late response after opponents arrive.
    if (this.shouldClearImmediately(side, sp, pressure)) {
      this.executeClearance(side, sp, true);
      return;
    }

    // Goalkeepers respect the build-up identity: possession teams split the
    // centre-backs; direct teams seek a forward or wide outlet.
    if (sp.role === "GK") {
      const target = this.choosePass(side, sp, style, dir);
      if (target) this.executePass(side, sp, target);
      else this.decisionCd = this.decisionDelay(side, sp, 1.15);
      return;
    }

    const goalX = this.goalX(side);
    const distToGoal =
      Math.hypot(goalX - sp.x, (PITCH_H / 2 - sp.y) * 0.7) / UNITS_PER_METER;
    const ment = team.tactics.mentality ?? MentalityLevel.Balanced;
    const inFinalThird = dir > 0 ? sp.x > 665 : sp.x < 335;
    const wide = sp.y < 145 || sp.y > 505;
    const nearByline = Math.abs(goalX - sp.x) < 205;

    // Wide players and overlapping full-backs produce actual open-play
    // crosses/cutbacks. Wing Play and an explicit early-cross instruction
    // greatly increase the trigger.
    if (wide && inFinalThird) {
      const crossBase =
        directive.earlyCross ? 0.5 :
        style === PlayStyle.WingPlay ? 0.36 :
        ["RB", "LB", "RWB", "LWB", "RW", "LW", "RM", "LM"].includes(sp.role) ? 0.14 : 0.045;
      const cutbackTalent = hasPlaystyle(sp.p, PlaystyleTag.CutbackSpecialist);
      const cutback = nearByline && this.rng.chance(cutbackTalent ? 0.9 : 0.68);
      const crossTrait = hasPlaystyle(sp.p, PlaystyleTag.Crosser) ? 0.14 : 0;
      const plannedAerialAttack = nearbyAttackPlan?.attackApproach === "aerial" ? 0.2 : 0;
      if (this.rng.chance(clamp((crossBase + sp.p.crossing * 0.006 + crossTrait + plannedAerialAttack) * behavior.crossing, 0.025, 0.86))) {
        this.executeCross(side, sp, cutback);
        return;
      }
    }

    // Shooting is contextual. Everyone may attempt a credible effort outside
    // the box; an explicit "shoot more" instruction raises frequency/range,
    // but the hard 39m cap prevents absurd attempts from halfway.
    let shootUrge = shotDecisionProbability(
      sp.p,
      sp.role,
      distToGoal,
      ment,
      style,
      Boolean(directive.shootFromDistance),
    );
    if (hasPlaystyle(sp.p, PlaystyleTag.LongShotSpecialist) && distToGoal >= 18 && distToGoal <= 32) {
      shootUrge *= 1.75;
    }
    if (hasPlaystyle(sp.p, PlaystyleTag.ClinicalFinisher) && distToGoal < 18) shootUrge *= 1.35;
    if (hasPlaystyle(sp.p, PlaystyleTag.Poacher) && distToGoal < 17) shootUrge *= 1.22;
    if (sp.roleAssignment.role === "Poacher" && distToGoal < 18) shootUrge *= 1.35;
    if (sp.roleAssignment.role === "ShadowStriker" && distToGoal < 23) shootUrge *= 1.22;
    if (sp.roleAssignment.role === "AdvancedPlaymaker" && sp.roleAssignment.duty === "Support") shootUrge *= 0.62;
    if (directive.avoidShooting) shootUrge = 0.001;
    else if (directive.defensiveDuty) shootUrge *= 0.28;

    if (this.rng.chance(shootUrge)) {
      this.executeShot(side, sp, distToGoal);
      return;
    }

    // In real matches a receiver with grass in front is allowed to take the
    // first touch and advance. Team identity and individual traits decide
    // whether that becomes a patient carry or an explosive knock-on.
    const carryRoute = this.chooseCarrierRoute(side, sp);
    const carryEnd = carryRoute.waypoints[carryRoute.waypoints.length - 1];
    const channelOpen = carryRoute.pitchControl > 0.42 && carryRoute.laneClearanceM > 2.2;
    const paceAbuser = hasPlaystyle(sp.p, PlaystyleTag.PaceAbuser);
    const carryQuality = (sp.p.dribbling + sp.p.ballControl + sp.p.decisions) / 60;
    const plannedCarry = nearbyAttackPlan?.attackApproach === "pace" ? 0.2 :
      nearbyAttackPlan?.attackApproach === "dribble" ? 0.16 : 0;
    const carryUrge = clamp(
      (0.08 + carryQuality * 0.2) * behavior.carryBias + (directive.dribbleMore ? 0.18 : 0) + plannedCarry -
        (directive.dribbleLess || directive.shortPassing ? 0.13 : 0),
      0.025,
      0.7,
    );
    if (
      pressure < 0.38 && channelOpen && distToGoal > 12 &&
      !directive.holdPosition && !directive.defensiveDuty &&
      this.rng.chance(carryUrge)
    ) {
      if (side === "home") this.stats.carriesHome += 1;
      else this.stats.carriesAway += 1;
      this.addPlayerStat(sp.p.id, "carries");
      if (
        (paceAbuser || (sp.p.pace >= 16 && behavior.transition > 1.2)) &&
        carryRoute.safeKnockOnM >= 4.2 &&
        this.worldTime - sp.lastKnockOnAt > 2.2 &&
        this.rng.chance(clamp(
          (paceAbuser ? 0.58 : 0.3) * behavior.directness * behavior.transition * behavior.carryBias,
          0.04,
          0.82,
        ))
      ) {
        this.executeKnockOn(side, sp, false, undefined, carryRoute);
        return;
      }
      this.recordTacticalEvent({
        side,
        type: "carry",
        outcome: "complete",
        playerId: sp.p.id,
        x: sp.x,
        y: sp.y,
        endX: carryEnd.x,
        endY: carryEnd.y,
        pressure,
        qualifier: this.movementQualifier(carryRoute),
      });
      this.installDribblePlan(side, sp, undefined, carryRoute);
      sp.runUntil = Math.max(sp.runUntil, this.worldTime + (paceAbuser ? 1.15 : 0.78));
      this.decisionCd = this.decisionDelay(side, sp, paceAbuser ? 0.82 : 1.05);
      return;
    }

    // A carrier who has already protected the ball under real pressure must
    // release it now rather than chaining shield/dribble pauses while more
    // opponents converge. Recycling backwards is a valid, deliberate pass.
    const heldFor = this.worldTime - this.carrierSince;
    if (pressure > 0.52 && heldFor > 0.72) {
      const release = this.choosePass(side, sp, style, dir);
      if (release) {
        this.executePass(side, sp, release);
        return;
      }
      if (distanceFromOwnGoal < 300 && pressure > 0.72) {
        this.executeClearance(side, sp, false);
        return;
      }
    }

    // Under contact, strong/balanced players can shield before the opponent
    // gets a clean tackle. Target-men deliberately seek this duel.
    if (pressure > 0.62) {
      const defender = this.closestOpponent(side, sp);
      const targetManStyle = directive.targetMan || hasPlaystyle(sp.p, PlaystyleTag.TargetMan);
      const seekShield = targetManStyle || sp.p.strength + sp.p.balance >= 27;
      if (defender && seekShield && this.rng.chance(targetManStyle ? 0.58 : 0.32)) {
        if (resolveHoldOff(sp.p, defender.p, this.rng)) {
          defender.tackleCd = Math.max(defender.tackleCd, 0.65);
          this.installDribblePlan(side, sp, defender.p.id);
          sp.runUntil = Math.max(sp.runUntil, this.worldTime + 0.8);
          this.bumpRating(sp, 0.025);
          this.decisionCd = this.decisionDelay(side, sp, 0.55);
          return;
        }
      }
    }

    // Dribbling is a purposeful instruction/style choice, not the universal
    // response to pressure. "Release early" strongly suppresses it.
    let dribbleP = (0.1 + sp.p.dribbling * 0.013 + sp.p.flair * 0.005) * behavior.carryBias;
    if (directive.dribbleMore) dribbleP += 0.32;
    if (nearbyAttackPlan?.attackApproach === "dribble") dribbleP += 0.24;
    if (nearbyAttackPlan?.attackApproach === "pace") dribbleP += 0.1;
    if (directive.dribbleLess || directive.shortPassing || directive.defensiveDuty) dribbleP *= 0.25;
    if (hasPlaystyle(sp.p, PlaystyleTag.Dribbler)) dribbleP += 0.16;
    if (hasPlaystyle(sp.p, PlaystyleTag.CreativeInsideForward)) dribbleP += 0.1;
    if (hasPlaystyle(sp.p, PlaystyleTag.PressResistant)) dribbleP += 0.08;
    if (style === PlayStyle.TotalFootball || style === PlayStyle.WingPlay) dribbleP += 0.08;
    if (pressure > 0.38 && this.rng.chance(clamp(dribbleP, 0.03, 0.78))) {
      const defender = this.closestOpponent(side, sp);
      if (defender) {
        if (side === "home") this.stats.dribblesAttemptedHome += 1;
        else this.stats.dribblesAttemptedAway += 1;
        this.addPlayerStat(sp.p.id, "dribblesAttempted");
        const res = resolveDribble(sp.p, defender.p, this.rng);
        this.statsTackleAttempt(this.other(side), defender.p.id);
        if (res.foul) {
          this.recordTacticalEvent({
            side,
            type: "dribble",
            outcome: "foul",
            playerId: sp.p.id,
            relatedPlayerId: defender.p.id,
            x: sp.x,
            y: sp.y,
            pressure,
          });
          this.awardFoul(side, defender, sp);
          return;
        }
        if (!res.beat) {
          this.recordTacticalEvent({
            side,
            type: "dribble",
            outcome: "lost",
            playerId: sp.p.id,
            relatedPlayerId: defender.p.id,
            x: sp.x,
            y: sp.y,
            pressure,
          });
          this.recordTacticalEvent({
            side: this.other(side),
            type: "tackle",
            outcome: "won",
            playerId: defender.p.id,
            relatedPlayerId: sp.p.id,
            x: defender.x,
            y: defender.y,
          });
          this.addPlayerStat(sp.p.id, "possessionLost");
          this.addPlayerStat(defender.p.id, "tacklesWon");
          this.addPlayerStat(defender.p.id, "recoveries");
          this.giveBallTo(this.other(side), this.indexOfPlayer(this.other(side), defender));
          this.lastTurnover = { side: this.other(side), t: this.worldTime };
          return;
        }
        defender.tackleCd = Math.max(defender.tackleCd, 0.72);
        this.bumpRating(sp, 0.06);
        this.executeKnockOn(side, sp, true, defender.p.id);
        return;
      }
    }

    const pass = this.choosePass(side, sp, style, dir);
    if (pass) {
      this.executePass(side, sp, pass);
      return;
    }

    // No passing lane: take the best controllable route into useful space,
    // then reassess rather than defaulting to a straight run.
    this.installDribblePlan(side, sp, undefined, carryRoute);
    sp.runUntil = Math.max(sp.runUntil, this.worldTime + 0.7);
    this.decisionCd = this.decisionDelay(side, sp, 0.7);
  }

  /** A deliberate longer touch creates a physical race between attacker and cover. */
  private executeKnockOn(
    side: Side,
    sp: SimPlayer,
    dribbleAttempt: boolean,
    beatDefenderId?: string,
    plannedRoute = this.chooseCarrierRoute(side, sp, beatDefenderId),
  ): void {
    const idx = this.indexOfPlayer(side, sp);
    const goalDistance = Math.abs(this.goalX(side) - sp.x);
    const paceTrait = hasPlaystyle(sp.p, PlaystyleTag.PaceAbuser);
    const routeEnd = plannedRoute.waypoints[plannedRoute.waypoints.length - 1];
    const routeDx = routeEnd.x - sp.x;
    const routeDy = routeEnd.y - sp.y;
    const routeDistance = Math.hypot(routeDx, routeDy) || 1;

    // Winning the initial duel does not guarantee enough grass for a long
    // touch. In a crowded lane the attacker uses the same route with close
    // control, leaving cover defenders able to recover and tackle normally.
    if (dribbleAttempt && plannedRoute.safeKnockOnM < 3.1) {
      if (side === "home") this.stats.dribblesCompletedHome += 1;
      else this.stats.dribblesCompletedAway += 1;
      this.addPlayerStat(sp.p.id, "dribblesCompleted");
      this.recordTacticalEvent({
        side,
        type: "dribble",
        outcome: "won",
        playerId: sp.p.id,
        relatedPlayerId: beatDefenderId,
        x: sp.x,
        y: sp.y,
        endX: routeEnd.x,
        endY: routeEnd.y,
        pressure: this.pressureOn(side, idx),
        qualifier: this.movementQualifier(plannedRoute),
      });
      this.installDribblePlan(side, sp, beatDefenderId, plannedRoute);
      sp.runUntil = Math.max(sp.runUntil, this.worldTime + 0.85);
      this.decisionCd = this.decisionDelay(side, sp, 0.7);
      return;
    }

    const desiredLeadM = 3.2 + (sp.p.pace + sp.p.acceleration - 20) * 0.14 +
      (paceTrait ? 1.8 : 0) + this.rng.float(-0.45, 0.75);
    const maximumLeadM = Math.min(
      9.2,
      Math.max(3.1, goalDistance / UNITS_PER_METER - 2),
      Math.max(3.1, plannedRoute.safeKnockOnM),
    );
    const leadM = clamp(desiredLeadM, 3.1, maximumLeadM);
    const toX = clamp(sp.x + (routeDx / routeDistance) * leadM * UNITS_PER_METER, 8, 992);
    const toY = clamp(sp.y + (routeDy / routeDistance) * leadM * UNITS_PER_METER, 8, 642);
    const distanceM = Math.hypot(toX - this.ball.x, toY - this.ball.y) / UNITS_PER_METER;

    sp.lastKnockOnAt = this.worldTime;
    sp.intent = "carry";
    if (side === "home") this.stats.knockOnsHome += 1;
    else this.stats.knockOnsAway += 1;
    this.launchFlight({
      kind: "knockOn",
      fromX: this.ball.x,
      fromY: this.ball.y,
      toX,
      toY,
      t: 0,
      dur: clamp(distanceM / this.rng.float(7.5, 10.8), 0.28, 1.15),
      side,
      targetIdx: idx,
      arcH: 0,
      challengedIds: [],
      dribbleAttempt,
      beatDefenderId,
      movementPattern: plannedRoute.pattern,
      passerId: sp.p.id,
    });
    this.lastTouchSide = side;
    this.possessionSide = side;
  }

  private executeClearance(side: Side, sp: SimPlayer, instructed: boolean): void {
    const dir = this.attackDir(side);
    const distanceUnits = this.rng.float(380, 570);
    const toX = clamp(sp.x + dir * distanceUnits, 24, 976);
    // Clear away from the most crowded central lane, with enough variation to
    // create realistic second balls rather than a scripted pass recipient.
    const awayFromCentre = sp.y < 325 ? -1 : 1;
    const toY = clamp(sp.y + awayFromCentre * this.rng.float(65, 210), 22, 628);
    const distanceM = Math.hypot(toX - sp.x, toY - sp.y) / UNITS_PER_METER;

    this.addPlayerStat(sp.p.id, "touches");
    this.addPlayerStat(sp.p.id, "clearances");
    if (instructed) {
      this.pushInstructionCommentary(
        `clear:${side}`,
        side,
        sp,
        `${sp.p.firstName} ${sp.p.lastName} follows the instruction and clears the danger immediately.`,
      );
    }
    this.launchFlight({
      kind: "pass",
      fromX: this.ball.x,
      fromY: this.ball.y,
      toX,
      toY,
      t: 0,
      dur: clamp(distanceM / this.rng.float(16, 21), 0.35, 3.6),
      side,
      passOutcome: { success: false, intercepted: false },
      arcH: this.rng.float(48, 82),
      flavor: "lofted",
      passerId: sp.p.id,
      analyticsType: "clearance",
    });
    this.lastTouchSide = side;
    this.possessionSide = side;
  }

  private decisionDelay(side: Side, sp: SimPlayer, factor = 1): number {
    const t = this.team(side).tactics;
    const tempo = t.tempo ?? TempoSetting.Normal;
    const composure = (sp.p.decisions + sp.p.composure) / 40;
    let base = 0.58 - tempo * 0.075 - composure * 0.1;
    const leading = side === "home" ? this.homeScore > this.awayScore : this.awayScore > this.homeScore;
    if (leading && t.timeWasting === TimeWasting.Always) base += 0.28;
    if (leading && t.timeWasting === TimeWasting.Late && this.gameTime > 4500) base += 0.22;

    // Pressure compresses the available thinking time. Composure still
    // influences quality in the resolver; it must not manifest as standing
    // still while the press closes around the carrier.
    const idx = this.indexOfPlayer(side, sp);
    const pressure = idx >= 0 ? this.pressureOn(side, idx) : 0;
    const pressureFactor = 1 - pressure * 0.58;
    const cadence = styleBehavior(t.playStyle ?? PlayStyle.Balanced).decisionCadence;
    const leadershipCadence = hasPlaystyle(sp.p, PlaystyleTag.Leader) ? 0.92 : 1;
    return clamp(
      base * factor * pressureFactor * cadence * leadershipCadence + this.rng.float(0.015, 0.12),
      0.06,
      1.05,
    );
  }

  private executeCross(side: Side, sp: SimPlayer, cutback: boolean): void {
    const dir = this.attackDir(side);
    const goalX = this.goalX(side);
    const teammates = this.players(side)
      .filter((p) => !p.sentOff && p !== sp && p.role !== "GK")
      .sort((a, b) => {
        const as = a.p.offTheBall + a.p.heading + a.p.anticipation + (this.directives(side, a).targetMan ? 10 : 0);
        const bs = b.p.offTheBall + b.p.heading + b.p.anticipation + (this.directives(side, b).targetMan ? 10 : 0);
        return bs - as;
      });
    const receiver = teammates.find((p) => Math.abs(goalX - p.x) < (cutback ? 260 : 330)) ?? teammates[0];
    if (!receiver) {
      this.decisionCd = this.decisionDelay(side, sp);
      return;
    }
    const quality = (sp.p.crossing + sp.p.technique) / 40;
    const error = (1 - quality) * 95;
    const toX = cutback
      ? clamp(goalX - dir * this.rng.float(120, 210), 20, 980)
      : clamp(goalX - dir * this.rng.float(45, 115), 20, 980);
    const toY = clamp(
      (cutback ? receiver.y : 325 + (receiver.y - 325) * 0.55) + this.rng.float(-error, error),
      45,
      605,
    );
    const distM = Math.hypot(toX - sp.x, toY - sp.y) / UNITS_PER_METER;
    this.statsPassAttempt(side, sp.p.id);
    this.addPlayerStat(sp.p.id, "crossesAttempted");
    this.addPlayerStat(sp.p.id, "touches");
    if (side === "home") this.stats.crossesHome += 1;
    else this.stats.crossesAway += 1;
    this.assistWindow = { side, playerId: sp.p.id, t: this.worldTime };
    this.launchFlight({
      kind: cutback ? "pass" : "cross",
      fromX: this.ball.x,
      fromY: this.ball.y,
      toX,
      toY,
      t: 0,
      dur: clamp(distM / (cutback ? passSpeed("pullback", this.rng) : this.rng.float(14, 19)), 0.35, 2.5),
      side,
      targetIdx: this.indexOfPlayer(side, receiver),
      passOutcome: cutback ? { success: this.rng.chance(0.72 + quality * 0.2), intercepted: false } : undefined,
      arcH: cutback ? 2 : this.rng.float(38, 72),
      flavor: cutback ? "pullback" : "lofted",
      passerId: sp.p.id,
    });
    this.lastTouchSide = side;
  }

  private statsTackleAttempt(side: Side, playerId?: string): void {
    if (side === "home") this.stats.tacklesHome += 1;
    else this.stats.tacklesAway += 1;
    this.addPlayerStat(playerId, "tacklesAttempted");
  }

  private indexOfPlayer(side: Side, sp: SimPlayer): number {
    return this.players(side).indexOf(sp);
  }

  private closestOpponent(side: Side, sp: SimPlayer): SimPlayer | null {
    let best: SimPlayer | null = null;
    let bestD = Infinity;
    for (const op of this.players(this.other(side))) {
      if (op.sentOff) continue;
      const d = Math.hypot(op.x - sp.x, op.y - sp.y);
      if (d < bestD) {
        bestD = d;
        best = op;
      }
    }
    return best;
  }

  private choosePass(
    side: Side,
    sp: SimPlayer,
    style: PlayStyle,
    dir: number,
  ): PassTarget | null {
    const team = this.team(side);
    const tactics = team.tactics;
    const players = this.players(side);
    const myIdx = this.indexOfPlayer(side, sp);
    const passerDirective = this.directives(side, sp);
    const baseProfile = PASS_PROFILE[style] ?? PASS_PROFILE.Balanced;
    const behavior = styleBehavior(style);
    const length = tactics.passingLength ?? TempoSetting.Normal;
    const pressure = this.pressureOn(side, myIdx);
    const preferred = clamp(
      baseProfile.shortPref + (length - TempoSetting.Normal) * 5.5 +
        (behavior.directness - 1) * 9 +
        (passerDirective.directPassing ? 11 : 0) - (passerDirective.shortPassing ? 7 : 0),
      7,
      39,
    );
    const candidates: PassTarget[] = [];
    const ownThird = Math.abs(sp.x - this.ownGoalX(side)) < 300;
    const nearGoal = Math.abs(sp.x - this.goalX(side)) < 240;

    players.forEach((mate, idx) => {
      if (idx === myIdx || mate.sentOff) return;
      const currentDistM = Math.hypot(mate.x - sp.x, mate.y - sp.y) / UNITS_PER_METER;
      if (currentDistM < 3 || currentDistM > 72) return;
      if (mate.role === "GK" && !(ownThird && (pressure > 0.42 || style === PlayStyle.PossessionBased))) return;

      const receiverDirective = this.directives(side, mate);
      const receiverTargeting = this.attackingPlanNear(side, mate.x, mate.y);
      const channelPlan = receiverTargeting && receiverTargeting.distance < 155
        ? receiverTargeting.instruction
        : undefined;
      const progressUnits = (mate.x - sp.x) * dir;
      const progressM = progressUnits / UNITS_PER_METER;
      const lane = this.laneSafety(side, sp.x, sp.y, mate.x, mate.y);
      const openness = this.nearestOpponentDist(side, mate.x, mate.y);
      const targetLine = lineOf(mate.role);
      const passerLine = lineOf(sp.role);
      const deliberateAerial =
        currentDistM > 29 &&
        (style === PlayStyle.RouteOne || style === PlayStyle.LongBallDirect ||
          passerDirective.directPassing || (sp.role === "GK" && currentDistM > 40));
      let flavor: PassFlavor = deliberateAerial ? "lofted" : currentDistM > 22 ? "driven" : "std";
      let tx = mate.x;
      let ty = mate.y;
      let risky = lane < 3.8;

      // Through balls target space, but only when the receiver is onside at
      // the instant of the pass and has a credible forward-running role.
      const runner =
        receiverDirective.forwardRuns ||
        mate.runUntil > this.worldTime ||
        mate.intent === "runBehind" ||
        hasPlaystyle(mate.p, PlaystyleTag.SpaceInterpreter) ||
        ["ST", "CF", "RW", "LW", "CAM"].includes(mate.role);
      const roomAhead = this.opponentsWithin(side, mate.x + dir * 55, mate.y, 8) <= 1;
      const throughIntent =
        runner && progressM > 3 && roomAhead &&
        (passerDirective.riskyPasses ||
          hasPlaystyle(sp.p, PlaystyleTag.ThroughBallSpecialist) ||
          style === PlayStyle.DirectCounterAttack ||
          tactics.counterAttack ||
          style === PlayStyle.TotalFootball ||
          channelPlan?.attackApproach === "pace" ||
          sp.p.creativity + sp.p.decisions > 27) &&
        !this.isOffside(side, mate.x, sp.x);
      if (throughIntent && this.rng.chance(clamp(
        0.002 + sp.p.creativity * 0.0018 + baseProfile.riskTol * 0.035 +
          (behavior.runBehind - 1) * 0.035 +
          (channelPlan?.attackApproach === "pace" ? 0.13 : 0) +
          (hasPlaystyle(sp.p, PlaystyleTag.ThroughBallSpecialist) ? 0.12 : 0),
        0.015,
        0.46,
      ))) {
        // Pass into the runner's future path. Existing velocity matters, so a
        // static target and a player already accelerating receive differently.
        const currentForwardSpeed = Math.max(0, mate.vx * dir) / UNITS_PER_METER;
        const lead = clamp(
          28 + mate.p.acceleration * 1.55 + mate.p.pace * 1.15 + currentForwardSpeed * 5.5,
          38,
          105,
        );
        tx = clamp(mate.x + dir * lead + mate.vx * 0.22, 16, 984);
        ty = clamp(mate.y + mate.vy * 0.24 + (325 - mate.y) * (receiverDirective.cutInside ? 0.28 : 0.08), 16, 634);
        flavor = "through";
        risky = true;
      }

      // Switches exploit a weak-side winger/full-back rather than forcing the
      // nearest forward ball into traffic.
      const oppositeFlank = Math.abs(mate.y - sp.y) > 300;
      if (
        oppositeFlank && currentDistM > 28 &&
        (style === PlayStyle.WingPlay || passerDirective.switchPlay || sp.p.longPassing >= 14) &&
        openness > 5.5
      ) {
        flavor = "switch";
        tx = mate.x + dir * 18;
        ty = mate.y;
      }

      // A player at the byline looks behind the defensive line for a cutback.
      if (nearGoal && (sp.y < 150 || sp.y > 500) && progressM < 1 && mate.role !== "GK") {
        flavor = "pullback";
        tx = clamp(this.goalX(side) - dir * this.rng.float(125, 205), 20, 980);
        ty = clamp(mate.y + (325 - mate.y) * 0.38, 40, 610);
      }

      const distM = Math.hypot(tx - sp.x, ty - sp.y) / UNITS_PER_METER;
      let score =
        lane * baseProfile.laneW * (0.75 + behavior.circulation * 0.25) +
        openness * baseProfile.openW +
        progressUnits * baseProfile.progW * 0.1 * behavior.directness -
        Math.abs(distM - preferred) * (behavior.directness > 1.3 ? 0.48 : 0.66);

      // Footballing relationships between formation lines: defenders seek a
      // midfielder, midfielders seek a player between/beyond lines, while a
      // pressured forward can set it back. This is structured progression,
      // not an unconditional "pass forward" bonus.
      const rank = (lineName: ReturnType<typeof lineOf>) =>
        lineName === "GK" ? 0 : lineName === "DEF" ? 1 : lineName === "MID" ? 2 : 3;
      const lineGain = rank(targetLine) - rank(passerLine);
      if (passerLine === targetLine && currentDistM < 18) score += 2.8;
      if (lineGain === 1 && progressM > 2 && lane > 3.5) score += 8;
      if (lineGain >= 2 && progressM > 10 && lane > 5) score += 6;
      if (lineGain < 0 && pressure > 0.52) score += 5;
      if (ownThird && progressM > 4 && lane > 4) score += 5;
      if (tactics.counterAttack && this.transitionAge(side) < 6 && progressM > 5) score += 10 + progressM * 0.35;
      if (style === PlayStyle.TikiTaka || style === PlayStyle.PossessionBased) {
        if (currentDistM < 17) score += 10;
        if (progressM >= -8 && progressM <= 8) score += 5; // circulation/lateral support
        if (progressM < 0 && pressure > 0.35) score += 8; // recycle under pressure
        if (flavor === "through") score -= style === PlayStyle.TikiTaka ? 3 : 1;
      }
      if (style === PlayStyle.LongBallDirect || style === PlayStyle.RouteOne) {
        if (distM > 29 && progressM > 8) score += 13;
        if (mate.role === "ST" || mate.role === "CF" || receiverDirective.targetMan) {
          score += 5 + mate.p.strength * 0.3 + mate.p.heading * 0.25;
          flavor = distM > 24 ? "lofted" : flavor;
        }
        if (progressM < -5) score -= 9;
      }
      if (style === PlayStyle.DirectCounterAttack && this.transitionAge(side) < 6) {
        score += Math.max(0, progressM) * 0.7;
        if (flavor === "through") score += 11;
      }
      if (style === PlayStyle.WingPlay) {
        const wideRole = ["RW", "LW", "RM", "LM", "RWB", "LWB", "RB", "LB"].includes(mate.role);
        if (wideRole) score += 9;
        if (oppositeFlank) score += 5;
      }
      if (style === PlayStyle.ParkTheBus && !ownThird && progressM < 0) score -= 4;

      // Opponent plans bias real choices rather than editing either player's
      // attributes. The receiving run still needs a viable lane and remains
      // subject to interception, control and duel resolution.
      if (channelPlan?.attackApproach === "pace" && progressM > 3) {
        score += 10 + Math.max(0, mate.p.pace - 10) * 0.45;
        if (flavor === "through") score += 8;
      } else if (channelPlan?.attackApproach === "aerial" && progressM > 0 && distM > 15) {
        score += 8 + Math.max(0, mate.p.heading - 10) * 0.35;
        flavor = "lofted";
        risky = lane < 4.8;
      } else if (channelPlan?.attackApproach === "dribble" && openness > 4) {
        score += 5;
      }

      if (flavor === "through") {
        score += 7 + sp.p.creativity * 0.22 +
          (hasPlaystyle(sp.p, PlaystyleTag.ThroughBallSpecialist) ? 11 : 0);
      }
      if (flavor === "switch") score += 9;
      if (flavor === "pullback") score += 14;

      // Individual instruction has final authority over team defaults.
      if (passerDirective.shortPassing && distM < 16) score += 12;
      if (passerDirective.shortPassing && distM > 25) score -= 15;
      if (passerDirective.directPassing && progressM > 8 && distM > 23) score += 14;
      if (passerDirective.riskyPasses && (flavor === "through" || risky)) score += 9;
      if (passerDirective.switchPlay && flavor === "switch") score += 15;
      if (hasPlaystyle(sp.p, PlaystyleTag.BallPlayingDefender) && progressM > 7 && distM > 18) {
        score += 8;
        if (flavor === "std") flavor = "driven";
      }
      if (hasPlaystyle(sp.p, PlaystyleTag.Playmaker) && lane > 4 && progressM > 1) score += 4;
      if (receiverDirective.targetMan && flavor === "lofted") score += 9;
      if (receiverDirective.stayWide && Math.abs(ty - 325) > 220) score += 3;

      // A model-resolved recipient is a deliberate football decision, not a
      // decorative label. A strong priority normally puts that teammate at the
      // top of the shortlist whenever the distance and offside checks allow it.
      if (passerDirective.preferredTargetId === mate.p.id) {
        const priority = clamp(passerDirective.targetPriority ?? 0.85, 0, 1);
        score += 30 + priority * 58;
        if (passerDirective.targetDelivery === "aerial" && distM > 12) {
          flavor = "lofted";
          risky = lane < 4.8;
        } else if (passerDirective.targetDelivery === "ground") {
          flavor = distM > 20 ? "driven" : "std";
        }
      }

      // Low-risk systems reject lanes they do not trust; risk-taking creators
      // can still attempt them.
      if (risky && !passerDirective.riskyPasses) score -= (1 - baseProfile.riskTol) * 14;
      if (this.isOffside(side, mate.x, sp.x) && progressUnits > 0) score -= 180;
      candidates.push({
        idx,
        x: clamp(tx, 12, 988),
        y: clamp(ty, 12, 638),
        score,
        risky,
        flavor,
        long: distM > 25,
      });
    });

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    // Better decision-makers consistently see the best option; poorer ones
    // sample a wider shortlist. Weighted choice prevents robotic repetition.
    const shortlistN = sp.p.decisions >= 15 ? 2 : sp.p.decisions >= 9 ? 3 : 5;
    const shortlist = candidates.slice(0, shortlistN);
    const floor = Math.min(...shortlist.map((c) => c.score));
    const weighted = shortlist.map((c) => ({ c, w: Math.max(0.5, c.score - floor + 2) }));
    let roll = this.rng.float(0, weighted.reduce((n, x) => n + x.w, 0));
    for (const x of weighted) {
      roll -= x.w;
      if (roll <= 0) return x.c;
    }
    return shortlist[0];
  }

  private nearestOpponentDist(side: Side, x: number, y: number): number {
    let nearest = 99;
    for (const sp of this.players(this.other(side))) {
      if (sp.sentOff) continue;
      const d = Math.hypot(sp.x - x, sp.y - y) / UNITS_PER_METER;
      if (d < nearest) nearest = d;
    }
    return clamp(nearest, 0, 30);
  }

  private isOffside(attacking: Side, receiverX: number, ballX: number): boolean {
    const dir = this.attackDir(attacking);
    if ((receiverX - 500) * dir <= 0 || (receiverX - ballX) * dir <= 0) return false;
    const defenders = this.players(this.other(attacking))
      .filter((p) => !p.sentOff)
      .map((p) => p.x)
      .sort((a, b) => dir > 0 ? b - a : a - b);
    if (defenders.length < 2) return false;
    const line = defenders[1];
    return (receiverX - line) * dir > 4;
  }

  private laneSafety(side: Side, x1: number, y1: number, x2: number, y2: number): number {
    let minD = Infinity;
    const steps = 6;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      for (const op of this.players(this.other(side))) {
        if (op.sentOff) continue;
        const d = Math.hypot(op.x - px, op.y - py) / UNITS_PER_METER;
        if (d < minD) minD = d;
      }
    }
    return clamp(minD, 0, 30);
  }

  private executePass(side: Side, sp: SimPlayer, target: PassTarget): void {
    const receiver = this.players(side)[target.idx];
    if (!receiver) {
      this.decisionCd = this.decisionDelay(side, sp);
      return;
    }

    // Offside is judged at the kick, not when the ball arrives.
    if ((target.flavor === "through" || (target.x - sp.x) * this.attackDir(side) > 20) &&
        this.isOffside(side, receiver.x, sp.x)) {
      this.statsPassAttempt(side, sp.p.id);
      this.addPlayerStat(sp.p.id, "touches");
      this.addPlayerStat(receiver.p.id, "offsides");
      this.addPlayerStat(sp.p.id, "possessionLost");
      this.pushEvent(
        MatchEventType.Offside,
        this.team(side).clubId,
        receiver.p.id,
        `Offside — ${receiver.p.firstName} ${receiver.p.lastName} went too early`,
      );
      this.startSetPiece("freeKick", this.other(side), receiver.x, receiver.y);
      return;
    }

    const flavor = target.flavor ?? "std";
    const distM = Math.hypot(target.x - sp.x, target.y - sp.y) / UNITS_PER_METER;
    const pressure = this.pressureOn(side, this.indexOfPlayer(side, sp));
    const passerDirective = this.directives(side, sp);
    if (passerDirective.preferredTargetId === receiver.p.id) {
      const service = flavor === "lofted" || flavor === "switch" ? "an aerial ball" : "a deliberate pass";
      this.pushInstructionCommentary(
        `target:${sp.p.id}:${receiver.p.id}`,
        side,
        sp,
        `${sp.p.lastName} seeks ${receiver.p.lastName} with ${service}, just as instructed.`,
        480,
      );
    }
    const inter = Math.max(
      this.opponentInterceptionsNear(side, target.x, target.y),
      20 - this.laneSafety(side, sp.x, sp.y, target.x, target.y),
    );
    const technique =
      flavor === "through" ? "through" :
      flavor === "lofted" || flavor === "switch" ? "long" : "short";
    const outcome = resolvePass(sp.p, receiver.p, distM, pressure, inter, this.rng, technique);
    let flightToX = target.x;
    let flightToY = target.y;
    // A share of genuinely misplaced passes leave the field instead of
    // stopping at an invisible clamp. Wide/long service is especially prone
    // to producing the throw-ins and goal kicks seen in real match data.
    if (!outcome.success) {
      if (this.rng.chance(target.long ? 0.42 : 0.32)) {
        const towardTop = target.y < 210 || (target.y < 440 && target.y - sp.y < -35);
        const towardBottom = target.y > 440 || (target.y >= 210 && target.y - sp.y > 35);
        if (towardTop || towardBottom || this.rng.chance(0.78)) {
          const top = towardTop || (!towardBottom && this.rng.chance(0.5));
          flightToY = top ? -10 : PITCH_H + 10;
          flightToX = clamp(target.x + this.rng.float(-35, 35), 15, 985);
        } else {
          flightToX = this.goalX(side) + this.attackDir(side) * 10;
          flightToY = target.y < 325 ? 85 : 565;
        }
      } else {
        // Resolution determines execution error, not a scripted future owner.
        // The displaced endpoint is then judged by continuous reach/race
        // geometry at arrival.
        const techniqueValue = technique === "long" ? sp.p.longPassing :
          technique === "through" ? (sp.p.creativity + sp.p.shortPassing) / 2 : sp.p.shortPassing;
        const errorM = clamp(
          1.2 + distM * 0.08 + pressure * 3 + (20 - techniqueValue) * 0.16,
          1.5,
          8.5,
        );
        const passDx = target.x - sp.x;
        const passDy = target.y - sp.y;
        const passD = Math.hypot(passDx, passDy) || 1;
        const along = this.rng.float(-0.45, 0.8) * errorM * UNITS_PER_METER;
        const across = this.rng.float(-1, 1) * errorM * UNITS_PER_METER;
        flightToX = clamp(target.x + (passDx / passD) * along - (passDy / passD) * across, 4, 996);
        flightToY = clamp(target.y + (passDy / passD) * along + (passDx / passD) * across, 4, 646);
      }
    }

    this.statsPassAttempt(side, sp.p.id);
    this.addPlayerStat(sp.p.id, "touches");
    if (flavor === "through") {
      if (side === "home") this.stats.throughBallsHome += 1;
      else this.stats.throughBallsAway += 1;
      this.addPlayerStat(sp.p.id, "throughBalls");
    }
    this.bumpRating(sp, outcome.success ? 0.025 : -0.045);
    this.assistWindow = { side, playerId: sp.p.id, t: this.worldTime };

    // Give-and-go behaviour: intelligent passers move immediately after a
    // short combination instead of freezing in their old formation slot.
    if (
      outcome.success && distM < 21 &&
      (this.team(side).tactics.playStyle === PlayStyle.TikiTaka ||
       this.team(side).tactics.playStyle === PlayStyle.TotalFootball ||
       this.directives(side, sp).forwardRuns) &&
      this.rng.chance(0.28 + sp.p.offTheBall * 0.018)
    ) {
      sp.runUntil = this.worldTime + this.rng.float(2.1, 3.8);
    }

    const speed = passSpeed(flavor, this.rng);
    const flightDistanceM = Math.hypot(flightToX - sp.x, flightToY - sp.y) / UNITS_PER_METER;
    const arcH =
      flavor === "switch" ? this.rng.float(48, 78) :
      flavor === "lofted" ? this.rng.float(42, 70) :
      flavor === "through" ? this.rng.float(0, 6) :
      flavor === "pullback" ? 2 :
      flavor === "driven" ? 1 : this.rng.float(1, 5);
    this.launchFlight({
      kind: "pass",
      fromX: this.ball.x,
      fromY: this.ball.y,
      toX: flightToX,
      toY: flightToY,
      t: 0,
      dur: clamp(flightDistanceM / speed, 0.22, 3.8),
      side,
      targetIdx: target.idx,
      // Accuracy has already changed the endpoint; possession now depends on
      // who physically reaches it.
      passOutcome: { success: true, intercepted: false },
      arcH,
      flavor,
      passerId: sp.p.id,
      challengedIds: [],
    });
    this.lastTouchSide = side;
    this.possessionSide = side;
  }

  private executeShot(side: Side, sp: SimPlayer, distM: number): void {
    const defendingSide = this.other(side);
    const gk =
      this.players(defendingSide).find((p) => p.role === "GK") ??
      this.players(defendingSide)[0];
    const goalX = this.goalX(side);
    const dir = this.attackDir(side);
    const angle = clamp(
      (Math.abs(sp.y - PITCH_H / 2) / (PITCH_H / 2)) * 0.6 + (distM > 30 ? 0.3 : 0),
      0,
      1,
    );
    const pressure = this.pressureOn(side, this.indexOfPlayer(side, sp));
    const outcome = resolveShot(sp.p, gk.p, distM, angle, pressure, this.rng);

    this.recordShot(side, sp.p.id, outcome.goal || outcome.saved);
    this.bumpRating(sp, outcome.goal ? 0 : -0.03);
    if (distM >= 20) {
      this.pushEvent(
        MatchEventType.Chance,
        this.team(side).clubId,
        sp.p.id,
        `${sp.p.firstName} ${sp.p.lastName} shoots from ${Math.round(distM)} metres!`,
      );
    }

    // Where the ball ends up
    let toX: number;
    let toY: number;
    if (outcome.goal) {
      toX = goalX - dir * 6;
      toY = PITCH_H / 2 + this.rng.float(-30, 30);
    } else if (outcome.saved) {
      toX = goalX - dir * 40;
      toY = clamp(PITCH_H / 2 + this.rng.float(-60, 60), 100, 550);
    } else if (outcome.blocked) {
      toX = goalX - dir * this.rng.float(80, 150);
      toY = clamp(sp.y + this.rng.float(-70, 70), 40, 610);
    } else {
      // wide: past the goal line outside the posts
      const spread = (this.rng.chance(0.5) ? 1 : -1) * this.rng.float(50, 130);
      toX = goalX + dir * 45;
      toY = clamp(PITCH_H / 2 + spread, -60, PITCH_H + 60);
    }

    this.launchFlight({
      kind: "shot",
      fromX: this.ball.x,
      fromY: this.ball.y,
      toX,
      toY,
      t: 0,
      dur: clamp(distM / this.rng.float(22, 32), 0.15, 1.8),
      side,
      shotOutcome: outcome,
      passerId: sp.p.id,
    });
    this.lastTouchSide = side;
    this.possessionSide = side;
  }

  private launchFlight(f: Flight): void {
    if (this.pendingFlightEventId) {
      this.updateTacticalEvent(this.pendingFlightEventId, "failed");
      this.pendingFlightEventId = null;
    }
    const actor = f.passerId
      ? this.players(f.side).find((player) => player.p.id === f.passerId)
      : undefined;
    const target = f.targetIdx !== undefined ? this.players(f.side)[f.targetIdx] : undefined;
    const eventType: TacticalEventType = f.analyticsType ??
      (f.kind === "shot" ? "shot" :
       f.kind === "cross" || f.flavor === "pullback" ? "cross" :
       f.kind === "knockOn" ? "dribble" :
       f.flavor === "through" ? "throughBall" : "pass");
    const shotOutcome: TacticalEventOutcome | undefined = f.kind === "shot"
      ? f.shotOutcome?.goal ? "goal"
        : f.shotOutcome?.saved ? "saved"
          : f.shotOutcome?.blocked ? "blocked" : "wide"
      : undefined;
    const start = this.orientedPoint(f.side, f.fromX, f.fromY);
    const pressure = actor ? this.pressureOn(f.side, this.indexOfPlayer(f.side, actor)) : 0;
    const eventId = this.recordTacticalEvent({
      side: f.side,
      type: eventType,
      outcome: shotOutcome,
      playerId: f.passerId,
      relatedPlayerId: target?.p.id,
      x: f.fromX,
      y: f.fromY,
      endX: f.toX,
      endY: f.toY,
      pressure,
      qualifier: f.penalty
        ? "penalty"
        : f.movementPattern
          ? `movement:${f.movementPattern}`
          : f.flavor,
      expectedGoals: f.kind === "shot" ? expectedGoalsAt(start.x, start.y, pressure, f.penalty ? "penalty" : undefined) : undefined,
    });
    f.analyticsEventId = eventId;
    if (f.kind !== "shot") this.pendingFlightEventId = eventId;
    if (actor) actor.dribblePlan = null;
    this.flight = f;
    this.ballHeight = 0;
    this.controlledBallVelocity = { x: 0, y: 0 };
    this.looseBallVelocity = { x: 0, y: 0 };
    this.looseDribbleRace = null;
    this.phase = "flight";
    this.carrier = null;
  }

  // -------------------------------------------------------------------------
  // Ball flight resolution
  // -------------------------------------------------------------------------

  private tickFlight(dt: number): void {
    const f = this.flight;
    if (!f) {
      if (this.phase === "flight") this.phase = "open";
      return;
    }
    f.t += dt;
    const t = clamp(f.t / f.dur, 0, 1);
    const arcH = f.arcH ?? (f.kind === "cross" ? 26 : f.kind === "shot" ? 8 : 0);
    this.ballHeight = Math.sin(t * Math.PI) * arcH;
    this.ball.x = f.fromX + (f.toX - f.fromX) * t;
    this.ball.y = f.fromY + (f.toY - f.fromY) * t;

    if (t < 1 && this.tryMidflightInterception(f, t)) return;
    if (t < 1) return;

    const arrived = f;
    this.flight = null;
    this.ballHeight = 0;
    switch (arrived.kind) {
      case "pass":
        this.resolvePassArrival(arrived);
        break;
      case "shot":
        this.resolveShotArrival(arrived);
        break;
      case "cross":
        this.resolveCrossArrival(arrived);
        break;
      case "knockOn":
        this.resolveKnockOnArrival(arrived);
        break;
    }
    if (this.phase === "flight") this.phase = "open";
  }

  /** Ground balls can be cut out anywhere along their path, not only at a
   * pre-selected destination. A defender gets one attempt as the ball enters
   * their physical reach, with reading of play and ball speed both relevant. */
  private tryMidflightInterception(f: Flight, t: number): boolean {
    if (f.kind !== "pass" || t < 0.07 || t > 0.97 || this.ballHeight > 7.5) return false;
    const defenders = this.players(this.other(f.side));
    const challenged = f.challengedIds ?? (f.challengedIds = []);
    const passDistanceM = Math.hypot(f.toX - f.fromX, f.toY - f.fromY) / UNITS_PER_METER;
    const ballSpeed = passDistanceM / Math.max(f.dur, 0.1);

    const candidates = defenders
      .map((sp, idx) => ({ sp, idx, d: Math.hypot(sp.x - this.ball.x, sp.y - this.ball.y) }))
      .filter(({ sp }) => !sp.sentOff && !challenged.includes(sp.p.id))
      .sort((a, b) => a.d - b.d);
    const candidate = candidates[0];
    if (!candidate) return false;
    const trait = hasPlaystyle(candidate.sp.p, PlaystyleTag.Interceptor);
    const reach = 8 + candidate.sp.p.anticipation * 0.45 + candidate.sp.p.interceptions * 0.28 + (trait ? 3 : 0);
    if (candidate.d > reach) return false;
    challenged.push(candidate.sp.p.id);

    const probability = clamp(
      0.17 + candidate.sp.p.interceptions * 0.018 + candidate.sp.p.anticipation * 0.012 +
        (trait ? 0.12 : 0) - Math.max(0, ballSpeed - 12) * 0.024 - this.ballHeight * 0.025,
      0.08,
      0.78,
    );
    if (!this.rng.chance(probability)) return false;

    this.flight = null;
    this.ballHeight = 0;
    this.recordTacticalEvent({
      side: this.other(f.side),
      type: "interception",
      outcome: "won",
      playerId: candidate.sp.p.id,
      relatedPlayerId: f.passerId,
      x: candidate.sp.x,
      y: candidate.sp.y,
    });
    this.addPlayerStat(candidate.sp.p.id, "interceptions");
    this.addPlayerStat(candidate.sp.p.id, "recoveries");
    this.addPlayerStat(f.passerId, "possessionLost");
    this.bumpRating(candidate.sp, 0.055);
    this.giveBallTo(this.other(f.side), candidate.idx);
    return true;
  }

  private resolveKnockOnArrival(f: Flight): void {
    const runnerIdx = f.targetIdx ?? -1;
    const runner = runnerIdx >= 0 ? this.players(f.side)[runnerIdx] : undefined;
    const defending = this.other(f.side);
    const defenderIdx = this.nearestPlayerIndex(defending, f.toX, f.toY);
    const defender = defenderIdx >= 0 ? this.players(defending)[defenderIdx] : undefined;
    const runnerDistance = runner ? Math.hypot(runner.x - f.toX, runner.y - f.toY) : Infinity;
    const defenderDistance = defender ? Math.hypot(defender.x - f.toX, defender.y - f.toY) : Infinity;
    const beatenPenalty = defender?.p.id === f.beatDefenderId ? 20 : 0;
    const runnerEdge = runner
      ? (runner.p.pace + runner.p.acceleration) * 0.42 + (hasPlaystyle(runner.p, PlaystyleTag.PaceAbuser) ? 5 : 0)
      : 0;
    const defenderEdge = defender ? (defender.p.pace + defender.p.acceleration + defender.p.anticipation) * 0.28 : 0;

    if (runner && runnerDistance < 22 && runnerDistance - runnerEdge < defenderDistance - defenderEdge + beatenPenalty) {
      if (f.dribbleAttempt) {
        if (f.side === "home") this.stats.dribblesCompletedHome += 1;
        else this.stats.dribblesCompletedAway += 1;
        this.addPlayerStat(runner.p.id, "dribblesCompleted");
      }
      this.bumpRating(runner, 0.04);
      this.giveBallTo(f.side, runnerIdx);
      return;
    }
    if (defender && defenderDistance < 20 && defenderDistance - defenderEdge < runnerDistance - runnerEdge) {
      this.addPlayerStat(f.passerId, "possessionLost");
      this.addPlayerStat(defender.p.id, "recoveries");
      this.giveBallTo(defending, defenderIdx);
      return;
    }

    // The ball has got there before either runner. It continues rolling and
    // both players keep accelerating into a genuine loose-ball race.
    const dx = f.toX - f.fromX;
    const dy = f.toY - f.fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.makeLoose(f.toX, f.toY, f.side, (dx / d) * 34, (dy / d) * 34);
    this.looseLockSide = null;
    this.looseLockT = 0;
    if (runner) {
      this.looseDribbleRace = { side: f.side, idx: runnerIdx, attempted: Boolean(f.dribbleAttempt) };
    }
  }

  private resolvePassArrival(f: Flight): void {
    const side = f.side;
    const defending = this.other(side);
    if (f.toY <= 0 || f.toY >= PITCH_H) {
      this.addPlayerStat(f.passerId, "possessionLost");
      this.lastTouchSide = side;
      this.startSetPiece("throw", defending, clamp(f.toX, 20, 980), f.toY <= 0 ? 5 : 645);
      return;
    }
    if (f.toX <= 0 || f.toX >= PITCH_W) {
      this.addPlayerStat(f.passerId, "possessionLost");
      this.lastTouchSide = side;
      this.handleBallOutOverGoalLine(side, f.toY);
      return;
    }
    const outcome = f.passOutcome ?? { success: true, intercepted: false };
    const receiverIdx = f.targetIdx !== undefined
      ? this.availableReceiver(side, f.targetIdx, f.toX, f.toY)
      : -1;
    const defenderIdx = this.nearestPlayerIndex(defending, f.toX, f.toY);
    const receiver = receiverIdx >= 0 ? this.players(side)[receiverIdx] : undefined;
    const defender = defenderIdx >= 0 ? this.players(defending)[defenderIdx] : undefined;
    const rd = receiver ? Math.hypot(receiver.x - f.toX, receiver.y - f.toY) : Infinity;
    const dd = defender ? Math.hypot(defender.x - f.toX, defender.y - f.toY) : Infinity;

    if (outcome.success && receiver) {
      // A dropping diagonal/long pass creates an aerial duel. A hard ground
      // ball into contact creates a shoulder-to-shoulder race. Attributes,
      // not nearest-dot determinism, decide both.
      if (defender && dd < 34 && rd < 36 && (f.flavor === "lofted" || f.flavor === "switch")) {
        const winner = resolveAerialDuel(receiver.p, defender.p, this.rng);
        this.addPlayerStat(receiver.p.id, "aerialDuels");
        this.addPlayerStat(defender.p.id, "aerialDuels");
        if (winner === "a") {
          this.addPlayerStat(receiver.p.id, "aerialDuelsWon");
          if (f.countsAsPass !== false) this.statsPassComplete(side, f.passerId);
          this.bumpRating(receiver, 0.035);
          this.giveBallTo(side, receiverIdx);
        } else {
          this.addPlayerStat(defender.p.id, "aerialDuelsWon");
          this.addPlayerStat(defender.p.id, "interceptions");
          this.addPlayerStat(defender.p.id, "recoveries");
          this.addPlayerStat(f.passerId, "possessionLost");
          this.bumpRating(defender, 0.06);
          this.giveBallTo(defending, defenderIdx);
        }
        return;
      }
      if (defender && dd < 22 && rd < 28) {
        const winner = resolveLooseBallDuel(receiver.p, defender.p, this.rng);
        if (winner === "a") {
          if (f.countsAsPass !== false) this.statsPassComplete(side, f.passerId, f.flavor === "pullback");
          this.giveBallTo(side, receiverIdx);
        } else {
          this.addPlayerStat(defender.p.id, "interceptions");
          this.addPlayerStat(defender.p.id, "recoveries");
          this.addPlayerStat(f.passerId, "possessionLost");
          this.bumpRating(defender, 0.04);
          this.giveBallTo(defending, defenderIdx);
        }
        return;
      }
      if (rd < 28) {
        this.receivePass(side, receiverIdx, f);
        return;
      }
    }

    if (outcome.intercepted && defender && dd < 24) {
      this.addPlayerStat(defender.p.id, "interceptions");
      this.addPlayerStat(defender.p.id, "recoveries");
      this.addPlayerStat(f.passerId, "possessionLost");
      this.bumpRating(defender, 0.05);
      this.giveBallTo(defending, defenderIdx);
      return;
    }
    // Bad touch / overhit ball becomes a genuine second-ball contest. Through
    // balls retain forward roll so the intended runner may still win the race.
    const dx = f.toX - f.fromX;
    const dy = f.toY - f.fromY;
    const d = Math.hypot(dx, dy) || 1;
    const roll = f.flavor === "through" ? 25 : 8;
    this.updateTacticalEvent(f.analyticsEventId, "failed");
    if (this.pendingFlightEventId === f.analyticsEventId) this.pendingFlightEventId = null;
    this.addPlayerStat(f.passerId, "possessionLost");
    this.makeLoose(f.toX, f.toY, side, (dx / d) * roll, (dy / d) * roll);
  }

  private receivePass(side: Side, receiverIdx: number, f: Flight): void {
    const receiver = this.players(side)[receiverIdx];
    if (!receiver) return;
    const passDistanceM = Math.hypot(f.toX - f.fromX, f.toY - f.fromY) / UNITS_PER_METER;
    const speedMps = passDistanceM / Math.max(f.dur, 0.1);
    const nearest = this.nearestOpponentDist(side, receiver.x, receiver.y);
    const pressure = clamp((5.5 - nearest) / 5.5, 0, 1);
    const firstTouchTrait = hasPlaystyle(receiver.p, PlaystyleTag.FirstTouchSpecialist);
    const controlProbability = clamp(
      0.6 + receiver.p.ballControl * 0.016 + receiver.p.technique * 0.009 +
        receiver.p.composure * 0.005 + (firstTouchTrait ? 0.11 : 0) -
        Math.max(0, speedMps - 13) * 0.018 - pressure * 0.17 - this.ballHeight * 0.006,
      0.42,
      0.97,
    );
    if (this.rng.chance(controlProbability)) {
      this.addPlayerStat(receiver.p.id, "touches");
      if (f.countsAsPass !== false) this.statsPassComplete(side, f.passerId, f.flavor === "pullback");
      this.giveBallTo(side, receiverIdx);
      return;
    }

    this.addPlayerStat(receiver.p.id, "touches");
    this.addPlayerStat(receiver.p.id, "possessionLost");
    this.updateTacticalEvent(f.analyticsEventId, "failed", receiver.p.id);
    if (this.pendingFlightEventId === f.analyticsEventId) this.pendingFlightEventId = null;
    // A failed first touch visibly escapes 1.5–4 metres. It can still be
    // recovered; there is no instantaneous dice-roll turnover.
    const dx = f.toX - f.fromX;
    const dy = f.toY - f.fromY;
    const d = Math.hypot(dx, dy) || 1;
    const escape = this.rng.float(16, 41);
    const ex = clamp(receiver.x + (dx / d) * escape + this.rng.float(-8, 8), 3, 997);
    const ey = clamp(receiver.y + (dy / d) * escape + this.rng.float(-8, 8), 3, 647);
    this.makeLoose(ex, ey, side, (dx / d) * 18, (dy / d) * 18);
  }

  private availableReceiver(side: Side, preferred: number, x: number, y: number): number {
    const p = this.players(side)[preferred];
    if (p && !p.sentOff && Math.hypot(p.x - x, p.y - y) < 150) return preferred;
    const nearest = this.nearestPlayerIndex(side, x, y);
    const n = nearest >= 0 ? this.players(side)[nearest] : undefined;
    return n && Math.hypot(n.x - x, n.y - y) < 115 ? nearest : -1;
  }

  private resolveShotArrival(f: Flight): void {
    const outcome = f.shotOutcome!;
    const attacking = f.side;
    const defending = this.other(attacking);

    if (outcome.goal) {
      const scorer = f.passerId
        ? this.players(attacking).find((player) => player.p.id === f.passerId)
        : undefined;
      this.awardGoal(attacking, scorer);
      return;
    }
    if (outcome.saved) {
      let gkIdx = this.players(defending).findIndex((p) => p.role === "GK");
      if (gkIdx < 0) gkIdx = this.nearestPlayerIndex(defending, f.toX, f.toY);
      const gk = this.players(defending)[gkIdx];
      if (gk) {
        const shotEvent = this.tacticalEvents.find((event) => event.id === f.analyticsEventId);
        if (shotEvent) shotEvent.relatedPlayerId = gk.p.id;
        this.recordTacticalEvent({
          side: defending,
          type: "save",
          outcome: "won",
          playerId: gk.p.id,
          relatedPlayerId: f.passerId,
          x: gk.x,
          y: gk.y,
        });
        this.addPlayerStat(gk.p.id, "saves");
        this.addPlayerStat(gk.p.id, "recoveries");
        this.bumpRating(gk, 0.25);
        if (!f.penalty) {
          this.pushEvent(
            MatchEventType.ShotSaved,
            gk.p.contract.clubId,
            gk.p.id,
            `Great save by ${gk.p.firstName} ${gk.p.lastName}!`,
          );
        }
        const holdProbability = clamp(0.3 + gk.p.handling * 0.025 + gk.p.composure * 0.008, 0.4, 0.9);
        if (!this.rng.chance(holdProbability)) {
          this.lastTouchSide = defending;
          // Some hard saves are tipped around the post; others rebound into a
          // live area which both teams were already positioned to attack.
          if (!f.penalty && this.rng.chance(0.52)) {
            this.startSetPiece("corner", attacking, this.goalX(attacking), f.toY < 325 ? 5 : 645);
            return;
          }
          const dir = this.attackDir(attacking);
          this.makeLoose(
            clamp(f.toX - dir * this.rng.float(28, 72), 5, 995),
            clamp(f.toY + this.rng.float(-45, 45), 8, 642),
            defending,
            -dir * this.rng.float(24, 52),
            this.rng.float(-24, 24),
          );
          return;
        }
      }
      this.giveBallTo(defending, Math.max(gkIdx, 0));
      return;
    }
    if (outcome.blocked) {
      const blockerIdx = this.nearestPlayerIndex(defending, f.toX, f.toY);
      const blocker = blockerIdx >= 0 ? this.players(defending)[blockerIdx] : undefined;
      this.addPlayerStat(blocker?.p.id, "blocks");
      this.lastTouchSide = defending;
      const nearGoalLine = Math.abs(this.goalX(attacking) - f.toX) < 115;
      if (nearGoalLine && this.rng.chance(0.38)) {
        this.startSetPiece("corner", attacking, this.goalX(attacking), f.toY < 325 ? 5 : 645);
        return;
      }
      const dx = f.toX - f.fromX;
      const dy = f.toY - f.fromY;
      const d = Math.hypot(dx, dy) || 1;
      this.makeLoose(
        f.toX,
        f.toY,
        defending,
        -(dx / d) * this.rng.float(18, 45) + this.rng.float(-18, 18),
        -(dy / d) * this.rng.float(18, 45) + this.rng.float(-22, 22),
      );
      return;
    }
    // wide
    const shooter = f.passerId
      ? this.players(attacking).find((p) => p.p.id === f.passerId)
      : undefined;
    this.pushEvent(
      MatchEventType.ShotWide,
      this.team(attacking).clubId,
      shooter?.p.id,
      shooter ? `${shooter.p.firstName} ${shooter.p.lastName} fires wide` : "Shot wide",
    );
    this.handleBallOutOverGoalLine(attacking, f.toY);
  }

  private resolveCrossArrival(f: Flight): void {
    const attacking = f.side;
    const defending = this.other(attacking);
    const att = this.bestAt(attacking, f.toX, f.toY, (p) => p.heading + p.jumping);
    const def = this.bestAt(defending, f.toX, f.toY, (p) => p.aerialDuels + p.heading);
    if (!att || !def) {
      this.addPlayerStat(f.passerId, "possessionLost");
      const idx = this.nearestPlayerIndex(defending, f.toX, f.toY);
      const nearest = idx >= 0 ? this.players(defending)[idx] : undefined;
      const nearestDistance = nearest ? Math.hypot(nearest.x - f.toX, nearest.y - f.toY) : Infinity;
      if (nearest && nearestDistance < 50 && this.rng.chance(0.3)) {
        this.lastTouchSide = defending;
        this.startSetPiece("corner", attacking, this.goalX(attacking), f.toY < 325 ? 5 : 645);
      } else if (nearest && nearestDistance < 22) {
        this.giveBallTo(defending, idx);
      } else {
        this.makeLoose(f.toX, f.toY, attacking, -this.attackDir(attacking) * 14, this.rng.float(-18, 18));
      }
      return;
    }
    const gk = this.players(defending).find((p) => p.role === "GK") ?? def;
    const danger = clamp(1 - Math.abs(f.toX - this.goalX(attacking)) / 400, 0.2, 1);
    const res = resolveHeader(att.p, def.p, gk.p, danger, this.rng);
    this.addPlayerStat(att.p.id, "aerialDuels");
    this.addPlayerStat(def.p.id, "aerialDuels");
    if (!res.cleared) {
      this.addPlayerStat(att.p.id, "aerialDuelsWon");
      this.statsPassComplete(attacking, f.passerId, true);
      this.updateTacticalEvent(f.analyticsEventId, "complete", att.p.id);
      if (this.pendingFlightEventId === f.analyticsEventId) this.pendingFlightEventId = null;
      this.recordShot(attacking, att.p.id, res.goal || res.saved);
      const shotPoint = this.orientedPoint(attacking, att.x, att.y);
      this.recordTacticalEvent({
        side: attacking,
        type: "shot",
        outcome: res.goal ? "goal" : res.saved ? "saved" : "wide",
        playerId: att.p.id,
        relatedPlayerId: res.saved ? gk.p.id : undefined,
        x: att.x,
        y: att.y,
        endX: this.goalX(attacking),
        endY: PITCH_H / 2,
        pressure: 0.55,
        qualifier: "header",
        expectedGoals: expectedGoalsAt(shotPoint.x, shotPoint.y, 0.55),
      });
    } else {
      this.addPlayerStat(def.p.id, "aerialDuelsWon");
      this.addPlayerStat(def.p.id, "clearances");
      this.addPlayerStat(f.passerId, "possessionLost");
    }

    if (res.goal) {
      this.bumpRating(att, 0.3);
      this.awardGoal(attacking, att);
      return;
    }
    if (res.saved) {
      this.addPlayerStat(gk.p.id, "saves");
      this.addPlayerStat(gk.p.id, "recoveries");
      this.giveBallTo(defending, this.players(defending).indexOf(gk));
      this.bumpRating(gk, 0.25);
      this.pushEvent(
        MatchEventType.ShotSaved,
        gk.p.contract.clubId,
        gk.p.id,
        `${gk.p.firstName} ${gk.p.lastName} punches it clear!`,
      );
      return;
    }
    if (res.cleared) {
      this.lastTouchSide = defending;
      if (Math.abs(this.goalX(attacking) - f.toX) < 135 && this.rng.chance(0.48)) {
        this.startSetPiece("corner", attacking, this.goalX(attacking), f.toY < 325 ? 5 : 645);
        return;
      }
      const clearDir = -this.attackDir(attacking);
      this.makeLoose(
        f.toX,
        f.toY,
        defending,
        clearDir * this.rng.float(35, 75),
        this.rng.float(-65, 65),
      );
      return;
    }
    this.makeLoose(f.toX, f.toY, attacking);
  }

  private bestAt(side: Side, x: number, y: number, score: (p: Player) => number): SimPlayer | null {
    let best: SimPlayer | null = null;
    let bestScore = -1;
    for (const sp of this.players(side)) {
      if (sp.sentOff || sp.role === "GK") continue;
      const d = Math.hypot(sp.x - x, sp.y - y);
      if (d > 45) continue;
      const s = score(sp.p) - d * 0.05;
      if (s > bestScore) {
        bestScore = s;
        best = sp;
      }
    }
    return best;
  }

  private nearestPlayerIndex(side: Side, x: number, y: number): number {
    let best = -1;
    let bestD = Infinity;
    this.players(side).forEach((sp, i) => {
      if (sp.sentOff) return;
      const d = Math.hypot(sp.x - x, sp.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private giveBallTo(side: Side, idx: number): void {
    const previousCarrier = this.carrier
      ? this.players(this.carrier.side)[this.carrier.i]
      : undefined;
    if (previousCarrier) previousCarrier.dribblePlan = null;
    const p = this.players(side)[idx];
    if (!p || p.sentOff) {
      this.makeLoose(this.ball.x, this.ball.y, side);
      return;
    }
    this.finalizePendingFlight(side, p.p.id);
    if (this.possessionSide !== side) {
      this.possessionId += 1;
      this.sequenceIndex = 0;
      this.lastTurnover = { side, t: this.worldTime };
      this.recordTacticalEvent({
        side,
        type: "recovery",
        outcome: "won",
        playerId: p.p.id,
        x: p.x,
        y: p.y,
      });
    }
    if (this.looseDribbleRace && this.looseDribbleRace.side !== side) {
      const runner = this.players(this.looseDribbleRace.side)[this.looseDribbleRace.idx];
      this.addPlayerStat(runner?.p.id, "possessionLost");
      this.addPlayerStat(p.p.id, "recoveries");
    }
    if (this.looseDribbleRace?.side === side && this.looseDribbleRace.idx === idx) {
      if (this.looseDribbleRace.attempted) {
        if (side === "home") this.stats.dribblesCompletedHome += 1;
        else this.stats.dribblesCompletedAway += 1;
        this.addPlayerStat(p.p.id, "dribblesCompleted");
      }
      this.bumpRating(p, 0.04);
    }
    this.looseDribbleRace = null;
    this.carrier = { side, i: idx };
    p.dribblePlan = null;
    this.possessionSide = side;
    this.lastTouchSide = side;
    this.flight = null;
    this.phase = "open";
    this.carrierSince = this.worldTime;
    this.decisionCd = this.shouldClearImmediately(side, p)
      ? 0
      : this.decisionDelay(side, p);
    this.ball.x = p.x;
    this.ball.y = p.y;
    this.ballHeight = 0;
    this.controlledBallVelocity = { x: 0, y: 0 };
    this.controlledBallTarget = { x: p.x, y: p.y };
    this.looseBallVelocity = { x: 0, y: 0 };
    p.nextTouchAt = this.worldTime;
    this.looseLockSide = null;
  }

  /** `lockSide` is the side that last lost/touched the ball and cannot reclaim
   * it for a fraction of a second; this prevents instant ping-pong rebounds. */
  private makeLoose(x: number, y: number, lockSide: Side, vx = 0, vy = 0): void {
    if (this.carrier) this.players(this.carrier.side)[this.carrier.i].dribblePlan = null;
    this.carrier = null;
    this.flight = null;
    this.phase = "open";
    this.ball.x = clamp(x, 3, PITCH_W - 3);
    this.ball.y = clamp(y, 3, PITCH_H - 3);
    this.ballHeight = 0;
    this.controlledBallVelocity = { x: 0, y: 0 };
    this.looseBallVelocity = { x: vx, y: vy };
    this.looseLockSide = lockSide;
    this.looseLockT = 0.22;
  }

  private tickLooseBall(dt: number): void {
    this.ball.x += this.looseBallVelocity.x * dt;
    this.ball.y += this.looseBallVelocity.y * dt;
    const friction = Math.exp(-2.6 * dt);
    this.looseBallVelocity.x *= friction;
    this.looseBallVelocity.y *= friction;
    if (Math.hypot(this.looseBallVelocity.x, this.looseBallVelocity.y) < 3) {
      this.looseBallVelocity = { x: 0, y: 0 };
    }
    this.checkBounds();
    if (this.phase !== "open") return;

    const chase = (side: Side) => {
      const idx = this.nearestPlayerIndex(side, this.ball.x, this.ball.y);
      const sp = idx >= 0 ? this.players(side)[idx] : undefined;
      if (sp) {
        // tickMovement performs the actual chase exactly once this frame.
        sp.tx = this.ball.x;
        sp.ty = this.ball.y;
      }
      return { side, idx, sp, d: sp ? Math.hypot(sp.x - this.ball.x, sp.y - this.ball.y) : Infinity };
    };
    const h = chase("home");
    const a = chase("away");
    const available = [h, a].filter((c) => c.sp && !(this.looseLockT > 0 && c.side === this.looseLockSide));
    const close = available.filter((c) => c.d < 21);

    if (close.length === 2 && close[0].sp && close[1].sp) {
      let winner = resolveLooseBallDuel(close[0].sp.p, close[1].sp.p, this.rng);
      // Being clearly first to the ball matters, but anticipation/pace can
      // overcome a small positional disadvantage.
      if (Math.abs(close[0].d - close[1].d) > 8) winner = close[0].d < close[1].d ? "a" : "b";
      const won = winner === "a" ? close[0] : close[1];
      const lost = winner === "a" ? close[1] : close[0];
      this.bumpRating(won.sp, 0.025);
      if (won.sp && lost.sp && resolveHoldOff(won.sp.p, lost.sp.p, this.rng)) {
        this.giveBallTo(won.side, won.idx);
        return;
      }
      // Ball squirts a few metres from a 50/50 rather than sticking to a dot.
      this.looseBallVelocity = {
        x: this.rng.float(-70, 70),
        y: this.rng.float(-70, 70),
      };
      this.looseLockSide = lost.side;
      this.looseLockT = 0.15;
    } else if (close.length === 1 && close[0].sp) {
      const c = close[0];
      const player = c.sp!;
      const nearestPressure = c.side === "home" ? a.d : h.d;
      const control = clamp(
        0.42 + player.p.ballControl * 0.022 + player.p.anticipation * 0.012 + Math.min(0.18, nearestPressure / 300),
        0.38,
        0.95,
      );
      if (this.rng.chance(control)) {
        this.giveBallTo(c.side, c.idx);
        return;
      }
      this.looseLockSide = c.side;
      this.looseLockT = 0.12;
    }
    this.checkBounds();
  }

  // -------------------------------------------------------------------------
  // Tackles & fouls
  // -------------------------------------------------------------------------

  private tickTackles(): void {
    if (!this.carrier) return;
    const side = this.carrier.side;
    const sp = this.players(side)[this.carrier.i];
    if (!sp || sp.role === "GK") return;
    const carrierDir = this.directives(side, sp);

    const challengeDistance = (op: SimPlayer) => Math.min(
      Math.hypot(op.x - sp.x, op.y - sp.y),
      Math.hypot(op.x - this.ball.x, op.y - this.ball.y),
    );
    const challengers = this.players(this.other(side))
      .filter((op) => !op.sentOff && op.tackleCd <= 0)
      .sort((a, b) => challengeDistance(a) - challengeDistance(b));

    for (const op of challengers) {
      const opDir = this.directives(this.other(side), op);
      const d = challengeDistance(op) / UNITS_PER_METER;
      // A standing challenge needs genuine contact distance. Pressure may
      // influence a decision from several metres away, but cannot magically
      // tackle through the receiver's first touch.
      const reach = opDir.pressHard ? 2.15 : 1.85;
      if (d > reach) break;

      op.tackleCd = this.rng.float(opDir.pressHard ? 0.7 : 1.0, opDir.pressHard ? 1.35 : 1.9);

      // Before a tackle, contact can become a physical shielding duel. Strong
      // target players protect it; powerful defenders can still roll them.
      const targetManStyle = carrierDir.targetMan || hasPlaystyle(sp.p, PlaystyleTag.TargetMan);
      const shielding = targetManStyle || sp.p.strength + sp.p.balance > 28;
      if (shielding && this.rng.chance(targetManStyle ? 0.54 : 0.28)) {
        if (resolveHoldOff(sp.p, op.p, this.rng)) {
          this.bumpRating(sp, 0.02);
          this.installDribblePlan(side, sp, op.p.id);
          sp.runUntil = Math.max(sp.runUntil, this.worldTime + 0.6);
          return;
        }
      }

      this.statsTackleAttempt(this.other(side), op.p.id);
      const res = resolveTackle(op.p, sp.p, this.rng);
      this.recordTacticalEvent({
        side: this.other(side),
        type: "tackle",
        outcome: res.won ? "won" : res.foul ? "foul" : "failed",
        playerId: op.p.id,
        relatedPlayerId: sp.p.id,
        x: op.x,
        y: op.y,
      });
      if (res.won) {
        const defending = this.other(side);
        this.addPlayerStat(op.p.id, "tacklesWon");
        this.addPlayerStat(op.p.id, "recoveries");
        this.addPlayerStat(sp.p.id, "possessionLost");
        const nearDefendingGoal = Math.abs(op.x - this.ownGoalX(defending)) < 175;
        if (nearDefendingGoal && this.rng.chance(0.2)) {
          this.lastTouchSide = defending;
          this.startSetPiece("corner", side, this.goalX(side), sp.y < 325 ? 5 : 645);
          this.bumpRating(op, 0.08);
          return;
        }
        this.giveBallTo(defending, this.indexOfPlayer(defending, op));
        this.bumpRating(op, 0.14);
        this.bumpRating(sp, -0.04);
        return;
      }
      if (res.foul) {
        this.awardFoul(side, op, sp, res.card);
        return;
      }
      // Failed standing challenge: attacker exits around the wrong-footed
      // defender, with cover players still able to recover into the route.
      this.installDribblePlan(side, sp, op.p.id);
      sp.runUntil = Math.max(sp.runUntil, this.worldTime + 0.9);
      this.bumpRating(op, -0.03);
      return;
    }
  }

  private awardFoul(
    fouledSide: Side,
    offender: SimPlayer,
    victim: SimPlayer,
    card: "none" | "yellow" | "red" = "none",
  ): void {
    const foulSide = this.other(fouledSide);
    this.statsFoul(foulSide);
    this.recordTacticalEvent({
      side: foulSide,
      type: "foul",
      outcome: "foul",
      playerId: offender.p.id,
      relatedPlayerId: victim.p.id,
      x: offender.x,
      y: offender.y,
    });
    this.addPlayerStat(offender.p.id, "foulsCommitted");
    this.addPlayerStat(victim.p.id, "foulsWon");
    this.bumpRating(offender, -0.12);

    let shown: "none" | "yellow" | "red" = card;
    if (shown === "yellow" && offender.yellow) shown = "red";
    if (shown !== "none") {
      this.bumpRating(offender, shown === "red" ? -0.8 : -0.3);
      if (shown === "yellow") offender.yellow = true;
      if (shown === "red") offender.sentOff = true;
      this.pushEvent(
        shown === "red" ? MatchEventType.RedCard : MatchEventType.YellowCard,
        offender.p.contract.clubId,
        offender.p.id,
        `${shown === "red" ? "RED CARD" : "Yellow card"} — ${offender.p.firstName} ${offender.p.lastName}`,
      );
    }

    // Foul by the defending side inside its own penalty area => penalty
    if (this.insidePenaltyArea(victim.x, victim.y, foulSide)) {
      this.pushEvent(
        MatchEventType.Chance,
        this.players(fouledSide)[0]?.p.contract.clubId,
        undefined,
        "PENALTY!",
      );
      this.startPenalty(fouledSide);
      return;
    }

    this.pushEvent(
      MatchEventType.Foul,
      offender.p.contract.clubId,
      offender.p.id,
      `Free kick — ${victim.p.firstName} ${victim.p.lastName} fouled`,
    );
    this.startSetPiece("freeKick", fouledSide, victim.x, victim.y);
  }

  /** is (x,y) inside the penalty area defended by `side` */
  private insidePenaltyArea(x: number, y: number, side: Side): boolean {
    const inY = y > 124 && y < 526;
    if (!inY) return false;
    if (side === "home") return x < 165;
    return x > 835;
  }

  private statsFoul(side: Side): void {
    if (side === "home") this.stats.foulsHome += 1;
    else this.stats.foulsAway += 1;
  }

  private recordShot(side: Side, playerId: string | undefined, onTarget: boolean): void {
    if (side === "home") {
      this.stats.shotsHome += 1;
      if (onTarget) this.stats.shotsOnTargetHome += 1;
    } else {
      this.stats.shotsAway += 1;
      if (onTarget) this.stats.shotsOnTargetAway += 1;
    }
    this.addPlayerStat(playerId, "shots");
    this.addPlayerStat(playerId, "touches");
    if (onTarget) this.addPlayerStat(playerId, "shotsOnTarget");
    if (
      this.assistWindow?.side === side &&
      this.assistWindow.playerId !== playerId &&
      this.worldTime - this.assistWindow.t < 10
    ) {
      this.addPlayerStat(this.assistWindow.playerId, "keyPasses");
    }
  }

  private statsPassAttempt(side: Side, playerId?: string): void {
    if (side === "home") this.stats.passesAttemptedHome += 1;
    else this.stats.passesAttemptedAway += 1;
    this.addPlayerStat(playerId, "passesAttempted");
  }

  private statsPassComplete(side: Side, playerId?: string, cross = false): void {
    if (side === "home") this.stats.passesCompletedHome += 1;
    else this.stats.passesCompletedAway += 1;
    this.addPlayerStat(playerId, "passesCompleted");
    if (cross) this.addPlayerStat(playerId, "crossesCompleted");
  }

  // -------------------------------------------------------------------------
  // Set pieces
  // -------------------------------------------------------------------------

  private selectedTakerIndex(
    side: Side,
    kind: SetPiece["kind"] | "penalty",
    x: number,
    y: number,
  ): number {
    const team = this.team(side);
    const setPieces = team.tactics.setPieces ?? {
      cornerLeftId: null,
      cornerRightId: null,
      freeKickId: null,
      penaltyId: null,
      captainId: null,
    };
    const selectedId =
      kind === "corner" ? (y < PITCH_H / 2 ? setPieces.cornerLeftId : setPieces.cornerRightId) :
      kind === "freeKick" ? setPieces.freeKickId :
      kind === "penalty" ? setPieces.penaltyId : null;
    if (selectedId) {
      const selected = this.players(side).findIndex((p) => p.p.id === selectedId && !p.sentOff);
      if (selected >= 0) return selected;
    }
    if (kind === "goalKick") {
      const keeper = this.players(side).findIndex((p) => p.role === "GK" && !p.sentOff);
      if (keeper >= 0) return keeper;
    }
    if (kind === "throw") {
      const candidates = this.players(side)
        .map((p, idx) => ({ p, idx, d: Math.hypot(p.x - x, p.y - y) }))
        .filter(({ p }) => !p.sentOff && p.role !== "GK")
        .sort((a, b) => a.d - b.d);
      if (candidates[0]) return candidates[0].idx;
    }
    let best = -1;
    let bestScore = -Infinity;
    this.players(side).forEach((sp, idx) => {
      if (sp.sentOff || sp.role === "GK") return;
      const score =
        kind === "corner" ? sp.p.crossing * 2 + sp.p.technique + (hasPlaystyle(sp.p, PlaystyleTag.Crosser) ? 8 : 0) :
        kind === "freeKick" ? sp.p.freeKickAccuracy * 2 + sp.p.technique + sp.p.longShots * 0.4 :
        kind === "penalty" ? sp.p.penaltyTaking * 2 + sp.p.composure + (hasPlaystyle(sp.p, PlaystyleTag.SetPieceSpecialist) ? 8 : 0) :
        -Math.hypot(sp.x - x, sp.y - y) * 0.1;
      if (score > bestScore) { bestScore = score; best = idx; }
    });
    return best >= 0 ? best : this.nearestPlayerIndex(side, x, y);
  }

  private startSetPiece(kind: SetPiece["kind"], side: Side, x: number, y: number): void {
    this.finalizePendingFlight(side);
    if (this.possessionSide !== side) {
      this.possessionId += 1;
      this.sequenceIndex = 0;
    }
    const sx = clamp(x, 5, 995);
    const sy = clamp(y, 5, 645);
    this.phase = "setpiece";
    this.carrier = null;
    this.flight = null;
    this.looseDribbleRace = null;
    this.setPiece = {
      kind,
      side,
      x: sx,
      y: sy,
      timer: kind === "corner" ? 4.1 : kind === "freeKick" ? 3.5 : kind === "goalKick" ? 3 : 2.4,
      takerIdx: this.selectedTakerIndex(side, kind, sx, sy),
    };
    this.ball.x = sx;
    this.ball.y = sy;
    this.ballHeight = 0;
    this.possessionSide = side;
    this.lastTouchSide = side;

    const clubId = this.team(side).clubId;
    if (kind === "corner") {
      if (side === "home") this.stats.cornersHome += 1;
      else this.stats.cornersAway += 1;
      this.pushEvent(MatchEventType.Corner, clubId, undefined, `Corner to ${this.team(side).shortName}`);
    } else if (kind === "throw") {
      if (side === "home") this.stats.throwInsHome += 1;
      else this.stats.throwInsAway += 1;
      this.pushEvent(MatchEventType.ThrowIn, clubId, undefined, `Throw-in to ${this.team(side).shortName}`);
    } else if (kind === "goalKick") {
      this.pushEvent(MatchEventType.GoalKick, clubId, undefined, `Goal kick to ${this.team(side).shortName}`);
    } else {
      this.pushEvent(MatchEventType.FreeKick, clubId, undefined, `Free kick to ${this.team(side).shortName}`);
    }
  }

  private tickSetPiece(dt: number): void {
    const sp = this.setPiece;
    if (!sp) {
      this.phase = "open";
      return;
    }
    sp.timer -= dt;
    this.ball.x = sp.x;
    this.ball.y = sp.y;
    this.ballHeight = 0;

    if (sp.timer <= 0) {
      this.executeSetPiece(sp);
      this.setPiece = null;
    }
  }

  private setPiecePosition(piece: SetPiece, playerSide: Side, index: number): { x: number; y: number; intensity: number } {
    const players = this.players(playerSide);
    const player = players[index];
    const attacking = playerSide === piece.side;
    const dir = this.attackDir(piece.side);
    const goalX = this.goalX(piece.side);
    const ownGoalX = this.ownGoalX(piece.side);
    const base = this.team(playerSide).basePositions[index] ?? { x: 500, y: 325 };
    if (!player) return { ...base, intensity: 0.45 };

    if (attacking && index === piece.takerIdx) {
      const behind = piece.kind === "throw" ? 0 : 10;
      return {
        x: clamp(piece.x - dir * behind, 5, 995),
        y: clamp(piece.kind === "throw" ? (piece.y < 325 ? 8 : 642) : piece.y, 5, 645),
        intensity: 0.52,
      };
    }

    const attackingOutfield = this.players(piece.side)
      .map((p, idx) => ({ p, idx, aerial: p.p.heading + p.p.jumping + p.p.offTheBall }))
      .filter(({ p, idx }) => !p.sentOff && p.role !== "GK" && idx !== piece.takerIdx)
      .sort((a, b) => b.aerial - a.aerial);
    const defendingSide = this.other(piece.side);
    const defendingOutfield = this.players(defendingSide)
      .map((p, idx) => ({ p, idx, aerial: p.p.aerialDuels + p.p.heading + p.p.marking }))
      .filter(({ p }) => !p.sentOff && p.role !== "GK")
      .sort((a, b) => b.aerial - a.aerial);

    if (piece.kind === "corner") {
      const zones = [
        { x: goalX - dir * 62, y: 275 },
        { x: goalX - dir * 78, y: 370 },
        { x: goalX - dir * 112, y: 225 },
        { x: goalX - dir * 118, y: 430 },
        { x: goalX - dir * 155, y: 325 },
        { x: goalX - dir * 225, y: 325 },
      ];
      if (attacking) {
        if (player.role === "GK") return { ...base, intensity: 0.38 };
        const rank = attackingOutfield.findIndex((x) => x.idx === index);
        const zone = zones[Math.max(0, Math.min(rank, zones.length - 1))];
        return { x: zone.x, y: zone.y, intensity: rank < 5 ? 0.82 : 0.55 };
      }
      if (player.role === "GK") {
        return { x: goalX - dir * 24, y: 325 + (piece.y < 325 ? -8 : 8), intensity: 0.66 };
      }
      const rank = defendingOutfield.findIndex((x) => x.idx === index);
      const zone = zones[Math.max(0, Math.min(rank, zones.length - 1))];
      return {
        x: clamp(zone.x + dir * (rank < 5 ? 12 : -55), 12, 988),
        y: clamp(zone.y + (rank % 2 ? 10 : -10), 20, 630),
        intensity: rank < 6 ? 0.82 : 0.55,
      };
    }

    if (piece.kind === "freeKick") {
      const distanceM = Math.abs(goalX - piece.x) / UNITS_PER_METER;
      if (!attacking && player.role === "GK") {
        return { x: goalX - dir * 27, y: clamp(325 + (piece.y - 325) * 0.22, 255, 395), intensity: 0.68 };
      }
      if (distanceM < 34 && !attacking) {
        const rank = defendingOutfield.findIndex((x) => x.idx === index);
        if (rank >= 0 && rank < 4) {
          const wallX = piece.x + dir * 92;
          const lineY = piece.y + (325 - piece.y) * 0.3;
          return { x: wallX, y: lineY + (rank - 1.5) * 20, intensity: 0.76 };
        }
      }
      if (attacking) {
        if (player.role === "GK") return { ...base, intensity: 0.38 };
        const rank = attackingOutfield.findIndex((x) => x.idx === index);
        const x = rank < 5 ? goalX - dir * (72 + (rank % 3) * 34) : piece.x - dir * 85;
        const y = rank < 5 ? 205 + (rank % 4) * 75 : 325 + (rank % 2 ? 1 : -1) * 120;
        return { x: clamp(x, 15, 985), y: clamp(y, 25, 625), intensity: 0.78 };
      }
      const rank = defendingOutfield.findIndex((x) => x.idx === index);
      const mark = attackingOutfield[Math.max(0, Math.min(rank, attackingOutfield.length - 1))]?.p;
      if (mark) return { x: mark.x + dir * 18, y: mark.y, intensity: 0.72 };
    }

    if (piece.kind === "throw") {
      const inward = piece.y < 325 ? 1 : -1;
      if (attacking) {
        if (player.role === "GK") return { ...base, intensity: 0.38 };
        const rank = attackingOutfield.findIndex((x) => x.idx === index);
        if (rank < 3) {
          return {
            x: clamp(piece.x + dir * ([35, 80, -45][rank] ?? 0), 15, 985),
            y: clamp(piece.y + inward * ([42, 88, 125][rank] ?? 80), 15, 635),
            intensity: 0.75,
          };
        }
      } else if (player.role !== "GK") {
        const rank = defendingOutfield.findIndex((x) => x.idx === index);
        if (rank < 3) {
          return {
            x: clamp(piece.x + dir * ([40, 84, -38][rank] ?? 0), 15, 985),
            y: clamp(piece.y + inward * ([48, 96, 132][rank] ?? 90), 15, 635),
            intensity: 0.72,
          };
        }
      }
    }

    if (piece.kind === "goalKick") {
      if (attacking) {
        if (player.role === "GK") return { x: piece.x, y: piece.y, intensity: 0.48 };
        const role = player.role;
        if (role === "CB") return { x: ownGoalX + dir * 145, y: index % 2 ? 205 : 445, intensity: 0.62 };
        if (["RB", "LB", "RWB", "LWB"].includes(role)) {
          return { x: ownGoalX + dir * 205, y: base.y < 325 ? 55 : 595, intensity: 0.66 };
        }
        if (["CM", "CDM", "DM"].includes(role)) return { x: ownGoalX + dir * 340, y: base.y, intensity: 0.62 };
      } else {
        // Opponents occupy passing lanes according to their press rather than
        // standing on top of the goalkeeper before the kick is taken.
        const press = this.team(playerSide).tactics.pressing ?? PressingIntensity.Standard;
        const shift = press >= PressingIntensity.High ? 105 : press === PressingIntensity.None ? -30 : 45;
        return { x: clamp(base.x - dir * shift, 15, 985), y: base.y, intensity: 0.58 };
      }
    }

    return { x: clamp(base.x, 12, 988), y: clamp(base.y, 12, 638), intensity: 0.5 };
  }

  private penaltyPosition(side: Side, index: number): { x: number; y: number; intensity: number } | null {
    const state = this.penaltyState;
    if (!state) return null;
    const attacking = side === state.side;
    const player = this.players(side)[index];
    if (!player) return null;
    const dir = this.attackDir(state.side);
    const goalX = this.goalX(state.side);
    const spotX = state.side === "home" ? 890 : 110;
    if (attacking && index === state.takerIdx) {
      return { x: spotX - dir * 16, y: 325, intensity: 0.48 };
    }
    if (!attacking && player.role === "GK") {
      return { x: goalX - dir * 18, y: 325, intensity: 0.62 };
    }
    // Everyone else must be outside the area and behind the penalty mark, but
    // staggered so both teams can attack a rebound after the kick.
    const active = this.players(side).filter((p) => !p.sentOff && p.role !== "GK" && p !== this.players(state.side)[state.takerIdx]);
    const rank = Math.max(0, active.indexOf(player));
    const x = goalX - dir * (185 + (rank % 3) * 18);
    const y = 145 + (rank % 6) * 72;
    return { x: clamp(x, 20, 980), y: clamp(y, 35, 615), intensity: 0.7 };
  }

  private executeSetPiece(sp: SetPiece): void {
    const side = sp.side;
    const dir = this.attackDir(side);
    const goalX = this.goalX(side);
    const distToGoal = Math.abs(goalX - sp.x) / UNITS_PER_METER;
    const team = side === "home" ? this.home : this.away;
    const takerIdx = sp.takerIdx;
    const taker = takerIdx >= 0 ? this.players(side)[takerIdx] : undefined;

    if (sp.kind === "throw") {
      if (!taker) {
        this.makeLoose(sp.x, sp.y, this.other(side));
        return;
      }
      const options = this.players(side)
        .map((p, idx) => ({ p, idx, d: Math.hypot(p.x - sp.x, p.y - sp.y), open: this.nearestOpponentDist(side, p.x, p.y) }))
        .filter(({ p, idx, d }) => idx !== takerIdx && !p.sentOff && p.role !== "GK" && d < 190)
        .sort((a, b) => (b.open * 12 - b.d * 0.04) - (a.open * 12 - a.d * 0.04));
      const target = options[0];
      if (!target) {
        this.makeLoose(sp.x, sp.y, this.other(side));
        return;
      }
      const toX = clamp(target.p.x + target.p.vx * 0.28, 10, 990);
      const toY = clamp(target.p.y + target.p.vy * 0.28, 10, 640);
      const distM = Math.hypot(toX - sp.x, toY - sp.y) / UNITS_PER_METER;
      const accurate = this.rng.chance(clamp(0.72 + taker.p.strength * 0.008 + taker.p.decisions * 0.006, 0.72, 0.94));
      this.addPlayerStat(taker.p.id, "touches");
      this.launchFlight({
        kind: "pass",
        fromX: sp.x,
        fromY: sp.y,
        toX,
        toY,
        t: 0,
        dur: clamp(distM / this.rng.float(8, 12), 0.35, 1.6),
        side,
        targetIdx: target.idx,
        passOutcome: { success: accurate, intercepted: !accurate && this.rng.chance(0.45) },
        arcH: this.rng.float(16, 30),
        flavor: "std",
        challengedIds: [],
        countsAsPass: false,
        passerId: taker.p.id,
      });
      return;
    }

    if (sp.kind === "goalKick") {
      const gk = taker;
      if (gk) {
        const target = this.choosePass(side, gk, team.tactics.playStyle ?? PlayStyle.Balanced, dir);
        if (target) this.executePass(side, gk, target);
        else this.makeLoose(sp.x, sp.y, this.other(side));
      }
      return;
    }

    if (sp.kind === "corner") {
      const targets = this.players(side)
        .filter((p, idx) => !p.sentOff && idx !== takerIdx && p.role !== "GK")
        .sort((a, b) => (b.p.heading + b.p.jumping + b.p.offTheBall) - (a.p.heading + a.p.jumping + a.p.offTheBall));
      const target = targets[Math.min(targets.length - 1, this.rng.int(0, Math.min(2, targets.length - 1)))] ?? taker;
      const quality = taker ? (taker.p.crossing + taker.p.technique) / 40 : 0.5;
      const error = (1 - quality) * 72;
      const zoneX = target ? target.x : goalX - dir * 80;
      const zoneY = target ? target.y : PITCH_H / 2;
      const toX = clamp(zoneX + this.rng.float(-error * 0.5, error * 0.5), goalX === 0 ? 28 : 845, goalX === 0 ? 155 : 972);
      const toY = clamp(zoneY + this.rng.float(-error, error), 85, 565);
      this.statsPassAttempt(side, taker?.p.id);
      this.addPlayerStat(taker?.p.id, "crossesAttempted");
      this.addPlayerStat(taker?.p.id, "touches");
      if (side === "home") this.stats.crossesHome += 1;
      else this.stats.crossesAway += 1;
      if (taker) this.assistWindow = { side, playerId: taker.p.id, t: this.worldTime };
      this.launchFlight({
        kind: "cross",
        fromX: sp.x,
        fromY: sp.y,
        toX,
        toY,
        t: 0,
        dur: this.rng.float(1.05, 1.65),
        side,
        targetIdx: target ? this.indexOfPlayer(side, target) : undefined,
        passerId: taker?.p.id,
      });
      return;
    }

    // free kick
    if (distToGoal < 28 && taker) {
      const gk = this.players(this.other(side)).find((p) => p.role === "GK");
      if (gk) {
        const angle = clamp(Math.abs(sp.y - PITCH_H / 2) / (PITCH_H / 2), 0, 1);
        const useDirect = this.rng.chance(
          clamp(0.75 - angle * 0.5 + (taker.p.freeKickAccuracy - 10) * 0.04, 0.2, 0.9),
        );
        if (useDirect) {
          const outcome = resolveShot(taker.p, gk.p, distToGoal, angle, 0.45, this.rng);
          this.recordShot(side, taker.p.id, outcome.goal || outcome.saved);
          let toX: number;
          let toY: number;
          if (outcome.goal) {
            toX = goalX - dir * 6;
            toY = PITCH_H / 2 + this.rng.float(-26, 26);
          } else if (outcome.saved) {
            toX = goalX - dir * 40;
            toY = clamp(PITCH_H / 2 + this.rng.float(-60, 60), 100, 550);
          } else if (outcome.blocked) {
            toX = goalX - dir * this.rng.float(90, 150);
            toY = clamp(sp.y + this.rng.float(-70, 70), 40, 610);
          } else {
            toX = goalX + dir * 45;
            toY = clamp(
              PITCH_H / 2 + (this.rng.chance(0.5) ? 1 : -1) * this.rng.float(50, 130),
              -60,
              PITCH_H + 60,
            );
          }
          this.launchFlight({
            kind: "shot",
            fromX: sp.x,
            fromY: sp.y,
            toX,
            toY,
            t: 0,
            dur: clamp(distToGoal / this.rng.float(20, 28), 0.2, 1.8),
            side,
            shotOutcome: outcome,
            passerId: taker.p.id,
          });
          this.lastTouchSide = side;
          return;
        }
      }
    }

    // indirect free kick: short or whipped in
    if (taker) {
      if (distToGoal < 40 && this.rng.chance(0.45)) {
        const toX = goalX + dir * -this.rng.float(60, 130);
        const toY = clamp(PITCH_H / 2 + this.rng.float(-110, 110), 60, 590);
        this.statsPassAttempt(side, taker.p.id);
        this.addPlayerStat(taker.p.id, "crossesAttempted");
        this.addPlayerStat(taker.p.id, "touches");
        if (side === "home") this.stats.crossesHome += 1;
        else this.stats.crossesAway += 1;
        this.assistWindow = { side, playerId: taker.p.id, t: this.worldTime };
        this.launchFlight({
          kind: "cross",
          fromX: sp.x,
          fromY: sp.y,
          toX,
          toY,
          t: 0,
          dur: this.rng.float(1.0, 1.6),
          side,
          targetIdx: this.nearestPlayerIndex(side, toX, toY),
          passerId: taker.p.id,
        });
        return;
      }
      const target = this.choosePass(side, taker, team.tactics.playStyle ?? PlayStyle.Balanced, dir);
      if (target) this.executePass(side, taker, target);
      else this.makeLoose(sp.x, sp.y, this.other(side));
    }
  }

  private startPenalty(side: Side): void {
    this.phase = "penalty";
    this.assistWindow = null;
    this.setPiece = null;
    this.carrier = null;
    this.flight = null;
    const spotX = side === "home" ? 890 : 110;
    this.ball = { x: spotX, y: PITCH_H / 2 };
    this.ballHeight = 0;
    this.penaltyState = {
      side,
      timer: 4.1,
      resolved: false,
      takerIdx: this.selectedTakerIndex(side, "penalty", spotX, PITCH_H / 2),
    };
  }

  private tickPenalty(dt: number): void {
    const ps = this.penaltyState;
    if (!ps) {
      this.phase = "open";
      return;
    }
    this.ball.x = ps.side === "home" ? 890 : 110;
    this.ball.y = PITCH_H / 2;
    this.ballHeight = 0;
    ps.timer -= dt;
    if (ps.timer <= 0 && !ps.resolved) {
      ps.resolved = true;
      this.resolvePenaltyShot(ps.side, ps.takerIdx);
    }
  }

  private resolvePenaltyShot(side: Side, takerIdx: number): void {
    const defending = this.other(side);
    const gk = this.players(defending).find((p) => p.role === "GK");
    const taker =
      takerIdx >= 0 ? this.players(side)[takerIdx] : this.players(side).find((p) => p.role !== "GK");
    if (!taker || !gk) {
      this.phase = "open";
      return;
    }

    const res = resolvePenalty(taker.p, gk.p, this.rng);
    this.recordShot(side, taker.p.id, true);

    const goalX = this.goalX(side);
    if (res.goal) {
      this.pushEvent(
        MatchEventType.PenaltyGoal,
        taker.p.contract.clubId,
        taker.p.id,
        `PENALTY SCORED! ${taker.p.firstName} ${taker.p.lastName} — ${this.homeScore + (side === "home" ? 1 : 0)}-${this.awayScore + (side === "away" ? 1 : 0)}`,
      );
      this.launchFlight({
        kind: "shot",
        fromX: this.ball.x,
        fromY: this.ball.y,
        toX: goalX - this.attackDir(side) * 6,
        toY: PITCH_H / 2 + this.rng.pick([-29, -18, 0, 18, 29]),
        t: 0,
        dur: 0.5,
        side,
        shotOutcome: { goal: true, saved: false, blocked: false, wide: false },
        passerId: taker.p.id,
      });
      this.penaltyState = null;
      return;
    }

    this.pushEvent(
      MatchEventType.PenaltyMissed,
      gk.p.contract.clubId,
      gk.p.id,
      `PENALTY SAVED! ${gk.p.firstName} ${gk.p.lastName} denies ${taker.p.firstName} ${taker.p.lastName}`,
    );
    this.bumpRating(gk, 0.5);
    this.bumpRating(taker, -0.5);
    this.launchFlight({
      kind: "shot",
      fromX: this.ball.x,
      fromY: this.ball.y,
      toX: goalX - this.attackDir(side) * 55,
      toY: PITCH_H / 2 + this.rng.pick([-28, 28]),
      t: 0,
      dur: 0.5,
      side,
      shotOutcome: { goal: false, saved: true, blocked: false, wide: false },
      passerId: taker.p.id,
      penalty: true,
    });
    this.penaltyState = null;
  }

  // -------------------------------------------------------------------------
  // Goals / out of play
  // -------------------------------------------------------------------------

  private awardGoal(side: Side, scorer?: SimPlayer | null): void {
    if (side === "home") this.homeScore += 1;
    else this.awayScore += 1;

    const players = this.players(side);
    let sc = scorer;
    if (!sc) sc = this.nearestToGoal(side);
    if (sc) {
      sc.goals += 1;
      sc.rating = clamp(sc.rating + 0.9, 1, 10);
      if (this.assistWindow && this.assistWindow.side === side && this.worldTime - this.assistWindow.t < 10) {
        const assister = players.find((p) => p.p.id === this.assistWindow!.playerId);
        if (assister && assister !== sc) {
          assister.assists += 1;
          assister.rating = clamp(assister.rating + 0.4, 1, 10);
        }
      }
    }

    const team = side === "home" ? this.home : this.away;
    const scorerName = sc ? `${sc.p.firstName} ${sc.p.lastName}` : "Goal";
    this.pushEvent(
      MatchEventType.Goal,
      team.clubId,
      sc?.p.id,
      `⚽ GOAL! ${scorerName} — ${this.homeScore}-${this.awayScore}`,
    );

    const scorerIndex = sc ? players.indexOf(sc) : -1;
    const goalX = this.goalX(side);
    const dir = this.attackDir(side);
    const scorerY = sc?.y ?? this.ball.y;

    this.concedingSide = this.other(side);
    this.phase = "celebration";
    this.phaseTimer = 3.5;
    this.carrier = null;
    this.flight = null;
    this.setPiece = null;
    this.penaltyState = null;
    this.decisionCd = 0;
    this.celebration = {
      side,
      scorerIndex,
      targetX: clamp(goalX - dir * 72, 20, 980),
      targetY: scorerY < PITCH_H / 2 ? 68 : PITCH_H - 68,
    };
    // Leave the scored ball visibly in the net behind the goal line. The
    // renderer has a true exterior goal margin for these coordinates.
    this.ball = {
      x: goalX + dir * 18,
      y: clamp(this.ball.y, PITCH_H / 2 - 32, PITCH_H / 2 + 32),
    };
    this.ballHeight = 0;
  }

  private nearestToGoal(side: Side): SimPlayer | null {
    const gx = this.goalX(side);
    let best: SimPlayer | null = null;
    let bestD = Infinity;
    for (const sp of this.players(side)) {
      if (sp.sentOff) continue;
      const d = Math.hypot(sp.x - gx, sp.y - PITCH_H / 2);
      if (d < bestD) {
        bestD = d;
        best = sp;
      }
    }
    return best;
  }

  private checkBounds(): void {
    const b = this.ball;
    if (this.phase !== "open") return;

    // Goal lines
    if (b.x <= 0 || b.x >= PITCH_W) {
      const lineSide: Side = b.x <= 0 ? "home" : "away";
      const insidePosts = b.y > PITCH_H / 2 - 37 && b.y < PITCH_H / 2 + 37;
      if (insidePosts) {
        this.awardGoal(this.other(lineSide));
        return;
      }
      this.handleBallOutOverGoalLine(this.other(lineSide), b.y, lineSide);
      return;
    }

    // Touchlines => throw-in
    if (b.y <= 0 || b.y >= PITCH_H) {
      const throwTo = this.other(this.lastTouchSide);
      const y = clamp(b.y, 6, PITCH_H - 6);
      const x = clamp(b.x, 20, PITCH_W - 20);
      this.startSetPiece("throw", throwTo, x, y);
    }
  }

  private handleBallOutOverGoalLine(
    attackingSide: Side,
    y: number,
    defendingSide?: Side,
  ): void {
    const line =
      defendingSide ?? (this.goalX(attackingSide) === 0 ? "home" : "away");
    if (this.lastTouchSide === attackingSide) {
      const gx = this.ownGoalX(line);
      this.startSetPiece("goalKick", line, gx + (line === "home" ? 70 : -70), PITCH_H / 2);
    } else {
      const gx = this.ownGoalX(line);
      const cornerX = gx + (line === "home" ? 8 : -8);
      const cornerY = y < PITCH_H / 2 ? 6 : PITCH_H - 6;
      this.startSetPiece("corner", attackingSide, cornerX, cornerY);
    }
  }

  // -------------------------------------------------------------------------
  // Adaptive AI manager — observation and reaction quality scale by difficulty
  // -------------------------------------------------------------------------

  private refreshAIOpponentPlan(side: Side): void {
    const team = this.team(side);
    if (team.isUserTeam) return;
    const own = this.players(side)
      .filter((player) => !player.sentOff)
      .map((player) => ({ player: player.p, role: player.role }));
    const opposition = this.players(this.other(side))
      .filter((player) => !player.sentOff)
      .map((player) => ({ player: player.p, role: player.role }));
    this.updateOpponentPlan(side, buildAIOpponentMatchPlan(
      this.fixtureId,
      own,
      opposition,
      this.difficulty,
      team.managerMemory,
    ));
  }

  private tickAIManager(): void {
    const minute = Math.floor(this.gameTime / 60);
    for (const side of ["home", "away"] as Side[]) {
      const team = this.team(side);
      if (team.isUserTeam || minute < this.aiNextReview[side]) continue;
      const flexibility = clamp((team.manager?.tacticalFlexibility ?? 10) / 20, 0.2, 1);
      const delay = Math.round((1 - this.coachProfile.decisionQuality * flexibility) * 3);
      this.aiNextReview[side] = minute + this.coachProfile.reviewIntervalMinutes + delay;
      this.applyAIAdjustment(side, minute);
    }
  }

  private applyAIAdjustment(side: Side, minute: number): void {
    const team = this.team(side);
    this.refreshAIOpponentPlan(side);
    const current = team.tactics;
    const next: TacticalSetup = {
      ...current,
      playerRoles: { ...(current.playerRoles ?? {}) },
      positionOverrides: { ...current.positionOverrides },
      setPieces: { ...current.setPieces },
    };
    const my = side === "home" ? this.homeScore : this.awayScore;
    const opp = side === "home" ? this.awayScore : this.homeScore;
    const diff = my - opp;
    const matchStats = this.getStats();
    const myShotsOnTarget = side === "home" ? matchStats.shotsOnTargetHome : matchStats.shotsOnTargetAway;
    const oppShotsOnTarget = side === "home" ? matchStats.shotsOnTargetAway : matchStats.shotsOnTargetHome;
    const myPossession = side === "home" ? matchStats.possessionHome : matchStats.possessionAway;
    const flexibility = clamp((team.manager?.tacticalFlexibility ?? 10) / 20, 0.2, 1);
    const reputation = clamp((team.manager?.reputation ?? 50) / 100, 0.2, 1);
    const effectiveQuality = this.coachProfile.decisionQuality * (0.55 + flexibility * 0.3 + reputation * 0.15);
    const seesTrend = this.coachProfile.usesMatchTrends && effectiveQuality >= 0.5;
    const beingOutplayed = seesTrend && (oppShotsOnTarget >= myShotsOnTarget + 3 || myPossession < 39);
    const chasing = diff < 0 || (diff === 0 && minute >= 62 && beingOutplayed);
    const protecting = diff > 0 && minute >= Math.round(82 - effectiveQuality * 30);
    const stalemate = diff === 0 && minute >= Math.round(78 - effectiveQuality * 25);
    let reason = "Rebalanced the match plan";

    // Poorer coaches observe later and sometimes decline to act even when the
    // score calls for it. Elite coaches use shot/possession trends before the
    // score changes and make smaller, earlier corrections.
    const acts = chasing || protecting || stalemate || beingOutplayed;
    // Even a poor coach must eventually react to the scoreboard. Difficulty
    // controls how early and accurately that happens, not whether a coach can
    // remain entirely passive through the closing minutes.
    const mustActLate = minute >= 82 && (chasing || protecting || stalemate);
    if (acts && (mustActLate || this.rng.chance(clamp(0.35 + effectiveQuality * 0.64, 0.35, 0.99)))) {
      if (chasing) {
        const desperate = minute >= 78 || diff <= -2;
        next.mentality = desperate ? MentalityLevel.UltraAttacking : MentalityLevel.Attacking;
        next.tempo = desperate ? TempoSetting.VeryFast : TempoSetting.Fast;
        next.pressing = desperate ? PressingIntensity.Extreme : PressingIntensity.High;
        next.defensiveLine = desperate ? DefensiveLine.VeryHigh : DefensiveLine.High;
        next.timeWasting = TimeWasting.Never;
        next.counterAttack = true;
        next.playStyle = effectiveQuality > 0.72 ? PlayStyle.GegenpressingStyle : current.playStyle;
        reason = diff < 0 ? `Chasing the game at ${my}-${opp}` : "Responding to the chance and territory trend";
        if (
          this.coachProfile.canChangeFormation && flexibility >= 0.45 &&
          this.rng.chance(clamp(effectiveQuality * 0.95, 0.2, 0.95))
        ) {
          next.formation = desperate ? (diff <= -2 ? "4-2-4" : "3-4-3") : "4-3-3";
          next.positionOverrides = {};
        }
      } else if (protecting) {
        next.mentality = diff >= 2 ? MentalityLevel.Defensive : MentalityLevel.Cautious;
        next.defensiveLine = diff >= 2 ? DefensiveLine.Deep : DefensiveLine.Normal;
        next.pressing = minute >= 82 ? PressingIntensity.Standard : PressingIntensity.High;
        next.tempo = TempoSetting.Normal;
        next.timeWasting = minute >= 82 ? TimeWasting.Always : TimeWasting.Late;
        next.counterAttack = true;
        if (effectiveQuality > 0.68) next.playStyle = PlayStyle.DirectCounterAttack;
        reason = `Protecting a ${my}-${opp} lead without surrendering the counter`;
        if (
          this.coachProfile.canChangeFormation && flexibility >= 0.55 && minute >= 72 &&
          this.rng.chance(clamp(effectiveQuality * 0.85, 0.15, 0.9))
        ) {
          next.formation = diff >= 2 ? "5-4-1" : "4-5-1";
          next.positionOverrides = {};
        }
      } else if (beingOutplayed) {
        next.defensiveLine = Math.max(DefensiveLine.Deep, (current.defensiveLine ?? DefensiveLine.Normal) - 1);
        next.pressing = PressingIntensity.High;
        next.width = WidthSetting.Narrow;
        next.tempo = TempoSetting.Fast;
        reason = "Closed central spaces after reading the opponent's pressure";
      } else if (stalemate) {
        next.mentality = MentalityLevel.Positive;
        next.tempo = TempoSetting.Fast;
        next.width = WidthSetting.Wide;
        next.pressing = PressingIntensity.High;
        reason = "Sought a late winner by stretching the pitch";
      }
    }

    const changed =
      next.formation !== current.formation || next.playStyle !== current.playStyle ||
      next.mentality !== current.mentality || next.tempo !== current.tempo ||
      next.passingLength !== current.passingLength || next.defensiveLine !== current.defensiveLine ||
      next.pressing !== current.pressing || next.width !== current.width ||
      next.timeWasting !== current.timeWasting || next.counterAttack !== current.counterAttack;
    if (changed) {
      this.updateTactics(side, next, reason);
      this.pushEvent(
        MatchEventType.Instruction,
        team.clubId,
        undefined,
        `${team.manager?.name ?? `${team.shortName} coach`}: ${reason}.`,
      );
    }

    this.tryAISubstitution(side, minute, effectiveQuality);
  }

  private tryAISubstitution(side: Side, minute: number, quality: number): void {
    const team = this.team(side);
    if (
      minute < 52 || this.subsUsed[side] >= this.coachProfile.maxPlannedSubstitutions ||
      this.subsUsed[side] >= 5 || team.bench.length === 0
    ) return;
    const players = this.players(side);
    const candidates = players
      .map((sp, idx) => ({
        sp,
        idx,
        need: (1 - sp.energy) * 5 + Math.max(0, 6.8 - sp.rating) * 1.35 + (sp.yellow ? 0.7 : 0),
      }))
      .filter(({ sp }) => !sp.sentOff && sp.role !== "GK")
      .sort((a, b) => b.need - a.need);
    const threshold = minute >= 78 ? 0.35 : minute >= 65 ? 0.75 : 1.25;
    if (!candidates[0] || candidates[0].need < threshold) return;

    const shortlist = candidates.slice(0, quality >= 0.75 ? 2 : quality >= 0.45 ? 3 : 5);
    const off = quality >= 0.72 ? shortlist[0] : this.rng.pick(shortlist);
    const availableBench = team.bench
      .map((player, idx) => ({ player, idx }))
      .filter(({ player }) => !this.substitutedOut.has(player.id) && !players.some((sp) => sp.p.id === player.id));
    if (availableBench.length === 0) return;
    availableBench.sort((a, b) => {
      const fit = roleFitScore(b.player, off.sp.role) - roleFitScore(a.player, off.sp.role);
      if (fit !== 0) return fit;
      return b.player.naturalFitness + b.player.reputation * 0.08 -
        (a.player.naturalFitness + a.player.reputation * 0.08);
    });
    const benchChoice = quality >= 0.55
      ? availableBench[0]
      : this.rng.pick(availableBench.slice(0, Math.min(3, availableBench.length)));
    this.substitute(side, off.idx, benchChoice.idx);
  }

  // -------------------------------------------------------------------------
  // Events & ratings
  // -------------------------------------------------------------------------

  private pushInstructionCommentary(
    key: string,
    side: Side,
    player: SimPlayer,
    text: string,
    cooldownSeconds = 600,
  ): void {
    const previous = this.instructionCommentaryAt.get(key);
    if (previous !== undefined && this.gameTime - previous < cooldownSeconds) return;
    this.instructionCommentaryAt.set(key, this.gameTime);
    this.pushEvent(MatchEventType.Instruction, this.team(side).clubId, player.p.id, text);
  }

  private pushEvent(
    type: MatchEventType,
    clubId?: string,
    playerId?: string,
    text?: string,
  ): void {
    const minute = Math.floor(this.gameTime / 60);
    const e: MatchEvent = {
      minute,
      type,
      clubId,
      playerId,
      text: text ?? type,
    };
    this.events.push(e);
    this.onEvent?.(e);
  }

  private bumpRating(sp: SimPlayer | undefined | null, delta: number): void {
    if (!sp) return;
    sp.rating = clamp(sp.rating + delta, 1, 10);
  }
}

function distToOwnGoal(side: Side, sp: SimPlayer): number {
  const gx = side === "home" ? 0 : PITCH_W;
  return Math.hypot(sp.x - gx, sp.y - PITCH_H / 2) / UNITS_PER_METER;
}

// ---------------------------------------------------------------------------
// Best XI selection (used by callers before creating TeamSide)
// ---------------------------------------------------------------------------

const ROLE_TO_POSITION: Record<string, string> = {
  GK: "GK", RB: "RB", CB: "CB", LB: "LB",
  RWB: "RB", LWB: "LB",
  CDM: "CDM", DM: "CDM", CM: "CM", CAM: "CAM", AM: "CAM",
  RM: "RW", LM: "LW", RW: "RW", LW: "LW",
  ST: "ST", CF: "ST",
};

const ROLE_KEY_ATTRS: Record<string, string[]> = {
  GK: ["reflexes", "shotStopping", "positioning", "handling"],
  RB: ["pace", "tackling", "crossing", "workRate"],
  LB: ["pace", "tackling", "crossing", "workRate"],
  CB: ["marking", "tackling", "heading", "strength"],
  CDM: ["interceptions", "shortPassing", "positioning", "teamwork"],
  CM: ["shortPassing", "decisions", "teamwork", "workRate"],
  CAM: ["creativity", "technique", "dribbling", "flair"],
  RW: ["pace", "dribbling", "crossing", "acceleration"],
  LW: ["pace", "dribbling", "crossing", "acceleration"],
  ST: ["finishing", "offTheBall", "composure", "acceleration"],
};

const POSITION_NEIGHBOR: Record<string, string[]> = {
  RB: ["CB", "RW", "LB"], LB: ["CB", "LW", "RB"], CB: ["CDM", "RB", "LB"],
  CDM: ["CM", "CB"], CM: ["CDM", "CAM"], CAM: ["CM", "ST", "LW", "RW"],
  RW: ["LW", "CAM", "ST", "RM"], LW: ["RW", "CAM", "ST", "LM"], ST: ["CAM", "LW", "RW"],
};

function attrScore(p: Player, role: string): number {
  const keys = ROLE_KEY_ATTRS[role] ?? ROLE_KEY_ATTRS.CM;
  let sum = 0;
  for (const k of keys) {
    sum += (p as unknown as Record<string, number>)[k] ?? 10;
  }
  return sum;
}

function roleFitScore(p: Player, role: string): number {
  const target = ROLE_TO_POSITION[role] ?? "CM";
  if (target === "GK") return p.primaryPosition === "GK" ? 1000 + attrScore(p, role) : -1000;
  if (p.primaryPosition === "GK") return -1000;
  let fit = 20;
  if (p.primaryPosition === target) fit = 300;
  else if (p.secondaryPositions.includes(target as Player["primaryPosition"])) fit = 210;
  else if ((POSITION_NEIGHBOR[target] ?? []).includes(p.primaryPosition)) fit = 105;
  return fit + attrScore(p, role) + p.pace * 0.2;
}

/** Select best XI + bench for a formation from a squad. */
export function selectBestXI(
  squad: Player[],
  formationName: string,
): {
  starters: Player[];
  bench: Player[];
  roles: string[];
  basePositions: { x: number; y: number }[];
} {
  const formation = getFormation(formationName);
  const slots = formation.positions;
  // Medical absences are hard availability constraints, not a rating penalty.
  // Depleted/imported squads may therefore start short rather than field an
  // injured player.
  const available = squad.filter(isPlayerAvailable);

  const positionFit = (p: Player, role: string): number => {
    const target = ROLE_TO_POSITION[role] ?? "CM";
    if (target === "GK") return p.primaryPosition === "GK" ? 3 : 0;
    if (p.primaryPosition === "GK") return 0;
    if (p.primaryPosition === target) return 3;
    if (p.secondaryPositions.some((sp) => sp === target)) return 2;
    const near = POSITION_NEIGHBOR[target] ?? [];
    if (near.includes(p.primaryPosition)) return 1;
    return 0;
  };

  const slotOrder = slots
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.role === "GK" ? -1 : b.s.role === "GK" ? 1 : 0));

  const chosen: ({ slotIdx: number; player: Player } | undefined)[] = new Array(slots.length);

  for (const { s, i } of slotOrder) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    available.forEach((p, idx) => {
      const fit = positionFit(p, s.role);
      if (fit === 0 && s.role === "GK") return;
      if (fit === 0 && p.primaryPosition === "GK") return;
      const readiness = playerCondition(p) * 0.05 + playerSharpness(p) * 0.025;
      const score = fit * 100 + attrScore(p, s.role) + p.pace * 0.2 + readiness;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0) {
      const [player] = available.splice(bestIdx, 1);
      chosen[i] = { slotIdx: i, player };
    }
  }

  for (let i = 0; i < slots.length; i++) {
    if (!chosen[i] && available.length > 0) {
      chosen[i] = { slotIdx: i, player: available.shift()! };
    }
  }

  const starters: Player[] = [];
  const roles: string[] = [];
  const basePositions: { x: number; y: number }[] = [];
  for (let i = 0; i < slots.length; i++) {
    const c = chosen[i];
    if (!c) continue;
    starters.push(c.player);
    roles.push(slots[i].role);
    basePositions.push({ x: slots[i].baseX, y: slots[i].baseY });
  }

  const bench = [...available];
  bench.sort((a, b) => {
    const aGK = a.primaryPosition === "GK" ? 1 : 0;
    const bGK = b.primaryPosition === "GK" ? 1 : 0;
    if (aGK !== bGK) return bGK - aGK;
    return (b.reputation + playerCondition(b) * 0.12 + playerSharpness(b) * 0.05) -
      (a.reputation + playerCondition(a) * 0.12 + playerSharpness(a) * 0.05);
  });

  return { starters, bench: bench.slice(0, 7), roles, basePositions };
}

/** Build a TeamSide from club data (mirrors formation for the away team). */
export function buildTeamSide(opts: {
  clubId: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  isHome: boolean;
  squad: Player[];
  tactics: TacticalSetup;
  isUserTeam: boolean;
  manager?: TeamSide["manager"];
  teamDirectives?: PlayerDirectives;
  directives?: Record<string, PlayerDirectives>;
}): TeamSide {
  const { starters, bench, roles, basePositions } = selectBestXI(
    opts.squad,
    opts.tactics.formation,
  );
  let positions = basePositions;
  if (!opts.isHome) {
    const mirrored = mirrorFormation({
      name: "",
      positions: basePositions.map((p, i) => ({ role: roles[i] ?? "CM", baseX: p.x, baseY: p.y })),
    });
    positions = mirrored.positions.map((p) => ({ x: p.baseX, y: p.baseY }));
  }
  return {
    clubId: opts.clubId,
    name: opts.name,
    shortName: opts.shortName,
    primaryColor: opts.primaryColor,
    secondaryColor: opts.secondaryColor,
    isHome: opts.isHome,
    starters,
    bench,
    roles,
    displayNumbers: assignTacticalNumbers(roles),
    basePositions: positions,
    tactics: opts.tactics,
    manager: opts.manager,
    teamDirectives: opts.teamDirectives,
    directives: opts.directives,
    isUserTeam: opts.isUserTeam,
  };
}
