/**
 * Deterministic, telemetry-driven touchline advice.
 *
 * Inspired by actionable match feedback in contemporary manager games, but
 * every recommendation is derived from the current simulation state and maps
 * directly to controls the match engine already executes.
 */
import {
  DefensiveLine,
  MentalityLevel,
  PressingIntensity,
  TempoSetting,
  TimeWasting,
  WidthSetting,
  type MatchStats,
  type TacticalSetup,
} from "@/types";
import type { Side } from "@/engine/matchSimulator";

export type TacticalAdjustmentKey =
  | "tempo"
  | "passingLength"
  | "defensiveLine"
  | "pressing"
  | "width"
  | "mentality"
  | "timeWasting"
  | "offsideTrap"
  | "counterAttack";

export type TacticalAdvicePatch = Partial<Pick<TacticalSetup, TacticalAdjustmentKey>>;

export type TacticalAdviceId =
  | "protect-lead"
  | "chase-game"
  | "protect-space-behind"
  | "stop-wide-supply"
  | "create-chances"
  | "secure-possession"
  | "disrupt-circulation"
  | "leave-crossing-loop";

export interface TacticalAdvice {
  id: TacticalAdviceId;
  priority: number;
  title: string;
  observation: string;
  recommendation: string;
  patch: TacticalAdvicePatch;
  /** Human-readable, exact control changes generated from the patch. */
  changes: string[];
}

export interface TacticalAdviceContext {
  minute: number;
  side: Side;
  scoreFor: number;
  scoreAgainst: number;
  stats: MatchStats;
  tactics: TacticalSetup;
}

interface SideStats {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  passesAttempted: number;
  passesCompleted: number;
  crosses: number;
  throughBalls: number;
  dribblesAttempted: number;
}

interface AdviceCandidate {
  id: TacticalAdviceId;
  priority: number;
  title: string;
  observation: string;
  recommendation: string;
  patch: TacticalAdvicePatch;
}

const LABELS: Record<TacticalAdjustmentKey, string> = {
  tempo: "Tempo",
  passingLength: "Passing",
  defensiveLine: "Defensive line",
  pressing: "Pressing",
  width: "Width",
  mentality: "Mentality",
  timeWasting: "Time wasting",
  offsideTrap: "Offside trap",
  counterAttack: "Counter attack",
};

const TEMPO_LABELS = ["Very Slow", "Slow", "Normal", "Fast", "Very Fast"];
const PASSING_LABELS = ["Very Short", "Short", "Normal", "Direct", "Very Direct"];
const LINE_LABELS = ["Very Deep", "Deep", "Normal", "High", "Very High"];
const PRESSING_LABELS = ["None", "Low", "Standard", "High", "Extreme"];
const WIDTH_LABELS = ["Very Narrow", "Narrow", "Normal", "Wide", "Very Wide"];
const MENTALITY_LABELS = [
  "Ultra Defensive", "Defensive", "Cautious", "Balanced", "Positive", "Attacking", "Ultra Attacking",
];

function sideStats(stats: MatchStats, side: Side): { own: SideStats; opponent: SideStats } {
  const home: SideStats = {
    possession: stats.possessionHome,
    shots: stats.shotsHome,
    shotsOnTarget: stats.shotsOnTargetHome,
    passesAttempted: stats.passesAttemptedHome,
    passesCompleted: stats.passesCompletedHome,
    crosses: stats.crossesHome,
    throughBalls: stats.throughBallsHome,
    dribblesAttempted: stats.dribblesAttemptedHome,
  };
  const away: SideStats = {
    possession: stats.possessionAway,
    shots: stats.shotsAway,
    shotsOnTarget: stats.shotsOnTargetAway,
    passesAttempted: stats.passesAttemptedAway,
    passesCompleted: stats.passesCompletedAway,
    crosses: stats.crossesAway,
    throughBalls: stats.throughBallsAway,
    dribblesAttempted: stats.dribblesAttemptedAway,
  };
  return side === "home" ? { own: home, opponent: away } : { own: away, opponent: home };
}

function passAccuracy(team: SideStats): number {
  return team.passesAttempted > 0 ? team.passesCompleted / team.passesAttempted : 0;
}

function adjustmentKeys(patch: TacticalAdvicePatch): TacticalAdjustmentKey[] {
  return Object.keys(patch) as TacticalAdjustmentKey[];
}

