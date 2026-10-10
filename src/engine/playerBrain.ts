import { PlayStyle, PlaystyleTag, type Player, type TacticalDirectives } from "@/types";
import { clamp } from "@/database/rng";
import { getIconicPrimeProfile } from "@/engine/iconicPrimeProfiles";

export type PlayerIntent =
  | "hold"
  | "support"
  | "overlap"
  | "underlap"
  | "comeShort"
  | "crossReceiver"
  | "pullWide"
  | "giveAndGo"
  | "runBehind"
  | "recover"
  | "cover"
  | "mark"
  | "press"
  | "receive"
  | "carry";

export interface StyleBehavior {
  /** preference for short recycling and nearby support */
  circulation: number;
  /** preference for vertical/long progression */
  directness: number;
  /** willingness to advance with the ball */
  carryBias: number;
  /** frequency/aggression of movement beyond the ball */
  runBehind: number;
  /** frequency of wide delivery */
  crossing: number;
  /** horizontal stretching of the in-possession shape */
  attackingWidth: number;
  /** speed of transition after a regain */
  transition: number;
  /** compactness without the ball */
  compactness: number;
  /** multiplier for time between on-ball decisions */
  decisionCadence: number;
  /** ideal support distance in metres */
  supportDistance: number;
}

export const STYLE_BEHAVIORS: Record<PlayStyle, StyleBehavior> = {
  [PlayStyle.PossessionBased]: {
    circulation: 1.45, directness: 0.48, carryBias: 0.65, runBehind: 0.62,
    crossing: 0.5, attackingWidth: 0.88, transition: 0.65, compactness: 1.2,
    decisionCadence: 0.86, supportDistance: 13,
  },
  [PlayStyle.TikiTaka]: {
    circulation: 1.65, directness: 0.38, carryBias: 0.55, runBehind: 0.82,
    crossing: 0.38, attackingWidth: 0.82, transition: 1.05, compactness: 1.25,
    decisionCadence: 0.68, supportDistance: 10.5,
  },
  [PlayStyle.DirectCounterAttack]: {
    circulation: 0.58, directness: 1.5, carryBias: 1.2, runBehind: 1.6,
    crossing: 0.78, attackingWidth: 1.08, transition: 1.65, compactness: 1.12,
    decisionCadence: 0.78, supportDistance: 21,
  },
  [PlayStyle.GegenpressingStyle]: {
    circulation: 0.92, directness: 1.15, carryBias: 0.92, runBehind: 1.35,
    crossing: 0.72, attackingWidth: 1, transition: 1.45, compactness: 1.3,
    decisionCadence: 0.72, supportDistance: 14,
  },
  [PlayStyle.LongBallDirect]: {
    circulation: 0.45, directness: 1.75, carryBias: 0.5, runBehind: 1.45,
    crossing: 1.05, attackingWidth: 1.15, transition: 1.25, compactness: 0.92,
    decisionCadence: 0.8, supportDistance: 25,
  },
  [PlayStyle.WingPlay]: {
    circulation: 0.78, directness: 0.92, carryBias: 1.22, runBehind: 1.25,
    crossing: 1.7, attackingWidth: 1.48, transition: 1.08, compactness: 0.88,
    decisionCadence: 0.84, supportDistance: 17,
  },
  [PlayStyle.ParkTheBus]: {
    circulation: 0.62, directness: 1.25, carryBias: 0.42, runBehind: 0.72,
    crossing: 0.66, attackingWidth: 0.78, transition: 0.88, compactness: 1.55,
    decisionCadence: 1.1, supportDistance: 19,
  },
  [PlayStyle.TotalFootball]: {
    circulation: 1.18, directness: 0.9, carryBias: 1.18, runBehind: 1.3,
    crossing: 0.88, attackingWidth: 1.04, transition: 1.22, compactness: 1.18,
    decisionCadence: 0.76, supportDistance: 14,
  },
  [PlayStyle.RouteOne]: {
    circulation: 0.34, directness: 1.92, carryBias: 0.38, runBehind: 1.08,
    crossing: 1.18, attackingWidth: 1.18, transition: 1.2, compactness: 0.9,
    decisionCadence: 0.82, supportDistance: 27,
  },
  [PlayStyle.Balanced]: {
    circulation: 1, directness: 1, carryBias: 1, runBehind: 1,
    crossing: 1, attackingWidth: 1, transition: 1, compactness: 1,
    decisionCadence: 1, supportDistance: 16,
  },
};

