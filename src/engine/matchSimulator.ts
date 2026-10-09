/**
 * MatchSimulator — pure TypeScript match simulation (NO React).
 * Runs on a Web Worker (see matchWorker.ts) at 10 ticks per real second.
 *
 * Pitch: 1000 x 650 game units. 10 units = 1 meter (1000 units ~ 100m).
 * Home defends x=0 and attacks x=1000; away is mirrored.
 */
import {
  MatchEventType,
  MentalityLevel,
  PlayStyle,
  PressingIntensity,
  TempoSetting,
  TimeWasting,
  WidthSetting,
  DefensiveLine,
  type MatchEvent,
  type MatchStats,
  type Player,
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
  /** Parsed team-wide natural-language instruction. */
  teamDirectives?: PlayerDirectives;
  /** Parsed individual/assigned instructions, keyed by playerId (user team only). */
  directives?: Record<string, PlayerDirectives>;
}

export interface SimOptions {
  seed: number;
  /** match-clock seconds advanced per real second at speed 1 (default 6 => 90' in 15 min) */
  timeScale?: number;
  /**
   * world/movement seconds per real second at speed 1 (default 0.5).
   * Decoupled from the clock: at the default 2x speed the players move at
   * real-time pace while the clock runs at 12x (90' in ~7.5 min).
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

interface SimPlayer {
  p: Player;
  x: number;
  y: number;
  tx: number;
  ty: number;
  role: string;
  /** tactical shirt number (1 keeper, 4/5 centre-backs, 10 creator, etc.) */
  number: number;
  tackleCd: number;
  /** world-time until which this player bursts forward (give-and-go) */
  runUntil: number;
  /** 1=fresh; high pressing and repeated sprints reduce it */
  energy: number;
  rating: number;
  sentOff: boolean;
  yellow: boolean;
  goals: number;
  assists: number;
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
  kind: "pass" | "shot" | "cross";
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

const EMPTY_DIRECTIVES: PlayerDirectives = {};

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
}

export interface MatchSnapshot {
  gameTime: number;
  addedTime90: number;
  homeScore: number;
  awayScore: number;
  phase: Phase;
  ball: { x: number; y: number; height: number; airborne: boolean };
  homePositions: { x: number; y: number }[];
  awayPositions: { x: number; y: number }[];
  possession: Side | "loose";
  homeLineup: LineupEntry[];
  awayLineup: LineupEntry[];
  stats: MatchStats;
  events: MatchEvent[];
  ratings: Record<string, number>;
}

export interface LineupEntry {
  playerId: string;
  shirtNumber: number;
  name: string;
  position: string;
  rating: number;
  goals: number;
  yellow: boolean;
  sentOff: boolean;
}

function emptyStats(): MatchStats {
  return {
    possessionHome: 0, shotsHome: 0, shotsOnTargetHome: 0,
    passesAttemptedHome: 0, passesCompletedHome: 0, tacklesHome: 0, foulsHome: 0, cornersHome: 0,
    possessionAway: 0, shotsAway: 0, shotsOnTargetAway: 0,
    passesAttemptedAway: 0, passesCompletedAway: 0, tacklesAway: 0, foulsAway: 0, cornersAway: 0,
  };
}

type KickoffReason = "start" | "half" | "restart";

export class MatchSimulator {
  readonly home: TeamSide;
  readonly away: TeamSide;
  private rng: SeededRNG;
  private timeScale: number;
  private worldScale: number;
  private worldTime = 0;

  gameTime = 0;
  addedTime90 = 0;
  homeScore = 0;
  awayScore = 0;
  phase: Phase = "kickoff";
  speed: 1 | 2 | 4 | 8 = 1;
  isRunning = false;

  private homePlayers: SimPlayer[] = [];
  private awayPlayers: SimPlayer[] = [];
  private ball = { x: PITCH_W / 2, y: PITCH_H / 2 };
  private ballHeight = 0;
  private carrier: { side: Side; i: number } | null = null;
  private lastTouchSide: Side = "home";
  private flight: Flight | null = null;
  private setPiece: SetPiece | null = null;
  private phaseTimer = 0;
  private decisionCd = 0;
  private looseLockSide: Side | null = null;
  private looseLockT = 0;
  private possessionSide: Side = "home";
  private assistWindow: { side: Side; playerId: string; t: number } | null = null;
  private lastTurnover: { side: Side; t: number } | null = null;
  private events: MatchEvent[] = [];
  private stats = emptyStats();
  private pendingState = false;
  private aiChecksDone = new Set<string>();
  /** Match-clock timestamp for throttled, inspectable instruction commentary. */
  private instructionCommentaryAt = new Map<string, number>();
  /** Avoid allocating a merged team/player object on every movement check. */
  private mergedDirectiveCache: Record<Side, Map<string, PlayerDirectives>> = {
    home: new Map(),
    away: new Map(),
  };
  private subsUsed: Record<Side, number> = { home: 0, away: 0 };
  private stoppage = 0;
  private finished = false;
  private halftimeTaken = false;
  private concedingSide: Side | null = null;
  private penaltyState: { side: Side; timer: number; resolved: boolean } | null = null;

  onEvent: ((e: MatchEvent) => void) | null = null;
  onHalfTime: (() => void) | null = null;
  onFullTime: (() => void) | null = null;