function settingLabel(key: TacticalAdjustmentKey, value: TacticalSetup[TacticalAdjustmentKey]): string {
  if (key === "offsideTrap" || key === "counterAttack") return value ? "On" : "Off";
  if (key === "timeWasting") return String(value);
  const number = Number(value);
  if (key === "tempo") return TEMPO_LABELS[number] ?? String(value);
  if (key === "passingLength") return PASSING_LABELS[number] ?? String(value);
  if (key === "defensiveLine") return LINE_LABELS[number] ?? String(value);
  if (key === "pressing") return PRESSING_LABELS[number] ?? String(value);
  if (key === "width") return WIDTH_LABELS[number] ?? String(value);
  return MENTALITY_LABELS[number] ?? String(value);
}

function buildAdvice(candidate: AdviceCandidate, tactics: TacticalSetup): TacticalAdvice | null {
  const changedPatch: TacticalAdvicePatch = {};
  const changes: string[] = [];
  for (const key of adjustmentKeys(candidate.patch)) {
    const next = candidate.patch[key];
    if (next === undefined || tactics[key] === next) continue;
    // All advice values are created by this module from their matching enums.
    // The indexed assignment is safe while retaining a strongly typed public patch.
    (changedPatch as Record<TacticalAdjustmentKey, TacticalSetup[TacticalAdjustmentKey]>)[key] = next;
    changes.push(`${LABELS[key]}: ${settingLabel(key, tactics[key])} → ${settingLabel(key, next)}`);
  }
  if (changes.length === 0) return null;
  return { ...candidate, patch: changedPatch, changes };
}

/**
 * Return at most two non-conflicting recommendations, highest priority first.
 * Advice starts after 15 minutes so small opening samples do not trigger noise.
 */