export function styleBehavior(style: PlayStyle | undefined): StyleBehavior {
  return STYLE_BEHAVIORS[style ?? PlayStyle.Balanced] ?? STYLE_BEHAVIORS[PlayStyle.Balanced];
}

export function hasPlaystyle(player: Player, tag: PlaystyleTag): boolean {
  return (player.playstyles ?? []).includes(tag);
}

/**
 * Real match tracking is dominated by walking/jogging, with sprint speed only
 * reached in selected actions. Pace controls the ceiling; acceleration controls
 * how quickly that ceiling can be reached and is deliberately separate.
 */
export function playerSprintSpeed(player: Player, withBall = false): number {
  const raw = 5.95 + player.pace * 0.155; // 6.1–9.05 m/s across the 1–20 scale
  if (!withBall) return raw;
  const control = 0.8 + player.ballControl * 0.006 + player.dribbling * 0.003;
  const paceStyle = hasPlaystyle(player, PlaystyleTag.PaceAbuser) ? 0.035 : 0;
  return raw * clamp(control + paceStyle, 0.81, 0.96);
}

export function playerAcceleration(player: Player): number {
  return 2.7 + player.acceleration * 0.205; // 2.9–6.8 m/s²
}

export interface BrainPoint {
  x: number;
  y: number;
}

export interface BrainAgent extends BrainPoint {
  id: string;
  role: string;
}

export interface SpatialBrainInput {
  player: Player;
  playerIndex: number;
  role: string;
  current: BrainPoint;
  baseTarget: BrainPoint;
  ball: BrainPoint;
  carrier: BrainPoint | null;
  teammates: BrainAgent[];
  opponents: BrainAgent[];
  /** Team-level unique goal-side assignment; avoids every defender selecting the same threat. */
  markTarget?: BrainAgent;
  attackingDirection: 1 | -1;
  style: PlayStyle;
  hasPossession: boolean;
  transitionAge: number;
  runActive: boolean;
  stayWide: boolean;
  cutInside: boolean;
  holdPosition: boolean;
  forwardRuns: boolean;
  /** Full executable catalogue layered on the legacy movement booleans. */
  instructions?: TacticalDirectives;
}

export interface SpatialBrainResult extends BrainPoint {
  intent: PlayerIntent;
}

interface Candidate extends BrainPoint {
  intent: PlayerIntent;
  bias: number;
}

function distance(a: BrainPoint, b: BrainPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestDistance(point: BrainPoint, agents: BrainAgent[], ignoreId?: string): number {
  let best = Infinity;
  for (const agent of agents) {
    if (agent.id === ignoreId) continue;
    best = Math.min(best, distance(point, agent));
  }
  return Number.isFinite(best) ? best : 300;
}

/** Minimum opponent distance from the pass segment, in pitch units. */
function laneClearance(from: BrainPoint, to: BrainPoint, opponents: BrainAgent[]): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lenSq = dx * dx + dy * dy;
  let best = Infinity;
  for (const opponent of opponents) {
    const t = lenSq <= 0
      ? 0
      : clamp(((opponent.x - from.x) * dx + (opponent.y - from.y) * dy) / lenSq, 0, 1);
    const px = from.x + dx * t;
    const py = from.y + dy * t;
    best = Math.min(best, Math.hypot(opponent.x - px, opponent.y - py));
  }
  return Number.isFinite(best) ? best : 250;
}

function secondLastDefenderX(opponents: BrainAgent[], dir: 1 | -1): number {
  const xs = opponents.map((p) => p.x).sort((a, b) => dir > 0 ? b - a : a - b);
  return xs[1] ?? (dir > 0 ? 1000 : 0);
}

function clampPoint(point: BrainPoint): BrainPoint {
  return { x: clamp(point.x, 18, 982), y: clamp(point.y, 16, 634) };
}

/**
 * Every off-ball player scores several football actions rather than blindly
 * following the ball. Safe passing angle, usable distance, open space,
 * formation responsibility, team style, offside line and personal playstyles
 * all contribute to the chosen target.
 */
