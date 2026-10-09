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
  resolveDribble,
  resolveHeader,
  resolvePass,
  resolvePenalty,
  resolveShot,
  resolveTackle,
} from "@/engine/actionResolver";
import { getFormation, mirrorFormation } from "@/engine/formations";

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
  /** formation base position per starter index (already mirrored for away) */
  basePositions: { x: number; y: number }[];
  tactics: TacticalSetup;
  isUserTeam: boolean;
}

export interface SimOptions {
  seed: number;
  /** game-seconds advanced per real second at speed 1 (default 6 => 90' in 15 min) */
  timeScale?: number;
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
  tackleCd: number;
  rating: number;
  sentOff: boolean;
  yellow: boolean;
  goals: number;
  assists: number;
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
  ball: { x: number; y: number };
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
  private events: MatchEvent[] = [];
  private stats = emptyStats();
  private pendingState = false;
  private aiChecksDone = new Set<string>();
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
        tackleCd: 0, rating: 6.5, sentOff: false, yellow: false,
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

    const dt = dtReal * this.speed * this.timeScale; // game-seconds this step
    this.gameTime += dt;

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

    this.phaseTimer -= dt;
    this.decisionCd -= dt;
    for (const sp of [...this.homePlayers, ...this.awayPlayers]) sp.tackleCd -= dt;
    this.looseLockT -= dt;
    if (this.looseLockT <= 0) this.looseLockSide = null;