  constructor(home: TeamSide, away: TeamSide, options: SimOptions) {
    this.home = home;
    this.away = away;
    this.rng = new SeededRNG(options.seed);
    this.timeScale = options.timeScale ?? 6;
    this.worldScale = options.worldScale ?? 0.5;

    this.homePlayers = this.buildPlayers(home);
    this.awayPlayers = this.buildPlayers(away);

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
        role: side.roles[i] ?? "CM",
        number: side.displayNumbers[i] ?? p.shirtNumber,
        tackleCd: 0, runUntil: 0, energy: 1, rating: 6.5, sentOff: false, yellow: false,
        goals: 0, assists: 0,
      };
    });
  }

  private players(side: Side): SimPlayer[] {
    return side === "home" ? this.homePlayers : this.awayPlayers;
  }

  private other(side: Side): Side {
    return side === "home" ? "away" : "home";
  }

  private attackDir(side: Side): number {
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
    const individual = team.directives?.[sp.p.id];
    const directives = !team.teamDirectives
      ? individual ?? EMPTY_DIRECTIVES
      : !individual
        ? team.teamDirectives
        : mergeDirectives(team.teamDirectives, individual);
    this.mergedDirectiveCache[side].set(sp.p.id, directives);
    return directives;
  }

  /** Seconds since this side last won possession (Infinity if no recent turnover). */
  private transitionAge(side: Side): number {
    return this.lastTurnover?.side === side ? this.worldTime - this.lastTurnover.t : Infinity;
  }

  /** Apply tactical changes immediately without restarting the match. */
  updateTactics(side: Side, tactics: TacticalSetup): void {
    const team = this.team(side);
    team.tactics = { ...tactics, positionOverrides: { ...tactics.positionOverrides } };
    const formation = getFormation(tactics.formation);
    const slots = side === "home" ? formation.positions : mirrorFormation(formation).positions;
    const players = this.players(side);

    // Reassign the current XI to new slots by positional suitability while
    // preserving array/player identity (the renderer's shirt dots stay bound
    // to the same footballer). A formation switch therefore does not put a
    // centre-back at striker merely because both occupied index 3.
    const freePlayers = new Set(players.map((_, i) => i));
    const slotForPlayer = new Map<number, (typeof slots)[number]>();
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
      sp.role = slot.role;
      const override = tactics.positionOverrides[sp.p.id];
      const base = override
        ? { x: side === "home" ? override.x : PITCH_W - override.x, y: override.y }
        : { x: slot.baseX, y: slot.baseY };
      team.roles[i] = slot.role;
      team.basePositions[i] = base;
    });
    // Keep match numbers stable after kickoff so the manager can always track
    // the same player, even if their role changes with a formation switch.
    this.pendingState = true;
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

  setSpeed(multiplier: 1 | 2 | 4 | 8): void {
    this.speed = multiplier;
  }

  /** Advance one simulation step. dtReal in seconds (typically 0.1). */
  tick(dtReal: number): void {
    if (!this.isRunning || this.finished) return;
    if (this.phase === "halftime" || this.phase === "fulltime") return;

    // Two clocks: the match clock races ahead while the world (movement,
    // passes, decisions) advances at a real-time-ish pace.
    const dtClock = dtReal * this.speed * this.timeScale;
    const dtWorld = dtReal * this.speed * this.worldScale;
    this.gameTime += dtClock;
    this.worldTime += dtWorld;

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

    this.tickAIManager();
    this.pendingState = true;
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
      },
      homePositions: this.homePlayers.map((p) => ({ x: p.x, y: p.y })),
      awayPositions: this.awayPlayers.map((p) => ({ x: p.x, y: p.y })),
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
    };
  }

  private lineup(players: SimPlayer[]): LineupEntry[] {
    return players.map((sp) => ({
      playerId: sp.p.id,
      shirtNumber: sp.number,
      name: `${sp.p.firstName} ${sp.p.lastName}`,
      position: sp.p.primaryPosition,
      rating: Number(sp.rating.toFixed(1)),
      goals: sp.goals,
      yellow: sp.yellow,
      sentOff: sp.sentOff,
    }));
  }

  private getRatings(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const sp of [...this.homePlayers, ...this.awayPlayers]) {
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
    if (target.sentOff) return false;
    if (players.some((sp) => sp.p.id === benchPlayer.id)) return false;

    target.p = benchPlayer;
    target.rating = 6.5;
    target.energy = 1;
    target.runUntil = 0;
    this.subsUsed[side] += 1;
    this.pushEvent(
      MatchEventType.Substitution,
      team.clubId,
      benchPlayer.id,
      `${team.shortName}: ${benchPlayer.firstName} ${benchPlayer.lastName} is on`,
    );
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
    this.carrier = null;
    this.flight = null;
    this.setPiece = null;
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
    } else {
      this.tickMovement(dt, false);
    }
  }

  // -------------------------------------------------------------------------
  // Movement & shape
  // -------------------------------------------------------------------------

  private tickMovement(dt: number, frozen: boolean): void {
    for (const side of ["home", "away"] as Side[]) {
      const team = this.team(side);
      const tactics = team.tactics;
      const style = tactics.playStyle ?? PlayStyle.Balanced;
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
      widthF = clamp(widthF, 0.62, 1.28);

      const mentality = tactics.mentality ?? MentalityLevel.Balanced;
      const line = tactics.defensiveLine ?? DefensiveLine.Normal;
      let pressing = tactics.pressing ?? PressingIntensity.Standard;
      if (gegen) pressing = Math.max(pressing, PressingIntensity.High);
      if (park) pressing = Math.min(pressing, PressingIntensity.Low);

      const players = this.players(side);
      const active = players
        .map((sp, i) => ({ sp, i, d: Math.hypot(sp.x - this.ball.x, sp.y - this.ball.y) }))
        .filter((o) => !o.sp.sentOff && o.sp.role !== "GK");
      const pressOrder = [...active].sort((a, b) => {
        const aDirective = this.directives(side, a.sp);
        const bDirective = this.directives(side, b.sp);
        const ad = a.d - (aDirective.pressHard ? 120 : aDirective.defensiveDuty ? 65 : 0) + (aDirective.pressLess ? 240 : 0);
        const bd = b.d - (bDirective.pressHard ? 120 : bDirective.defensiveDuty ? 65 : 0) + (bDirective.pressLess ? 240 : 0);
        return ad - bd;
      });
      let pressCount = pressing === 0 ? 0 : pressing === 1 ? 1 : pressing === 2 ? 2 : 3;
      if ((gegen || justLost) && pressing > 0) pressCount = Math.min(4, pressCount + 1);
      const pressers = new Set(pressOrder.slice(0, pressCount).map((o) => o.i));

      players.forEach((sp, i) => {
        if (sp.sentOff) return;
        const base = team.basePositions[i] ?? { x: 500, y: 325 };
        const directive = this.directives(side, sp);
        // A defensive assignment changes the player's functional line rather
        // than merely suppressing one forward run. This is how a nominal
        // striker can become part of the midfield/defensive block.
        const roleLine = directive.defensiveDuty && sp.role !== "GK" ? "MID" : lineOf(sp.role);

        // Ball carrier drives into the next available line rather than walking
        // straight forward regardless of role/style.
        if (this.carrier && this.carrier.side === side && this.carrier.i === i) {
          const drive = directive.defensiveDuty ? 18 : directStyle || justWon ? 68 : possessionStyle ? 28 : 45;
          sp.tx = clamp(sp.x + dir * drive, 20, 980);
          if (directive.stayWide) {
            sp.ty = sp.y < 325 ? 55 : 595;
          } else if (directive.cutInside || sp.role === "ST" || sp.role === "CF") {
            sp.ty = 325 + (sp.y - 325) * 0.55;
          } else {
            // Carry toward the least crowded neighbouring lane.
            const upper = this.opponentsWithin(side, sp.x + dir * 50, sp.y - 55, 9);
            const lower = this.opponentsWithin(side, sp.x + dir * 50, sp.y + 55, 9);
            sp.ty = clamp(sp.y + (upper < lower ? -28 : upper > lower ? 28 : 0), 18, 632);
          }
          this.drainEnergy(sp, dt, 1.15);
          this.movePlayer(sp, dt, directive.conserveEnergy ? 0.86 : 1.06);
          this.ball.x = sp.x + dir * 6;
          this.ball.y = sp.y;
          return;
        }

        // Receiver attacks the destination of a through ball / switch while it
        // is in flight. This creates a real race rather than teleporting the
        // receiver when the pass arrives.
        if (
          this.flight?.kind === "pass" &&
          this.flight.side === side &&
          this.flight.targetIdx === i
        ) {
          sp.tx = this.flight.toX;
          sp.ty = this.flight.toY;
          this.drainEnergy(sp, dt, this.flight.flavor === "through" ? 1.35 : 0.85);
          this.movePlayer(sp, dt, this.flight.flavor === "through" ? 1.1 : 0.97);
          return;
        }

        // Goalkeeper sweeps higher behind a high line / possession side, but
        // retreats in a low block.
        if (sp.role === "GK") {
          const distToOwn = Math.abs(this.ball.x - this.ownGoalX(side));
          const sweep = park ? 0 : (line + (hasBall ? 1 : 0)) * 6;
          const goalOffset = clamp(42 + Math.min(distToOwn, 350) * 0.035 + sweep, 40, 90);
          sp.tx = side === "home" ? goalOffset : PITCH_W - goalOffset;
          sp.ty = clamp(325 + (this.ball.y - 325) * 0.27, 238, 412);
          this.movePlayer(sp, dt, 0.92);
          return;
        }

        if (frozen) {
          sp.tx = side === "home" ? Math.min(base.x, 480) : Math.max(base.x, 520);
          sp.ty = 325 + (base.y - 325) * widthF;
          this.movePlayer(sp, dt, 0.82);
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

        // Overloads and role-specific runs.
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
          const anchorFromOwnGoal = hasBall ? 405 : 325;
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

        // Defensive actions: a designated set presses; everyone else protects
        // the formation. Gegenpressing activates immediately after losing it.
        const isPresser = !hasBall &&
          !directive.pressLess &&
          (pressers.has(i) || directive.pressHard || directive.defensiveDuty) &&
          !directive.conserveEnergy &&
          (Math.hypot(sp.x - this.ball.x, sp.y - this.ball.y) < (directive.defensiveDuty ? 235 : justLost ? 260 : 205));
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

        // In loose-ball situations the nearest player from each side attacks
        // the second ball while the rest preserve the team structure.
        if (!this.carrier && !this.flight && this.phase === "open" && pressOrder[0]?.i === i) {
          tx = this.ball.x;
          ty = this.ball.y;
        }

        sp.tx = clamp(tx, 18, 982);
        sp.ty = clamp(ty, 12, 638);
        const sprinting = isPresser || sp.runUntil > this.worldTime || (justWon && isForward);
        this.drainEnergy(sp, dt, sprinting ? 1.35 : hasBall ? 0.72 : 0.55);
        this.movePlayer(sp, dt, sprinting ? 1.08 : directive.conserveEnergy ? 0.84 : 0.96);
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

  /** Move toward target with a realistic max speed (m/s from attributes). */
  private movePlayer(sp: SimPlayer, dt: number, speedFactor: number): void {
    const fatigue = 0.72 + sp.energy * 0.28;
    const maxSpeed = (5.2 + sp.p.pace * 0.19 + sp.p.acceleration * 0.075) * speedFactor * fatigue; // m/s
    const step = maxSpeed * UNITS_PER_METER * dt;
    const dx = sp.tx - sp.x;
    const dy = sp.ty - sp.y;
    const d = Math.hypot(dx, dy);
    if (d <= step || d === 0) {
      sp.x = sp.tx;
      sp.y = sp.ty;
    } else {
      sp.x += (dx / d) * step;
      sp.y += (dy / d) * step;
    }
    sp.x = clamp(sp.x, 8, 992);
    sp.y = clamp(sp.y, 8, 642);
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
    for (const op of this.players(this.other(side))) {
      if (op.sentOff) continue;
      const d = Math.hypot(op.x - p.x, op.y - p.y) / UNITS_PER_METER;
      if (d < nearest) nearest = d;
    }
    return clamp((8 - nearest) / 8, 0, 1);
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
    if (!this.carrier || this.decisionCd > 0) return;
    const side = this.carrier.side;
    const sp = this.players(side)[this.carrier.i];
    if (!sp) {
      this.carrier = null;
      return;
    }
    this.makeDecision(side, sp);
  }

  private makeDecision(side: Side, sp: SimPlayer): void {
    const team = this.team(side);
    const dir = this.attackDir(side);
    const idx = this.players(side).indexOf(sp);
    const directive = this.directives(side, sp);
    const style = team.tactics.playStyle ?? PlayStyle.Balanced;
    const pressure = this.pressureOn(side, idx);
    const distanceFromOwnGoal = Math.abs(sp.x - this.ownGoalX(side));
    const inOwnHalf = (sp.x - 500) * dir < 0;

    // An urgent-clearance plan has priority over style and role, but only in a
    // credible danger zone. It never turns harmless possession high up the
    // pitch into random hoofing.
    if (
      directive.clearImmediately &&
      (distanceFromOwnGoal < 335 || (inOwnHalf && pressure > 0.34))
    ) {
      this.executeClearance(side, sp);
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
      const cutback = nearByline && this.rng.chance(0.72);
      if (this.rng.chance(crossBase + sp.p.crossing * 0.006)) {
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
    if (directive.avoidShooting) shootUrge = 0.001;
    else if (directive.defensiveDuty) shootUrge *= 0.28;

    if (this.rng.chance(shootUrge)) {
      this.executeShot(side, sp, distToGoal);
      return;
    }

    // Under contact, strong/balanced players can shield before the opponent
    // gets a clean tackle. Target-men deliberately seek this duel.
    if (pressure > 0.62) {
      const defender = this.closestOpponent(side, sp);
      const seekShield = directive.targetMan || sp.p.strength + sp.p.balance >= 27;
      if (defender && seekShield && this.rng.chance(directive.targetMan ? 0.58 : 0.32)) {
        if (resolveHoldOff(sp.p, defender.p, this.rng)) {
          defender.tackleCd = Math.max(defender.tackleCd, 0.65);
          sp.runUntil = Math.max(sp.runUntil, this.worldTime + 0.8);
          this.bumpRating(sp, 0.025);
          this.decisionCd = this.decisionDelay(side, sp, 0.55);
          return;
        }
      }
    }

    // Dribbling is a purposeful instruction/style choice, not the universal
    // response to pressure. "Release early" strongly suppresses it.
    let dribbleP = 0.1 + sp.p.dribbling * 0.013 + sp.p.flair * 0.005;
    if (directive.dribbleMore) dribbleP += 0.32;
    if (directive.dribbleLess || directive.shortPassing || directive.defensiveDuty) dribbleP *= 0.25;
    if (style === PlayStyle.TotalFootball || style === PlayStyle.WingPlay) dribbleP += 0.08;
    if (pressure > 0.38 && this.rng.chance(clamp(dribbleP, 0.03, 0.72))) {
      const defender = this.closestOpponent(side, sp);
      if (defender) {
        const res = resolveDribble(sp.p, defender.p, this.rng);
        this.statsTackleAttempt(this.other(side));
        if (res.foul) {
          this.awardFoul(side, defender, sp);
          return;
        }
        if (!res.beat) {
          this.giveBallTo(this.other(side), this.indexOfPlayer(this.other(side), defender));
          this.lastTurnover = { side: this.other(side), t: this.worldTime };
          return;
        }
        sp.runUntil = Math.max(sp.runUntil, this.worldTime + 1.4);
        this.decisionCd = this.decisionDelay(side, sp, 0.65);
        this.bumpRating(sp, 0.06);
        return;
      }
    }

    const pass = this.choosePass(side, sp, style, dir);
    if (pass) {
      this.executePass(side, sp, pass);
      return;
    }

    // No passing lane: carry into space briefly, then reassess.
    sp.runUntil = Math.max(sp.runUntil, this.worldTime + 0.7);
    this.decisionCd = this.decisionDelay(side, sp, 0.7);
  }

  private executeClearance(side: Side, sp: SimPlayer): void {
    const dir = this.attackDir(side);
    const distanceUnits = this.rng.float(380, 570);
    const toX = clamp(sp.x + dir * distanceUnits, 24, 976);
    // Clear away from the most crowded central lane, with enough variation to
    // create realistic second balls rather than a scripted pass recipient.
    const awayFromCentre = sp.y < 325 ? -1 : 1;
    const toY = clamp(sp.y + awayFromCentre * this.rng.float(65, 210), 22, 628);
    const distanceM = Math.hypot(toX - sp.x, toY - sp.y) / UNITS_PER_METER;

    this.pushInstructionCommentary(
      `clear:${side}`,
      side,
      sp,
      `${sp.p.firstName} ${sp.p.lastName} follows the instruction and clears the danger immediately.`,
    );
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
    return clamp(base * factor + this.rng.float(0.02, 0.16), 0.12, 1.05);
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
    this.statsPassAttempt(side);
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
      targetIdx: cutback ? this.indexOfPlayer(side, receiver) : undefined,
      passOutcome: cutback ? { success: this.rng.chance(0.72 + quality * 0.2), intercepted: false } : undefined,
      arcH: cutback ? 2 : this.rng.float(38, 72),
      flavor: cutback ? "pullback" : "lofted",
      passerId: sp.p.id,
    });
    this.lastTouchSide = side;
  }

  private statsTackleAttempt(side: Side): void {
    if (side === "home") this.stats.tacklesHome += 1;
    else this.stats.tacklesAway += 1;
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
    const length = tactics.passingLength ?? TempoSetting.Normal;
    const pressure = this.pressureOn(side, myIdx);
    const preferred = clamp(
      baseProfile.shortPref + (length - TempoSetting.Normal) * 5.5 +
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
        ["ST", "CF", "RW", "LW", "CAM"].includes(mate.role);
      const roomAhead = this.opponentsWithin(side, mate.x + dir * 55, mate.y, 8) <= 1;
      const throughIntent =
        runner && progressM > 3 && roomAhead &&
        (passerDirective.riskyPasses ||
          style === PlayStyle.DirectCounterAttack ||
          tactics.counterAttack ||
          style === PlayStyle.TotalFootball ||
          sp.p.creativity + sp.p.decisions > 27) &&
        !this.isOffside(side, mate.x, sp.x);
      if (throughIntent && this.rng.chance(clamp(0.16 + sp.p.creativity * 0.015 + baseProfile.riskTol * 0.25, 0.15, 0.7))) {
        const lead = clamp(24 + mate.p.acceleration * 1.7 + mate.p.pace * 1.2, 35, 78);
        tx = clamp(mate.x + dir * lead, 16, 984);
        ty = clamp(mate.y + (325 - mate.y) * (receiverDirective.cutInside ? 0.28 : 0.08), 16, 634);
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
        lane * baseProfile.laneW +
        openness * baseProfile.openW +
        progressUnits * baseProfile.progW * 0.1 -
        Math.abs(distM - preferred) * 0.62;

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
      if (flavor === "through") score += 7 + sp.p.creativity * 0.22;
      if (flavor === "switch") score += 9;
      if (flavor === "pullback") score += 14;

      // Individual instruction has final authority over team defaults.
      if (passerDirective.shortPassing && distM < 16) score += 12;
      if (passerDirective.shortPassing && distM > 25) score -= 15;
      if (passerDirective.directPassing && progressM > 8 && distM > 23) score += 14;
      if (passerDirective.riskyPasses && (flavor === "through" || risky)) score += 9;
      if (passerDirective.switchPlay && flavor === "switch") score += 15;
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
      this.statsPassAttempt(side);
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

    this.statsPassAttempt(side);
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
      toX: target.x,
      toY: target.y,
      t: 0,
      dur: clamp(distM / speed, 0.22, 3.8),
      side,
      targetIdx: target.idx,
      passOutcome: outcome,
      arcH,
      flavor,
      passerId: sp.p.id,
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

    if (side === "home") {
      this.stats.shotsHome += 1;
      if (outcome.goal || outcome.saved) this.stats.shotsOnTargetHome += 1;
    } else {
      this.stats.shotsAway += 1;
      if (outcome.goal || outcome.saved) this.stats.shotsOnTargetAway += 1;
    }
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
    this.flight = f;
    this.ballHeight = 0;
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
    }
    if (this.phase === "flight") this.phase = "open";
  }

  private resolvePassArrival(f: Flight): void {
    const side = f.side;
    const defending = this.other(side);
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
      if (defender && dd < 95 && rd < 115 && (f.flavor === "lofted" || f.flavor === "switch")) {
        const winner = resolveAerialDuel(receiver.p, defender.p, this.rng);
        if (winner === "a") {
          this.statsPassComplete(side);
          this.bumpRating(receiver, 0.035);
          this.giveBallTo(side, receiverIdx);
        } else {
          this.bumpRating(defender, 0.06);
          this.giveBallTo(defending, defenderIdx);
        }
        return;
      }
      if (defender && dd < 48 && rd < 70) {
        const winner = resolveLooseBallDuel(receiver.p, defender.p, this.rng);
        if (winner === "a") {
          this.statsPassComplete(side);
          this.giveBallTo(side, receiverIdx);
        } else {
          this.bumpRating(defender, 0.04);
          this.giveBallTo(defending, defenderIdx);
        }
        return;
      }
      if (rd < 145) {
        this.statsPassComplete(side);
        this.giveBallTo(side, receiverIdx);
        return;
      }
    }

    if (outcome.intercepted && defender) {
      this.bumpRating(defender, 0.05);
      this.giveBallTo(defending, defenderIdx);
      return;
    }
    // Bad touch / overhit ball becomes a genuine second-ball contest.
    this.makeLoose(f.toX, f.toY, side);
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
      this.awardGoal(attacking);
      return;
    }
    if (outcome.saved) {
      let gkIdx = this.players(defending).findIndex((p) => p.role === "GK");
      if (gkIdx < 0) gkIdx = this.nearestPlayerIndex(defending, f.toX, f.toY);
      const gk = this.players(defending)[gkIdx];
      if (gk) {
        gk.x = f.toX;
        gk.y = f.toY;
        this.bumpRating(gk, 0.25);
        this.pushEvent(
          MatchEventType.ShotSaved,
          gk.p.contract.clubId,
          gk.p.id,
          `Great save by ${gk.p.firstName} ${gk.p.lastName}!`,
        );
      }
      this.giveBallTo(defending, Math.max(gkIdx, 0));
      return;
    }
    if (outcome.blocked) {
      this.lastTouchSide = defending;
      this.makeLoose(f.toX, f.toY, attacking);
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
      const idx = this.nearestPlayerIndex(defending, f.toX, f.toY);
      if (idx >= 0) this.giveBallTo(defending, idx);
      return;
    }
    att.x = clamp(f.toX - this.attackDir(attacking) * 6, 8, 992);
    att.y = clamp(f.toY, 8, 642);
    def.x = clamp(f.toX + this.attackDir(attacking) * 6, 8, 992);
    def.y = clamp(f.toY, 8, 642);
    const gk = this.players(defending).find((p) => p.role === "GK") ?? def;
    const danger = clamp(1 - Math.abs(f.toX - this.goalX(attacking)) / 400, 0.2, 1);
    const res = resolveHeader(att.p, def.p, gk.p, danger, this.rng);
    if (!res.cleared) {
      this.statsPassComplete(attacking);
      if (attacking === "home") {
        this.stats.shotsHome += 1;
        if (res.goal || res.saved) this.stats.shotsOnTargetHome += 1;
      } else {
        this.stats.shotsAway += 1;
        if (res.goal || res.saved) this.stats.shotsOnTargetAway += 1;
      }
    }

    if (res.goal) {
      this.bumpRating(att, 0.3);
      this.awardGoal(attacking, att);
      return;
    }
    if (res.saved) {
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
      this.makeLoose(f.toX, f.toY, defending);
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
      if (d > 160) continue;
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
    const p = this.players(side)[idx];
    if (!p || p.sentOff) {
      this.makeLoose(this.ball.x, this.ball.y, side);
      return;
    }
    if (this.possessionSide !== side) {
      this.lastTurnover = { side, t: this.worldTime };
    }
    this.carrier = { side, i: idx };
    this.possessionSide = side;
    this.lastTouchSide = side;
    this.flight = null;
    this.phase = "open";
    this.decisionCd = this.decisionDelay(side, p);
    this.ball.x = p.x;
    this.ball.y = p.y;
    this.ballHeight = 0;
    this.looseLockSide = null;
  }

  /** `lockSide` is the side that last lost/touched the ball and cannot reclaim
   * it for a fraction of a second; this prevents instant ping-pong rebounds. */
  private makeLoose(x: number, y: number, lockSide: Side): void {
    this.carrier = null;
    this.flight = null;
    this.phase = "open";
    this.ball.x = clamp(x, 3, PITCH_W - 3);
    this.ball.y = clamp(y, 3, PITCH_H - 3);
    this.ballHeight = 0;
    this.looseLockSide = lockSide;
    this.looseLockT = 0.22;
  }

  private tickLooseBall(dt: number): void {
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
    const close = available.filter((c) => c.d < 48);

    if (close.length === 2 && close[0].sp && close[1].sp) {
      let winner = resolveLooseBallDuel(close[0].sp.p, close[1].sp.p, this.rng);
      // Being clearly first to the ball matters, but anticipation/pace can
      // overcome a small positional disadvantage.
      if (Math.abs(close[0].d - close[1].d) > 20) winner = close[0].d < close[1].d ? "a" : "b";
      const won = winner === "a" ? close[0] : close[1];
      const lost = winner === "a" ? close[1] : close[0];
      this.bumpRating(won.sp, 0.025);
      if (won.sp && lost.sp && resolveHoldOff(won.sp.p, lost.sp.p, this.rng)) {
        this.giveBallTo(won.side, won.idx);
        return;
      }
      // Ball squirts a few metres from a 50/50 rather than sticking to a dot.
      this.ball.x = clamp(this.ball.x + this.rng.float(-22, 22), 5, 995);
      this.ball.y = clamp(this.ball.y + this.rng.float(-22, 22), 5, 645);
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

    const challengers = this.players(this.other(side))
      .filter((op) => !op.sentOff && op.tackleCd <= 0)
      .sort((a, b) => Math.hypot(a.x - sp.x, a.y - sp.y) - Math.hypot(b.x - sp.x, b.y - sp.y));

    for (const op of challengers) {
      const opDir = this.directives(this.other(side), op);
      const d = Math.hypot(op.x - sp.x, op.y - sp.y) / UNITS_PER_METER;
      const reach = opDir.pressHard ? 4.9 : 4.25;
      if (d > reach) break;

      op.tackleCd = this.rng.float(opDir.pressHard ? 0.7 : 1.0, opDir.pressHard ? 1.35 : 1.9);

      // Before a tackle, contact can become a physical shielding duel. Strong
      // target players protect it; powerful defenders can still roll them.
      const shielding = carrierDir.targetMan || sp.p.strength + sp.p.balance > 28;
      if (shielding && this.rng.chance(carrierDir.targetMan ? 0.54 : 0.28)) {
        if (resolveHoldOff(sp.p, op.p, this.rng)) {
          this.bumpRating(sp, 0.02);
          sp.runUntil = Math.max(sp.runUntil, this.worldTime + 0.6);
          return;
        }
      }

      this.statsTackleAttempt(this.other(side));
      const res = resolveTackle(op.p, sp.p, this.rng);
      if (res.won) {
        this.giveBallTo(this.other(side), this.indexOfPlayer(this.other(side), op));
        this.bumpRating(op, 0.14);
        this.bumpRating(sp, -0.04);
        return;
      }
      if (res.foul) {
        this.awardFoul(side, op, sp, res.card);
        return;
      }
      // Failed standing challenge: attacker escapes into the space behind.
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

  private statsPassAttempt(side: Side): void {
    if (side === "home") this.stats.passesAttemptedHome += 1;
    else this.stats.passesAttemptedAway += 1;
  }

  private statsPassComplete(side: Side): void {
    if (side === "home") this.stats.passesCompletedHome += 1;
    else this.stats.passesCompletedAway += 1;
  }

  // -------------------------------------------------------------------------
  // Set pieces
  // -------------------------------------------------------------------------

  private startSetPiece(kind: SetPiece["kind"], side: Side, x: number, y: number): void {
    this.phase = "setpiece";
    this.carrier = null;
    this.flight = null;
    this.setPiece = {
      kind,
      side,
      x: clamp(x, 5, 995),
      y: clamp(y, 5, 645),
      timer: kind === "corner" ? 3.2 : 2.4,
    };
    this.ball.x = this.setPiece.x;
    this.ball.y = this.setPiece.y;
    this.possessionSide = side;
    this.lastTouchSide = side;
  }

  private tickSetPiece(dt: number): void {
    const sp = this.setPiece;
    if (!sp) {
      this.phase = "open";
      return;
    }
    sp.timer -= dt;

    const takerIdx = this.nearestPlayerIndex(sp.side, sp.x, sp.y);
    if (takerIdx >= 0) {
      const taker = this.players(sp.side)[takerIdx];
      taker.tx = sp.x;
      taker.ty = sp.y;
      this.movePlayer(taker, dt, 1.0);
      this.ball.x = taker.x;
      this.ball.y = taker.y;
    }

    if (sp.timer <= 0) {
      this.executeSetPiece(sp);
      this.setPiece = null;
    }
  }

  private executeSetPiece(sp: SetPiece): void {
    const side = sp.side;
    const dir = this.attackDir(side);
    const goalX = this.goalX(side);
    const distToGoal = Math.abs(goalX - sp.x) / UNITS_PER_METER;
    const team = side === "home" ? this.home : this.away;
    const takerIdx = this.nearestPlayerIndex(side, sp.x, sp.y);
    const taker = takerIdx >= 0 ? this.players(side)[takerIdx] : undefined;

    if (sp.kind === "throw") {
      const target = taker
        ? this.choosePass(side, taker, team.tactics.playStyle ?? PlayStyle.Balanced, dir)
        : null;
      if (target && taker) this.executePass(side, taker, target);
      else this.makeLoose(sp.x, sp.y, this.other(side));
      return;
    }

    if (sp.kind === "goalKick") {
      const idx = this.nearestPlayerIndex(side, sp.x, sp.y);
      const gk = idx >= 0 ? this.players(side)[idx] : undefined;
      if (gk) {
        const target = this.choosePass(side, gk, PlayStyle.Balanced, dir);
        if (target) this.executePass(side, gk, target);
        else this.makeLoose(sp.x, sp.y, this.other(side));
      }
      return;
    }

    if (sp.kind === "corner") {
      const toX = goalX + dir * -this.rng.float(45, 110);
      const toY = clamp(PITCH_H / 2 + this.rng.float(-95, 95), 60, 590);
      this.launchFlight({
        kind: "cross",
        fromX: sp.x,
        fromY: sp.y,
        toX,
        toY,
        t: 0,
        dur: this.rng.float(1.1, 1.7),
        side,
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
          if (side === "home") {
            this.stats.shotsHome += 1;
            if (outcome.goal || outcome.saved) this.stats.shotsOnTargetHome += 1;
          } else {
            this.stats.shotsAway += 1;
            if (outcome.goal || outcome.saved) this.stats.shotsOnTargetAway += 1;
          }
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
        this.launchFlight({
          kind: "cross",
          fromX: sp.x,
          fromY: sp.y,
          toX,
          toY,
          t: 0,
          dur: this.rng.float(1.0, 1.6),
          side,
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
    this.setPiece = null;
    this.carrier = null;
    this.flight = null;
    const spotX = side === "home" ? 890 : 110;
    this.ball = { x: spotX, y: PITCH_H / 2 };
    this.ballHeight = 0;
    this.penaltyState = { side, timer: 2.6, resolved: false };
  }

  private tickPenalty(dt: number): void {
    const ps = this.penaltyState;
    if (!ps) {
      this.phase = "open";
      return;
    }
    const idx = this.nearestPlayerIndex(ps.side, this.ball.x, this.ball.y);
    if (idx >= 0) {
      const taker = this.players(ps.side)[idx];
      taker.tx = this.ball.x - this.attackDir(ps.side) * 12;
      taker.ty = this.ball.y;
      this.movePlayer(taker, dt, 0.8);
    }
    ps.timer -= dt;
    if (ps.timer <= 0 && !ps.resolved) {
      ps.resolved = true;
      this.resolvePenaltyShot(ps.side, idx);
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
    if (side === "home") {
      this.stats.shotsHome += 1;
      this.stats.shotsOnTargetHome += 1;
    } else {
      this.stats.shotsAway += 1;
      this.stats.shotsOnTargetAway += 1;
    }

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
        toY: PITCH_H / 2 + this.rng.pick([-110, -55, 0, 55, 110]),
        t: 0,
        dur: 0.5,
        side,
        shotOutcome: { goal: true, saved: false, blocked: false, wide: false },
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
      toY: PITCH_H / 2 + this.rng.pick([-90, 90]),
      t: 0,
      dur: 0.5,
      side,
      shotOutcome: { goal: false, saved: true, blocked: false, wide: false },
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

    this.concedingSide = this.other(side);
    this.phase = "celebration";
    this.phaseTimer = 3.5;
    this.carrier = null;
    this.flight = null;
    this.setPiece = null;
    this.penaltyState = null;
    this.ball = { x: PITCH_W / 2, y: PITCH_H / 2 };
    this.ballHeight = 0;
    this.resetShapes();
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
  // AI manager adjustments (minutes 60, 75, 85)
  // -------------------------------------------------------------------------

  private tickAIManager(): void {
    const minute = Math.floor(this.gameTime / 60);
    for (const side of ["home", "away"] as Side[]) {
      const team = side === "home" ? this.home : this.away;
      if (team.isUserTeam) continue;
      for (const checkMin of [60, 75, 85]) {
        const key = `${side}-${checkMin}`;
        if (minute >= checkMin && !this.aiChecksDone.has(key)) {
          this.aiChecksDone.add(key);
          this.applyAIAdjustment(side, minute);
        }
      }
    }
  }

  private applyAIAdjustment(side: Side, minute: number): void {
    const team = side === "home" ? this.home : this.away;
    const t = team.tactics;
    const my = side === "home" ? this.homeScore : this.awayScore;
    const opp = side === "home" ? this.awayScore : this.homeScore;
    const diff = my - opp;

    if (diff <= -2) {
      t.mentality = Math.min(MentalityLevel.UltraAttacking, (t.mentality ?? 3) + 2);
      t.pressing = Math.min(PressingIntensity.Extreme, (t.pressing ?? 2) + 1);
      t.tempo = Math.min(TempoSetting.VeryFast, (t.tempo ?? 2) + 1);
    } else if (diff < 0) {
      t.mentality = Math.min(MentalityLevel.UltraAttacking, (t.mentality ?? 3) + 1);
      t.pressing = Math.min(PressingIntensity.Extreme, (t.pressing ?? 2) + 1);
    } else if (diff >= 2 && minute >= 70) {
      t.mentality = Math.max(MentalityLevel.UltraDefensive, (t.mentality ?? 3) - 2);
      t.timeWasting = TimeWasting.Late;
      t.pressing = Math.max(PressingIntensity.None, (t.pressing ?? 2) - 1);
    } else if (diff === 0 && minute === 60) {
      t.pressing = Math.min(PressingIntensity.Extreme, (t.pressing ?? 2) + 1);
      t.tempo = Math.min(TempoSetting.VeryFast, (t.tempo ?? 2) + 1);
    } else {
      return;
    }

    // substitution: worst-rated outfield starter off
    if (this.subsUsed[side] < 3 && team.bench.length > 0) {
      const players = this.players(side);
      const bench = team.bench;
      let worstIdx = -1;
      let worstRating = 99;
      players.forEach((sp, i) => {
        if (sp.sentOff || sp.role === "GK") return;
        if (sp.rating < worstRating) {
          worstRating = sp.rating;
          worstIdx = i;
        }
      });
      const benchIdx = bench.findIndex(
        (bp) => !players.some((sp) => sp.p.id === bp.id) && bp.primaryPosition !== "GK",
      );
      if (worstIdx >= 0 && benchIdx >= 0 && worstRating < 7.0) {
        this.substitute(side, worstIdx, benchIdx);
      }
    }
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
  const available = [...squad];

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
      const score = fit * 100 + attrScore(p, s.role) + p.pace * 0.2;
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
    return b.reputation - a.reputation;
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
    teamDirectives: opts.teamDirectives,
    directives: opts.directives,
    isUserTeam: opts.isUserTeam,
  };
}