export function generateTacticalAdvice(context: TacticalAdviceContext): TacticalAdvice[] {
  const minute = Math.max(0, Math.min(120, Math.floor(context.minute)));
  if (minute < 15) return [];

  const { own, opponent } = sideStats(context.stats, context.side);
  const { tactics } = context;
  const goalDifference = context.scoreFor - context.scoreAgainst;
  const candidates: AdviceCandidate[] = [];
  const add = (candidate: AdviceCandidate) => candidates.push(candidate);

  if (minute >= 70 && goalDifference > 0) {
    const lateWaste = minute >= 82 ? TimeWasting.Always : TimeWasting.Late;
    add({
      id: "protect-lead",
      priority: 100 + Math.min(3, goalDifference),
      title: "Close the game down",
      observation: `You lead by ${goalDifference} with ${90 - Math.min(90, minute)} regulation minutes left.`,
      recommendation: "Reduce transition risk, slow the game and protect central space.",
      patch: {
        mentality: Math.min(tactics.mentality, MentalityLevel.Cautious) as MentalityLevel,
        tempo: Math.min(tactics.tempo, TempoSetting.Slow) as TempoSetting,
        defensiveLine: Math.min(tactics.defensiveLine, DefensiveLine.Normal) as DefensiveLine,
        timeWasting: lateWaste,
      },
    });
  }

  if (minute >= 65 && goalDifference < 0) {
    add({
      id: "chase-game",
      priority: 101 + Math.min(3, Math.abs(goalDifference)),
      title: "Raise the attacking urgency",
      observation: `You trail by ${Math.abs(goalDifference)} after ${minute} minutes.`,
      recommendation: "Commit more players, circulate faster and press immediately after losses.",
      patch: {
        mentality: Math.max(tactics.mentality, MentalityLevel.Attacking) as MentalityLevel,
        tempo: Math.max(tactics.tempo, TempoSetting.Fast) as TempoSetting,
        pressing: Math.max(tactics.pressing, PressingIntensity.High) as PressingIntensity,
        timeWasting: TimeWasting.Never,
      },
    });
  }

  if (
    minute >= 20 &&
    opponent.throughBalls >= Math.max(3, own.throughBalls + 2) &&
    tactics.defensiveLine >= DefensiveLine.Normal
  ) {
    add({
      id: "protect-space-behind",
      priority: 86,
      title: "Protect the space behind",
      observation: `The opposition have completed or attempted ${opponent.throughBalls} through balls against your line.`,
      recommendation: "Drop the line and remove the offside trap before another runner breaks through.",
      patch: {
        defensiveLine: Math.min(tactics.defensiveLine, DefensiveLine.Deep) as DefensiveLine,
        offsideTrap: false,
      },
    });
  }

  if (minute >= 20 && opponent.crosses >= Math.max(6, own.crosses + 3)) {
    add({
      id: "stop-wide-supply",
      priority: 80,
      title: "Stop the wide supply",
      observation: `They have delivered ${opponent.crosses} crosses, ${opponent.crosses - own.crosses} more than your side.`,
      recommendation: "Widen the defensive block and engage their wide players earlier.",
      patch: {
        width: Math.max(tactics.width, WidthSetting.Wide) as WidthSetting,
        pressing: Math.max(tactics.pressing, PressingIntensity.High) as PressingIntensity,
      },
    });
  }

  const projectedShots = minute > 0 ? own.shots * (90 / minute) : 0;
  if (minute >= 25 && projectedShots < 4 && goalDifference <= 1) {
    add({
      id: "create-chances",
      priority: 74,
      title: "Increase chance creation",
      observation: `${own.shots} shot${own.shots === 1 ? "" : "s"} after ${minute} minutes projects to fewer than four over the match.`,
      recommendation: "Move the team forward and play with more attacking speed.",
      patch: {
        mentality: Math.max(tactics.mentality, MentalityLevel.Positive) as MentalityLevel,
        tempo: Math.max(tactics.tempo, TempoSetting.Fast) as TempoSetting,
      },
    });
  }

  const ownAccuracy = passAccuracy(own);
  if (own.passesAttempted >= 60 && ownAccuracy < 0.72) {
    add({
      id: "secure-possession",
      priority: 68,
      title: "Secure the next pass",
      observation: `Pass completion is ${Math.round(ownAccuracy * 100)}% from ${own.passesAttempted} attempts.`,
      recommendation: "Shorten the passing range and take unnecessary speed out of possession.",
      patch: {
        passingLength: Math.min(tactics.passingLength, TempoSetting.Slow) as TempoSetting,
        tempo: Math.min(tactics.tempo, TempoSetting.Normal) as TempoSetting,
      },
    });
  }

  const opponentAccuracy = passAccuracy(opponent);
  if (
    minute >= 25 &&
    own.possession < 40 &&
    opponent.passesAttempted >= 60 &&
    opponentAccuracy >= 0.82
  ) {
    add({
      id: "disrupt-circulation",
      priority: 64,
      title: "Disrupt their circulation",
      observation: `They hold ${opponent.possession}% possession and complete ${Math.round(opponentAccuracy * 100)}% of passes.`,
      recommendation: "Increase pressure on receivers instead of allowing uncontested circulation.",
      patch: {
        pressing: Math.max(tactics.pressing, PressingIntensity.High) as PressingIntensity,
      },
    });
  }

  if (minute >= 25 && own.crosses >= 8 && own.shots <= 2 && own.throughBalls <= 1) {
    add({
      id: "leave-crossing-loop",
      priority: 60,
      title: "Stop forcing the same attack",
      observation: `${own.crosses} crosses have produced only ${own.shots} shots and little central penetration.`,
      recommendation: "Narrow the attack and use shorter combinations to find a different route.",
      patch: {
        width: Math.min(tactics.width, WidthSetting.Normal) as WidthSetting,
        passingLength: Math.min(tactics.passingLength, TempoSetting.Slow) as TempoSetting,
      },
    });
  }

  const built = candidates
    .map((candidate) => buildAdvice(candidate, tactics))
    .filter((advice): advice is TacticalAdvice => advice !== null)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  const selected: TacticalAdvice[] = [];
  const occupied = new Set<TacticalAdjustmentKey>();
  for (const advice of built) {
    const keys = adjustmentKeys(advice.patch);
    if (keys.some((key) => occupied.has(key))) continue;
    selected.push(advice);
    keys.forEach((key) => occupied.add(key));
    if (selected.length === 2) break;
  }
  return selected;
}

/** Apply a validated advisor patch without mutating the current setup. */
export function applyTacticalAdvice(tactics: TacticalSetup, advice: TacticalAdvice): TacticalSetup {
  return {
    ...tactics,
    ...advice.patch,
    playerRoles: { ...(tactics.playerRoles ?? {}) },
    positionOverrides: { ...tactics.positionOverrides },
    setPieces: { ...tactics.setPieces },
    instructionCache: tactics.instructionCache ? {
      team: tactics.instructionCache.team,
      players: { ...tactics.instructionCache.players },
    } : undefined,
  };
}