export function chooseSpatialTarget(input: SpatialBrainInput): SpatialBrainResult {
  const profile = styleBehavior(input.style);
  const instructions = input.instructions ?? {};
  const prime = getIconicPrimeProfile(input.player);
  const primeRunBeyond = prime?.receiving.runBeyond ?? 0.5;
  const primeComeShort = prime?.receiving.comeShort ?? 0.5;
  const primeCombination = prime?.passing.combination ?? 0.5;
  const dir = input.attackingDirection;
  const selfId = input.player.id;
  const carrier = input.carrier ?? input.ball;
  const wideRole = ["RB", "LB", "RWB", "LWB", "RW", "LW", "RM", "LM"].includes(input.role);
  const forwardRole = ["ST", "CF", "RW", "LW", "CAM"].includes(input.role);
  const fullBack = ["RB", "LB", "RWB", "LWB"].includes(input.role);
  const laneSign = Math.abs(input.current.y - carrier.y) > 28
    ? Math.sign(input.current.y - carrier.y)
    : input.playerIndex % 2 === 0 ? -1 : 1;
  const support = profile.supportDistance * 10;

  const candidates: Candidate[] = [
    { ...input.baseTarget, intent: input.hasPossession ? "support" : "cover", bias: 7 },
  ];

  if (input.hasPossession && !input.holdPosition) {
    const supportForward = forwardRole ? support * 0.35 : -support * 0.3;
    candidates.push({
      x: carrier.x + dir * supportForward,
      y: carrier.y + laneSign * support * 0.7,
      intent: "support",
      bias: 8.5 * profile.circulation,
    });
    candidates.push({
      x: carrier.x - dir * support * 0.45,
      y: carrier.y - laneSign * support * 0.58,
      intent: "support",
      bias: 6.5 * profile.circulation,
    });

    const spaceReader = hasPlaystyle(input.player, PlaystyleTag.SpaceInterpreter);
    const explicitSupport = instructions.supportRun && instructions.supportRun !== "balanced";
    const wantsRun = instructions.supportRun === "runInBehind" ||
      (!explicitSupport && (input.runActive || input.forwardRuns || spaceReader ||
        (forwardRole && (profile.runBehind > 1.18 || primeRunBeyond > 0.72))));
    if (wantsRun && forwardRole) {
      const line = secondLastDefenderX(input.opponents, dir);
      const startOnside = line - dir * 18;
      const beyond = Math.max(130, 145 + input.player.pace * 4.2) * profile.runBehind;
      candidates.push({
        // Accelerate up to the shoulder while remaining onside. Once a through
        // ball is kicked, the flight state releases the runner beyond it.
        x: dir > 0
          ? Math.min(input.current.x + beyond, startOnside)
          : Math.max(input.current.x - beyond, startOnside),
        y: instructions.makeDecoyRuns
          ? clamp(input.current.y + laneSign * 105, 45, 605)
          : input.cutInside ? 325 + (input.current.y - 325) * 0.35 : input.current.y + laneSign * 24,
        intent: "runBehind",
        bias: 9 * profile.runBehind + (spaceReader ? 8 : 0) + (primeRunBeyond - 0.5) * 18 +
          (instructions.supportRun === "runInBehind" ? 22 : 0) +
          (instructions.makeDecoyRuns ? 6 : 0),
      });
    }

    if ((fullBack || wideRole) && (instructions.flankRun === "overlap" || profile.attackingWidth > 1.08 || input.stayWide ||
      hasPlaystyle(input.player, PlaystyleTag.FullBackRunner) || hasPlaystyle(input.player, PlaystyleTag.Winger))) {
      candidates.push({
        x: Math.max(input.current.x * dir, carrier.x * dir + 75) * dir,
        y: input.current.y < 325 ? 42 : 608,
        intent: "overlap",
        bias: 8 * profile.attackingWidth + (fullBack ? 3 : 0) +
          (instructions.flankRun === "overlap" ? 22 : instructions.flankRun === "underlap" ? -12 : 0),
      });
    }

    const carrierWide = carrier.y < 175 || carrier.y > 475;
    const carrierViewedX = dir > 0 ? carrier.x : 1000 - carrier.x;
    const sameFlank = (input.current.y < 325) === (carrier.y < 325);
    const carrierPressure = nearestDistance(carrier, input.opponents);

    // Underlap: a full-back, wide midfielder or roaming central midfielder
    // attacks the inside shoulder while a wide carrier pins the outside
    // defender. Explicit width instructions still favour the overlap above.
    const depthFromCarrier = (input.current.x - carrier.x) * dir;
    if (
      carrierWide && sameFlank && (!input.stayWide || instructions.flankRun === "underlap") &&
      (fullBack || wideRole || ["RM", "LM", "CM", "CAM"].includes(input.role)) &&
      depthFromCarrier > -220 && depthFromCarrier < 70
    ) {
      candidates.push({
        x: carrier.x + dir * (82 + input.player.offTheBall * 2.1),
        y: carrier.y + (325 - carrier.y) * 0.48,
        intent: "underlap",
        bias: 9 + (input.cutInside ? 3 : 0) +
          (input.style === PlayStyle.TotalFootball || input.style === PlayStyle.TikiTaka ? 4 : 0) +
          (hasPlaystyle(input.player, PlaystyleTag.FullBackRunner) ? 4 : 0) +
          (instructions.flankRun === "underlap" ? 24 : instructions.flankRun === "overlap" ? -10 : 0),
      });
    }

    // A pressured ball-holder needs somebody to come towards the pass rather
    // than every attacker sprinting away. This creates a wall-pass option and
    // lets possession teams escape a press through a third-player angle.
    const aheadOfCarrier = (input.current.x - carrier.x) * dir;
    if (
      (forwardRole || instructions.supportRun === "comeShort") && aheadOfCarrier > 35 && aheadOfCarrier < 330 &&
      (instructions.supportRun === "comeShort" || carrierPressure < 72 || profile.circulation > 1.25 || primeComeShort > 0.72)
    ) {
      candidates.push({
        x: carrier.x + dir * (58 + profile.supportDistance * 1.8),
        y: carrier.y + laneSign * Math.min(72, support * 0.45),
        intent: "comeShort",
        bias: 9 + (carrierPressure < 55 ? 7 : 0) + profile.circulation * 3 +
          (hasPlaystyle(input.player, PlaystyleTag.Playmaker) ? 4 : 0) +
          (primeComeShort - 0.5) * 20 +
          (instructions.supportRun === "comeShort" ? 24 : instructions.supportRun === "runInBehind" ? -12 : 0),
      });
    }

    if (instructions.supportRun === "moveIntoChannels") {
      const channelY = input.current.y <= 325 ? 205 : 445;
      const line = secondLastDefenderX(input.opponents, dir);
      candidates.push({
        x: dir > 0 ? Math.min(carrier.x + 145, line - 18) : Math.max(carrier.x - 145, line + 18),
        y: channelY,
        intent: "runBehind",
        bias: 29 + input.player.offTheBall * 0.25,
      });
    }

    // Once a short combination is played, runActive identifies the original
    // passer. They accelerate beyond the new carrier on a different lane: an
    // actual give-and-go continuation rather than a commentary-only event.
    if ((input.runActive || instructions.thirdManRuns) && !input.holdPosition &&
      (instructions.supportRun !== "comeShort" || instructions.playOneTwos)) {
      candidates.push({
        x: carrier.x + dir * (88 + input.player.acceleration * 2.8),
        y: carrier.y + laneSign * 48,
        intent: "giveAndGo",
        bias: 17 + input.player.offTheBall * 0.35 + profile.circulation * 2 +
          (primeCombination - 0.5) * 14 + (instructions.thirdManRuns ? 10 : 0),
      });
    }

    // Wide possession in the creation/final-third zone triggers a restrained
    // far-post/penalty-spot run. Only forwards on the opposite/central lane are
    // eligible, preventing the whole side from abandoning rest defence.
    const oppositeOrCentral = Math.abs(input.current.y - 325) < 115 || !sameFlank;
    if (carrierWide && carrierViewedX > 575 && forwardRole && oppositeOrCentral && instructions.boxRole !== "stayBack") {
      const line = secondLastDefenderX(input.opponents, dir);
      const onsideShoulder = line - dir * 16;
      const desiredX = carrier.x + dir * (95 + input.player.offTheBall * 2.4);
      const boxY = instructions.boxRole === "nearPost"
        ? carrier.y < 325 ? 238 : 412
        : instructions.boxRole === "farPost"
          ? carrier.y < 325 ? 455 : 195
          : instructions.boxRole === "centre" ? 325 : carrier.y < 325 ? 445 : 205;
      candidates.push({
        x: dir > 0 ? Math.min(desiredX, onsideShoulder) : Math.max(desiredX, onsideShoulder),
        y: boxY,
        intent: "crossReceiver",
        bias: 10 + profile.crossing * 5 + input.player.offTheBall * 0.2 +
          (hasPlaystyle(input.player, PlaystyleTag.Poacher) || hasPlaystyle(input.player, PlaystyleTag.AerialThreat) ? 5 : 0) +
          (primeRunBeyond - 0.5) * 12 + ((prime?.shooting.aerial ?? 0.5) - 0.5) * 8 +
          (instructions.boxRole && !["edge", "stayBack"].includes(instructions.boxRole) ? 42 : 0) +
          (instructions.attackRebounds ? 5 : 0),
      });
    }

    if (carrierViewedX > 610 && (instructions.boxRole === "edge" || instructions.attackRebounds)) {
      candidates.push({
        x: (dir > 0 ? 795 : 205),
        y: 325 + (input.playerIndex % 2 === 0 ? -52 : 52),
        intent: "support",
        bias: 26 + (instructions.attackRebounds ? 8 : 0),
      });
    }
    if (instructions.boxRole === "stayBack" || instructions.restDefense) {
      candidates.push({
        x: input.baseTarget.x - dir * (forwardRole ? 55 : 10),
        y: input.baseTarget.y,
        intent: "cover",
        bias: 31,
      });
    }

    // Against a compact central block, one eligible attacker can pull towards
    // the weak-side touchline to create the next lane without destroying the
    // team's central support structure.
    if (!carrierWide && (wideRole || forwardRole) && profile.attackingWidth > 1.05) {
      const weakSideY = input.current.y < 325 ? 62 : 588;
      candidates.push({
        x: carrier.x + dir * (forwardRole ? 72 : 32),
        y: weakSideY,
        intent: "pullWide",
        bias: 6 + profile.attackingWidth * 5 + (input.stayWide ? 5 : 0),
      });
    }
  }

  if (!input.hasPossession) {
    // Goal-side cover. The existing formation target remains the anchor, but
    // defenders read the ball and nearest threat instead of standing on a dot.
    const ownGoalX = dir > 0 ? 0 : 1000;
    const nearestThreat = input.markTarget ?? [...input.opponents]
      .sort((a, b) => distance(input.current, a) - distance(input.current, b))[0];
    if (nearestThreat && input.role !== "GK") {
      candidates.push({
        x: nearestThreat.x + Math.sign(ownGoalX - nearestThreat.x) * 22,
        y: nearestThreat.y + (325 - nearestThreat.y) * 0.07,
        intent: "mark",
        bias: ["CB", "RB", "LB", "CDM", "DM"].includes(input.role) ? 11 : 6,
      });
    }
  }

  let best: SpatialBrainResult = { ...input.baseTarget, intent: input.hasPossession ? "support" : "cover" };
  let bestScore = -Infinity;
  for (const raw of candidates) {
    const candidate = clampPoint(raw);
    const openness = Math.min(180, nearestDistance(candidate, input.opponents));
    const teammateSpace = Math.min(150, nearestDistance(candidate, input.teammates, selfId));
    const anchorDistance = distance(candidate, input.baseTarget);
    let score = raw.bias + openness * 0.075 + Math.min(teammateSpace, 105) * 0.035;

    if (teammateSpace < 52) score -= (52 - teammateSpace) * 0.3;
    if (input.hasPossession) {
      const passDistance = distance(carrier, candidate);
      const ideal = support;
      score += Math.min(90, laneClearance(carrier, candidate, input.opponents)) * 0.08;
      score -= Math.abs(passDistance - ideal) * (raw.intent === "runBehind" ? 0.012 : 0.025);
      score += ((candidate.x - carrier.x) * dir / 10) * profile.directness * 0.18;
      if (raw.intent === "runBehind" && passDistance < 75) score -= 8;
      if (raw.intent === "overlap" && !wideRole) score -= 8;
      if (input.transitionAge < 5 && raw.intent === "runBehind") score += 8 * profile.transition;
    }

    const discipline = input.holdPosition ? 0.18 : input.player.teamwork >= 14 ? 0.035 : 0.025;
    score -= anchorDistance * discipline;
    if (score > bestScore) {
      bestScore = score;
      best = { ...candidate, intent: raw.intent };
    }
  }

  return applySeparation(best, input.current, input.teammates, selfId);
}

/** Local steering prevents team-mates occupying the same physical point. */
export function applySeparation(
  target: SpatialBrainResult,
  current: BrainPoint,
  teammates: BrainAgent[],
  selfId: string,
): SpatialBrainResult {
  let pushX = 0;
  let pushY = 0;
  for (const mate of teammates) {
    if (mate.id === selfId) continue;
    const dx = current.x - mate.x;
    const dy = current.y - mate.y;
    const d = Math.hypot(dx, dy);
    if (d <= 0 || d >= 58) continue;
    const force = (58 - d) / 58;
    pushX += (dx / d) * force * 34;
    pushY += (dy / d) * force * 34;
  }
  return {
    x: clamp(target.x + pushX, 18, 982),
    y: clamp(target.y + pushY, 16, 634),
    intent: target.intent,
  };
}