    switch (this.phase) {
      case "kickoff":
        this.tickKickoff(dt);
        break;
      case "celebration":
        this.tickCelebration(dt);
        break;
      case "setpiece":
        this.tickSetPiece(dt);
        this.tickMovement(dt, false);
        break;
      case "penalty":
        this.tickPenalty(dt);
        this.tickMovement(dt, false);
        break;
      case "flight":
        this.tickFlight(dt);
        this.tickPossessionStat();
        this.tickMovement(dt, false);
        break;
      case "open":
        this.tickOpen(dt);
        this.tickMovement(dt, false);
        break;
      default:
        this.tickMovement(dt, false);
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
      ball: { ...this.ball },
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
      shirtNumber: sp.p.shirtNumber,
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
      const team = side === "home" ? this.home : this.away;
      const tactics = team.tactics;
      const dir = this.attackDir(side);
      const hasBall =
        (this.carrier && this.carrier.side === side) ||
        (this.flight && this.flight.side === side) ||
        (!this.carrier && !this.flight && this.possessionSide === side);
      const widthF = 0.78 + (tactics.width ?? WidthSetting.Normal) * 0.11;
      const mentality = tactics.mentality ?? MentalityLevel.Balanced;
      const line = tactics.defensiveLine ?? DefensiveLine.Normal;
      const pressing = tactics.pressing ?? PressingIntensity.Standard;

      const players = this.players(side);
      const pressOrder = players
        .map((sp, i) => ({ i, d: Math.hypot(sp.x - this.ball.x, sp.y - this.ball.y), off: sp.sentOff }))
        .filter((o) => !o.off)
        .sort((a, b) => a.d - b.d);

      players.forEach((sp, i) => {
        if (sp.sentOff) return;
        const base = team.basePositions[i] ?? { x: 500, y: 325 };

        // Ball carrier
        if (this.carrier && this.carrier.side === side && this.carrier.i === i) {
          sp.tx = clamp(sp.x + dir * 45, 20, 980);
          sp.ty = clamp(sp.y + (this.ball.y - sp.y) * 0.3, 15, 635);
          this.movePlayer(sp, dt, 1.1);
          this.ball.x = sp.x + dir * 6;
          this.ball.y = sp.y;
          return;
        }

        // Goalkeeper
        if (sp.role === "GK") {
          const home = side === "home";
          const distToOwn = Math.abs(this.ball.x - (home ? 0 : PITCH_W));
          const gkX = home
            ? clamp(45 + Math.min(distToOwn, 300) * 0.04, 42, 62)
            : clamp(955 - Math.min(distToOwn, 300) * 0.04, 938, 958);
          sp.tx = gkX;
          sp.ty = clamp(325 + (this.ball.y - 325) * 0.3, 245, 405);
          this.movePlayer(sp, dt, 1.0);
          return;
        }

        // Kickoff: keep everyone in own half (except carrier handled above)
        if (frozen) {
          const halfClamped = side === "home" ? Math.min(base.x, 480) : Math.max(base.x, 520);
          sp.tx = halfClamped;
          sp.ty = 325 + (base.y - 325) * widthF;
          this.movePlayer(sp, dt, 0.85);
          return;
        }

        // Shape: width-scaled base + possession/mentality/line shifts + ball attraction
        let ty = 325 + (base.y - 325) * widthF;
        let tx = base.x;

        const possShift = hasBall ? 55 : -38;
        const mentShift = (mentality - 3) * 16;
        const lineShift = (line - 2) * 26;
        tx += dir * (possShift + mentShift * 0.6 + lineShift * (hasBall ? 0.7 : 1));
        tx += (this.ball.x - 500) * 0.24;
        ty += (this.ball.y - 325) * 0.4;

        // Pressing: closest outfield players hunt the ball
        if (
          !hasBall &&
          pressing >= PressingIntensity.Standard &&
          (pressOrder[0]?.i === i || pressOrder[1]?.i === i)
        ) {
          const urgency = pressing >= PressingIntensity.High ? 0.85 : 0.65;
          tx = tx + (this.ball.x - tx) * urgency;
          ty = ty + (this.ball.y - ty) * urgency;
        }

        sp.tx = clamp(tx, 25, 975);
        sp.ty = clamp(ty, 15, 635);
        this.movePlayer(sp, dt, 1);
      });
    }
  }

  /** Move toward target with a realistic max speed (m/s from attributes). */
  private movePlayer(sp: SimPlayer, dt: number, speedFactor: number): void {
    const maxSpeed = (5.5 + sp.p.pace * 0.2 + sp.p.acceleration * 0.08) * speedFactor; // m/s
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
    const team = side === "home" ? this.home : this.away;
    const dir = this.attackDir(side);
    const idx = this.players(side).indexOf(sp);

    // Goalkeepers: distribute (never shoot/dribble)
    if (sp.role === "GK") {
      const target = this.choosePass(side, sp, PlayStyle.Balanced, dir);
      if (target) {
        this.executePass(side, sp, target);
      } else {
        this.decisionCd = this.rng.float(0.5, 1.0);
      }
      return;
    }

    const goalX = this.goalX(side);
    const distToGoal =
      Math.hypot(goalX - sp.x, (PITCH_H / 2 - sp.y) * 0.7) / UNITS_PER_METER;
    const pressure = this.pressureOn(side, idx);
    const ment = team.tactics.mentality ?? MentalityLevel.Balanced;
    const style = team.tactics.playStyle ?? PlayStyle.Balanced;

    // 1) Shoot?
    const shootUrge =
      distToGoal < 16
        ? 0.9
        : distToGoal < 24
          ? clamp(0.4 + (24 - distToGoal) * 0.03 + (ment - 3) * 0.05, 0.1, 0.85)
          : distToGoal < 34
            ? clamp(0.07 + sp.p.longShots * 0.012 + (ment - 3) * 0.03, 0.02, 0.3)
            : 0.01;

    if (this.rng.chance(shootUrge)) {
      this.executeShot(side, sp, distToGoal);
      return;
    }

    // 2) Dribble under pressure?
    if (pressure > 0.45 && this.rng.chance(0.25 + sp.p.dribbling * 0.02)) {
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
          return;
        }
        this.decisionCd = this.rng.float(0.35, 0.7);
        this.bumpRating(sp, 0.06);
        return;
      }
    }

    // 3) Pass
    const pass = this.choosePass(side, sp, style, dir);
    if (pass) {
      this.executePass(side, sp, pass);
      return;
    }

    // 4) Nothing on: hold
    this.decisionCd = this.rng.float(0.3, 0.6);
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
  ): { idx: number; x: number; y: number; score: number } | null {
    const players = this.players(side);
    const myIdx = this.indexOfPlayer(side, sp);
    const candidates: { idx: number; x: number; y: number; score: number }[] = [];

    players.forEach((mate, idx) => {
      if (idx === myIdx || mate.sentOff) return;
      const distM = Math.hypot(mate.x - sp.x, mate.y - sp.y) / UNITS_PER_METER;
      if (distM < 4 || distM > 65) return;
      // GK only as emergency back-pass
      if (
        mate.role === "GK" &&
        !(distToOwnGoal(side, sp) < 22 && this.rng.chance(0.4))
      ) {
        return;
      }

      const progress = (mate.x - sp.x) * dir;
      const openness = clamp(this.nearestOpponentDist(mate.x, mate.y), 0, 30);
      const laneSafety = this.laneSafety(side, sp.x, sp.y, mate.x, mate.y);
      let score = laneSafety * 1.6 + openness * 1.0 + progress * 0.16 - Math.abs(distM - 18) * 0.35;

      if (style === PlayStyle.LongBallDirect || style === PlayStyle.RouteOne) {
        if (distM > 30 && progress > 8) score += 8;
        if (mate.role === "ST" || mate.role === "CF") score += 4;
      }
      if (
        style === PlayStyle.WingPlay &&
        (mate.role.includes("W") || mate.role === "LM" || mate.role === "RM")
      ) {
        score += 5;
      }
      if (mate.role === "ST" && progress > 0) score += 2;
      candidates.push({ idx, x: mate.x, y: mate.y, score: Math.max(score, 0.1) });
    });

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, 3);
    const total = top.reduce((s, c) => s + c.score, 0);
    let r = this.rng.float(0, total);
    for (const c of top) {
      r -= c.score;
      if (r <= 0) return c;
    }
    return top[0];
  }

  private nearestOpponentDist(x: number, y: number): number {
    let nearest = 999;
    for (const side of ["home", "away"] as Side[]) {
      this.players(side).forEach((sp) => {
        if (sp.sentOff) return;
        const d = Math.hypot(sp.x - x, sp.y - y) / UNITS_PER_METER;
        if (d < nearest) nearest = d;
      });
    }
    return nearest;
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

  private executePass(
    side: Side,
    sp: SimPlayer,
    target: { idx: number; x: number; y: number },
  ): void {
    const receiver = this.players(side)[target.idx];
    if (!receiver) {
      this.decisionCd = 0.3;
      return;
    }

    const distM = Math.hypot(target.x - sp.x, target.y - sp.y) / UNITS_PER_METER;
    const pressure = this.pressureOn(side, this.indexOfPlayer(side, sp));
    const inter = this.opponentInterceptionsNear(side, target.x, target.y);
    const outcome = resolvePass(sp.p, receiver.p, distM, pressure, inter, this.rng);

    this.statsPassAttempt(side);
    if (outcome.success) this.statsPassComplete(side);
    this.bumpRating(sp, outcome.success ? 0.03 : -0.05);
    this.assistWindow = { side, playerId: sp.p.id, t: this.gameTime };

    this.launchFlight({
      kind: "pass",
      fromX: this.ball.x,
      fromY: this.ball.y,
      toX: target.x,
      toY: target.y,
      t: 0,
      dur: clamp(distM / this.rng.float(16, 24), 0.25, 3.2),
      side,
      targetIdx: target.idx,
      passOutcome: outcome,
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
    });
    this.lastTouchSide = side;
    this.possessionSide = side;
  }

  private launchFlight(f: Flight): void {
    this.flight = f;
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
    const arc =
      f.kind === "cross" || f.kind === "shot"
        ? Math.sin(t * Math.PI) * (f.kind === "cross" ? 26 : 8)
        : 0;
    this.ball.x = f.fromX + (f.toX - f.fromX) * t;
    this.ball.y = f.fromY + (f.toY - f.fromY) * t - arc;

    if (t < 1) return;

    const arrived = f;
    this.flight = null;
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
    const outcome = f.passOutcome!;
    if (outcome.success && f.targetIdx !== undefined) {
      const idx = this.availableReceiver(side, f.targetIdx, f.toX, f.toY);
      if (idx >= 0) {
        this.giveBallTo(side, idx);
        return;
      }
    }
    if (outcome.intercepted) {
      const idx = this.nearestPlayerIndex(this.other(side), f.toX, f.toY);
      if (idx >= 0) {
        this.giveBallTo(this.other(side), idx);
        return;
      }
    }
    // miscontrolled into space
    this.makeLoose(f.toX, f.toY, side);
  }

  private availableReceiver(side: Side, preferred: number, x: number, y: number): number {
    const p = this.players(side)[preferred];
    if (p && !p.sentOff) {
      p.x = x;
      p.y = y;
      return preferred;
    }
    return this.nearestPlayerIndex(side, x, y);
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
      this.makeLoose(f.toX, f.toY, defending);
      return;
    }
    // wide
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
    this.carrier = { side, i: idx };
    this.possessionSide = side;
    this.lastTouchSide = side;
    this.flight = null;
    this.phase = "open";
    this.decisionCd = this.rng.float(0.5, 1.1);
    this.ball.x = p.x;
    this.ball.y = p.y;
    this.looseLockSide = null;
  }

  private makeLoose(x: number, y: number, lockSide: Side): void {
    this.carrier = null;
    this.flight = null;
    this.phase = "open";
    this.ball.x = clamp(x, 3, PITCH_W - 3);
    this.ball.y = clamp(y, 3, PITCH_H - 3);
    this.looseLockSide = lockSide;
    this.looseLockT = 0.5;
  }

  private tickLooseBall(dt: number): void {
    void dt;
    let bestIdx: { side: Side; i: number } | null = null;
    let bestD = 40; // 4m pickup radius
    for (const side of ["home", "away"] as Side[]) {
      if (side === this.looseLockSide) continue;
      this.players(side).forEach((sp, i) => {
        if (sp.sentOff) return;
        const d = Math.hypot(sp.x - this.ball.x, sp.y - this.ball.y);
        if (d < bestD) {
          bestD = d;
          bestIdx = { side, i };
        }
      });
    }
    if (bestIdx) {
      const { side, i } = bestIdx as { side: Side; i: number };
      const sp = this.players(side)[i];
      const controlChance = clamp(0.35 + sp.p.ballControl * 0.03, 0.3, 0.9);
      if (this.rng.chance(controlChance * 0.5)) {
        this.giveBallTo(side, i);
        return;
      }
    }
    this.tickPossessionStat();
    this.checkBounds();
  }

  // -------------------------------------------------------------------------
  // Tackles & fouls
  // -------------------------------------------------------------------------

  private tickTackles(): void {
    if (!this.carrier) return;
    const side = this.carrier.side;
    const sp = this.players(side)[this.carrier.i];
    if (!sp || sp.role === "GK") return; // keepers are protected in their box

    for (const op of this.players(this.other(side))) {
      if (op.sentOff || op.tackleCd > 0) continue;
      const d = Math.hypot(op.x - sp.x, op.y - sp.y) / UNITS_PER_METER;
      if (d > 4.5) continue;

      this.statsTackleAttempt(this.other(side));
      op.tackleCd = this.rng.float(1.0, 2.0);
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
      if (this.assistWindow && this.assistWindow.side === side && this.gameTime - this.assistWindow.t < 10) {
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
    basePositions: positions,
    tactics: opts.tactics,
    isUserTeam: opts.isUserTeam,
  };
}
