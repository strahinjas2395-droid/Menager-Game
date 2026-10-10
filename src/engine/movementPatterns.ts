/**
 * Contextual on-ball movement planning.
 *
 * The planner does not choose cosmetic animation labels. It compares reachable
 * routes using a lightweight pitch-control estimate (attacker/defender arrival
 * times) and possession value (progress, channel and end-space). The selected
 * waypoints are then executed by the normal player/ball physics in
 * matchSimulator.ts.
 */
import { PlayStyle, PlaystyleTag, type Player, type TacticalDirectives } from "@/types";
import { getIconicPrimeProfile } from "@/engine/iconicPrimeProfiles";

const PITCH_W = 1000;
const PITCH_H = 650;
const CENTRE_Y = PITCH_H / 2;
const UNITS_PER_METRE = 10;

export interface MovementPoint {
  x: number;
  y: number;
}

export interface MovementOpponent extends MovementPoint {
  id: string;
  pace: number;
  acceleration: number;
  anticipation: number;
}

export type CarryPhase = "buildUp" | "create" | "finish" | "transition";

export type DribblePattern =
  | "centralLineBreak"
  | "halfSpaceDrive"
  | "insideCut"
  | "outsideDrive"
  | "bylineDrive"
  | "escapeTurn"
  | "feintAndGo";

export interface DribblePlanInput {
  player: Player;
  role: string;
  tacticalRole?: string;
  current: MovementPoint;
  velocity?: MovementPoint;
  opponents: MovementOpponent[];
  teammates: MovementPoint[];
  attackingDirection: 1 | -1;
  pressure: number;
  phase: CarryPhase;
  style: PlayStyle;
  instructions?: TacticalDirectives;
  /** A defender already wrong-footed by the duel resolver. Cover still matters. */
  beatenOpponentId?: string;
  /** Explicit pre-match instruction to attack a particular defender physically. */
  targetOpponentId?: string;
  targetApproach?: "pace" | "dribble";
}

export interface DribbleRoute {
  pattern: DribblePattern;
  waypoints: MovementPoint[];
  score: number;
  /** 0..1 probability-like estimate that the carrier reaches useful points first. */
  pitchControl: number;
  /** Contextual location value gained by reaching the endpoint. */
  possessionValueGain: number;
  laneClearanceM: number;
  /** Long touches are only allowed when this is comfortably above three metres. */
  safeKnockOnM: number;
  /** Movement intensity consumed by the existing acceleration/energy model. */
  intensity: number;
  /** Multiplier for physical ball-touch distance; the ball remains independent. */
  touchScale: number;
  durationSeconds: number;
}

interface RouteSeed {
  pattern: DribblePattern;
  waypoints: MovementPoint[];
  base: number;
  targeted?: boolean;
}

interface RouteMetrics {
  pitchControl: number;
  laneClearanceM: number;
  possessionValueGain: number;
  safeKnockOnM: number;
  distanceM: number;
  turnCost: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(a: MovementPoint, b: MovementPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function hasTrait(player: Player, trait: PlaystyleTag): boolean {
  return player.playstyles.includes(trait);
}

function endpoint(seed: RouteSeed): MovementPoint {
  return seed.waypoints[seed.waypoints.length - 1];
}

function actualFromTeamY(teamY: number, direction: 1 | -1): number {
  return direction > 0 ? teamY : PITCH_H - teamY;
}

function teamY(actualY: number, direction: 1 | -1): number {
  return direction > 0 ? actualY : PITCH_H - actualY;
}

function pointFromOffsets(
  start: MovementPoint,
  direction: 1 | -1,
  forwardM: number,
  inwardM: number,
): MovementPoint {
  const inwardSign = Math.sign(CENTRE_Y - start.y) || 1;
  return {
    x: clamp(start.x + direction * forwardM * UNITS_PER_METRE, 18, PITCH_W - 18),
    y: clamp(start.y + inwardSign * inwardM * UNITS_PER_METRE, 20, PITCH_H - 20),
  };
}

function nearestOpponent(input: DribblePlanInput): MovementOpponent | undefined {
  return [...input.opponents].sort((a, b) => {
    const delta = distance(input.current, a) - distance(input.current, b);
    return delta || a.id.localeCompare(b.id);
  })[0];
}

function opennessAt(point: MovementPoint, opponents: MovementOpponent[]): number {
  if (opponents.length === 0) return 30;
  return Math.min(...opponents.map((opponent) => distance(point, opponent) / UNITS_PER_METRE));
}

function chooseEscapeSign(input: DribblePlanInput, opponent: MovementOpponent | undefined): -1 | 1 {
  if (opponent && Math.abs(input.current.y - opponent.y) > 4) {
    return input.current.y < opponent.y ? -1 : 1;
  }
  const upper = opennessAt(
    { x: input.current.x + input.attackingDirection * 25, y: clamp(input.current.y - 45, 20, 630) },
    input.opponents,
  );
  const lower = opennessAt(
    { x: input.current.x + input.attackingDirection * 25, y: clamp(input.current.y + 45, 20, 630) },
    input.opponents,
  );
  if (upper !== lower) return upper > lower ? -1 : 1;
  // Stable tie-breaker avoids introducing another random stream into movement.
  let hash = 0;
  for (let i = 0; i < input.player.id.length; i++) hash = Math.imul(hash ^ input.player.id.charCodeAt(i), 16777619);
  return (hash >>> 0) % 2 === 0 ? -1 : 1;
}

function routeSeeds(input: DribblePlanInput): RouteSeed[] {
  const { current, attackingDirection: direction } = input;
  const viewedY = teamY(current.y, direction);
  const wide = viewedY < 245 || viewedY > 405;
  const veryWide = viewedY < 155 || viewedY > 495;
  const finalThirdX = direction > 0 ? current.x : PITCH_W - current.x;
  const opponent = nearestOpponent(input);
  const escapeSign = chooseEscapeSign(input, opponent);
  const seeds: RouteSeed[] = [];

  const targetOpponent = input.targetOpponentId
    ? input.opponents.find((candidate) => candidate.id === input.targetOpponentId)
    : undefined;
  if (targetOpponent && input.targetApproach) {
    const targetExitSign = chooseEscapeSign(input, targetOpponent);
    const paceApproach = input.targetApproach === "pace";
    seeds.push({
      pattern: paceApproach ? (wide ? (finalThirdX > 690 ? "bylineDrive" : "outsideDrive") : "centralLineBreak") : "feintAndGo",
      waypoints: [
        {
          x: clamp(targetOpponent.x + direction * (paceApproach ? 3.5 : 1.5) * UNITS_PER_METRE, 18, 982),
          y: clamp(targetOpponent.y + targetExitSign * 3.5 * UNITS_PER_METRE, 20, 630),
        },
        {
          x: clamp(targetOpponent.x + direction * (paceApproach ? 7.8 : 4.4) * UNITS_PER_METRE, 18, 982),
          y: clamp(targetOpponent.y + targetExitSign * (paceApproach ? 2.5 : 4.5) * UNITS_PER_METRE, 20, 630),
        },
      ],
      base: paceApproach ? 25 : 22,
      targeted: true,
    });
  }

  // Three adjacent central gates let the player break a line without every
  // carry following the exact centre of the pitch.
  for (const lateralM of [0, -2.6, 2.6]) {
    seeds.push({
      pattern: "centralLineBreak",
      waypoints: [{
        x: clamp(current.x + direction * 8.2 * UNITS_PER_METRE, 18, 982),
        y: clamp(current.y + lateralM * UNITS_PER_METRE, 20, 630),
      }],
      base: wide ? -4 : 2,
    });
  }

  // The half-space route is diagonal from either the wing or centre and ends
  // in the 20/80 channel rather than converging every player on y=325.
  const upperHalfSpace = viewedY <= CENTRE_Y;
  const targetTeamY = upperHalfSpace ? 205 : 445;
  seeds.push({
    pattern: "halfSpaceDrive",
    waypoints: [{
      x: clamp(current.x + direction * 7.1 * UNITS_PER_METRE, 18, 982),
      y: clamp(actualFromTeamY(targetTeamY, direction), 20, 630),
    }],
    base: wide ? 3 : 1,
  });

  if (wide) {
    const insideEnd = pointFromOffsets(current, direction, 5.8, veryWide ? 6.8 : 4.8);
    seeds.push({
      pattern: "insideCut",
      waypoints: [
        pointFromOffsets(current, direction, 1.7, -0.8),
        insideEnd,
      ],
      base: 2,
    });

    const outsidePattern: DribblePattern = finalThirdX > 690 ? "bylineDrive" : "outsideDrive";
    const goalLineRoomM = Math.max(2.8, (PITCH_W - 22 - finalThirdX) / UNITS_PER_METRE);
    seeds.push({
      pattern: outsidePattern,
      waypoints: [pointFromOffsets(current, direction, Math.min(8.8, goalLineRoomM), -1.7)],
      base: veryWide ? 3 : 0,
    });
  }

  const nearestM = opponent ? distance(current, opponent) / UNITS_PER_METRE : Infinity;
  const protectsPosition = Boolean(input.instructions?.holdPosition || input.instructions?.defensiveDuty);
  if (input.pressure > 0.28 || nearestM < 6.2 || protectsPosition) {
    seeds.push({
      pattern: "escapeTurn",
      waypoints: [
        {
          x: clamp(current.x - direction * 1.4 * UNITS_PER_METRE, 18, 982),
          y: clamp(current.y + escapeSign * 3.1 * UNITS_PER_METRE, 20, 630),
        },
        {
          x: clamp(current.x + direction * (protectsPosition ? 0.6 : 2.8) * UNITS_PER_METRE, 18, 982),
          y: clamp(current.y + escapeSign * (protectsPosition ? 4.1 : 5.2) * UNITS_PER_METRE, 20, 630),
        },
      ],
      base: protectsPosition ? 8 : 0,
    });
  }

  const directOpponent = input.opponents
    .filter((candidate) => {
      const forwardM = (candidate.x - current.x) * direction / UNITS_PER_METRE;
      const lateralM = Math.abs(candidate.y - current.y) / UNITS_PER_METRE;
      return forwardM > -0.5 && forwardM < 7.8 && lateralM < 5.8;
    })
    .sort((a, b) => distance(current, a) - distance(current, b) || a.id.localeCompare(b.id))[0];
  if (directOpponent) {
    const exitSign = chooseEscapeSign(input, directOpponent);
    seeds.push({
      pattern: "feintAndGo",
      waypoints: [
        {
          x: clamp(current.x + direction * 1.25 * UNITS_PER_METRE, 18, 982),
          y: clamp(current.y - exitSign * 1.15 * UNITS_PER_METRE, 20, 630),
        },
        {
          x: clamp(current.x + direction * 6.8 * UNITS_PER_METRE, 18, 982),
          y: clamp(current.y + exitSign * 4.25 * UNITS_PER_METRE, 20, 630),
        },
      ],
      base: 1,
    });
  }

  return seeds;
}

function sampleRoute(start: MovementPoint, waypoints: MovementPoint[]): Array<MovementPoint & { travelledM: number }> {
  const samples: Array<MovementPoint & { travelledM: number }> = [];
  let from = start;
  let travelledM = 0;
  for (const to of waypoints) {
    const segmentM = distance(from, to) / UNITS_PER_METRE;
    for (let step = 1; step <= 4; step++) {
      const t = step / 4;
      samples.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        travelledM: travelledM + segmentM * t,
      });
    }
    travelledM += segmentM;
    from = to;
  }
  return samples;
}

function routeMetrics(input: DribblePlanInput, seed: RouteSeed): RouteMetrics {
  const samples = sampleRoute(input.current, seed.waypoints);
  const actorSpeed = 3.9 + input.player.pace * 0.13 + input.player.acceleration * 0.07;
  let minControl = 1;
  let minClearanceM = 30;

  for (const sample of samples) {
    const carrierArrival = sample.travelledM / Math.max(actorSpeed, 0.1);
    if (input.opponents.length === 0) continue;
    for (const opponent of input.opponents) {
      const defenderSpeed = 3.8 + opponent.pace * 0.12 + opponent.acceleration * 0.06;
      const defenderDistanceM = Math.max(0, distance(sample, opponent) / UNITS_PER_METRE - 1.25);
      const anticipationHeadStart = clamp((opponent.anticipation - 10) * 0.012, -0.1, 0.12);
      const defenderArrival = defenderDistanceM / Math.max(defenderSpeed, 0.1) - anticipationHeadStart;
      const margin = defenderArrival - carrierArrival;
      const control = 1 / (1 + Math.exp(-margin * 2.15));
      minControl = Math.min(minControl, control);
      minClearanceM = Math.min(minClearanceM, distance(sample, opponent) / UNITS_PER_METRE);
    }
  }

  const end = endpoint(seed);
  const startViewedX = input.attackingDirection > 0 ? input.current.x : PITCH_W - input.current.x;
  const endViewedX = input.attackingDirection > 0 ? end.x : PITCH_W - end.x;
  const startViewedY = teamY(input.current.y, input.attackingDirection);
  const endViewedY = teamY(end.y, input.attackingDirection);
  const progressM = (endViewedX - startViewedX) / UNITS_PER_METRE;
  const centralGain = (Math.abs(startViewedY - CENTRE_Y) - Math.abs(endViewedY - CENTRE_Y)) / CENTRE_Y;
  let possessionValueGain = progressM / 11 + centralGain * (endViewedX > 680 ? 0.34 : 0.18);
  if (seed.pattern === "bylineDrive") possessionValueGain += 0.18;
  if (seed.pattern === "escapeTurn" && input.pressure > 0.5) possessionValueGain += 0.26;

  const first = seed.waypoints[0];
  const firstDx = first.x - input.current.x;
  const firstDy = first.y - input.current.y;
  const velocity = input.velocity ?? { x: input.attackingDirection, y: 0 };
  const velocityLength = Math.hypot(velocity.x, velocity.y);
  const firstLength = Math.hypot(firstDx, firstDy);
  const facing = velocityLength > 1 && firstLength > 0
    ? clamp((velocity.x * firstDx + velocity.y * firstDy) / (velocityLength * firstLength), -1, 1)
    : 1;
  const turnCost = (1 - facing) * (1 - input.player.agility / 28);

  const coverOpponents = input.opponents.filter((opponent) => opponent.id !== input.beatenOpponentId);
  const laterSamples = samples.slice(Math.floor(samples.length / 2));
  const coverClearanceM = coverOpponents.length === 0
    ? 20
    : Math.min(...laterSamples.flatMap((sample) =>
        coverOpponents.map((opponent) => distance(sample, opponent) / UNITS_PER_METRE),
      ));
  const fastestCover = coverOpponents.length > 0
    ? Math.max(...coverOpponents.map((opponent) => opponent.pace))
    : 8;
  const paceEdge = (input.player.pace - fastestCover) * 0.11;
  const distanceM = samples[samples.length - 1]?.travelledM ?? 0;
  let safeKnockOnM = clamp(2.1 + Math.max(0, coverClearanceM - 2) * 0.72 + paceEdge, 1.6, 9.2);
  safeKnockOnM = Math.min(safeKnockOnM, distanceM);
  if (minControl < 0.34) safeKnockOnM *= 0.68;

  return {
    pitchControl: clamp(minControl, 0, 1),
    laneClearanceM: minClearanceM,
    possessionValueGain,
    safeKnockOnM,
    distanceM,
    turnCost,
  };
}

function patternBias(input: DribblePlanInput, seed: RouteSeed, metrics: RouteMetrics): number {
  const instructions = input.instructions ?? {};
  const { player } = input;
  const viewedY = teamY(input.current.y, input.attackingDirection);
  const wide = viewedY < 245 || viewedY > 405;
  const upper = viewedY < CENTRE_Y;
  const inwardFoot: Player["preferredFoot"] = upper ? "Right" : "Left";
  const isWideRole = ["RB", "LB", "RWB", "LWB", "RM", "LM", "RW", "LW"].includes(input.role);
  const isCentralRole = ["CDM", "CM", "CAM", "AM", "CF", "ST"].includes(input.role);
  const prime = getIconicPrimeProfile(player);
  const dribbling = prime?.dribbling;
  let bias = seed.base;

  if (seed.pattern === "insideCut") {
    bias += player.preferredFoot === inwardFoot ? 5.5 : -1;
    bias += (player.dribbling + player.agility + player.flair - 33) * 0.24;
    if (instructions.cutInside) bias += 16;
    if (hasTrait(player, PlaystyleTag.CreativeInsideForward)) bias += 9;
    if (input.tacticalRole === "InsideForward" || input.tacticalRole === "InvertedWinger") bias += 8;
    if (input.phase === "finish") bias += 5;
    if (dribbling) bias += (dribbling.inside - 0.5) * 21 + (dribbling.closeControl - 0.5) * 5;
  }

  if (seed.pattern === "outsideDrive" || seed.pattern === "bylineDrive") {
    bias += player.preferredFoot !== inwardFoot ? 4.5 : 0;
    bias += (player.pace + player.acceleration + player.crossing - 33) * 0.2;
    if (instructions.stayWide) bias += 15;
    if (hasTrait(player, PlaystyleTag.Winger) || hasTrait(player, PlaystyleTag.Crosser)) bias += 6;
    if (hasTrait(player, PlaystyleTag.CutbackSpecialist) && seed.pattern === "bylineDrive") bias += 8;
    if (input.style === PlayStyle.WingPlay) bias += 10;
    if (input.phase === "transition") bias += 4;
    if (dribbling) bias += (dribbling.outside - 0.5) * 21 + (dribbling.burst - 0.5) * 7;
  }

  if (seed.pattern === "halfSpaceDrive") {
    bias += (player.decisions + player.ballControl + player.dribbling - 33) * 0.17;
    if (input.style === PlayStyle.TikiTaka || input.style === PlayStyle.PossessionBased) bias += 5;
    if (input.style === PlayStyle.TotalFootball) bias += 7;
    if (["Mezzala", "AdvancedPlaymaker", "InvertedFullBack", "InvertedWinger"].includes(input.tacticalRole ?? "")) bias += 7;
    if (wide && instructions.cutInside) bias += 6;
    if (dribbling) bias += (dribbling.closeControl - 0.5) * 10 + (dribbling.inside - 0.5) * 6;
  }

  if (seed.pattern === "centralLineBreak") {
    bias += (player.decisions + player.dribbling + player.acceleration - 33) * 0.17;
    if (isCentralRole) bias += 4;
    if (input.phase === "transition") bias += 8;
    if (input.style === PlayStyle.DirectCounterAttack || input.style === PlayStyle.GegenpressingStyle) bias += 5;
    if (hasTrait(player, PlaystyleTag.PaceAbuser) && metrics.safeKnockOnM > 5) bias += 6;
    if (dribbling) bias += (dribbling.burst - 0.5) * 15 + (dribbling.frequency - 0.5) * 5;
  }

  if (seed.pattern === "escapeTurn") {
    bias += input.pressure * 24 - 9;
    bias += (player.ballControl + player.balance + player.composure - 33) * 0.23;
    if (hasTrait(player, PlaystyleTag.PressResistant)) bias += 11;
    if (input.phase === "buildUp") bias += 3;
    if (instructions.holdPosition || instructions.defensiveDuty) bias += 13;
    if (input.beatenOpponentId) bias -= 11;
    if (dribbling) bias += (dribbling.escape - 0.5) * 18 + (dribbling.shielding - 0.5) * 7;
  }

  if (seed.pattern === "feintAndGo") {
    bias += input.pressure * 10;
    bias += (player.dribbling + player.agility + player.flair - 36) * 0.3;
    if (hasTrait(player, PlaystyleTag.Dribbler)) bias += 10;
    if (input.beatenOpponentId) bias += 18;
    if (dribbling) bias += (dribbling.feint - 0.5) * 20 + (dribbling.closeControl - 0.5) * 6;
  }

  if (seed.targeted) {
    const physicalEdge = input.targetApproach === "pace"
      ? (player.pace + player.acceleration - 24) * 0.35
      : (player.dribbling + player.agility - 24) * 0.35;
    bias += 7 + physicalEdge;
  }

  if (instructions.dribbleMore) bias += seed.pattern === "escapeTurn" ? 2 : 4;
  if (instructions.dribbleLess) bias -= metrics.possessionValueGain > 0.35 ? 7 : 2;
  if (instructions.directPassing && metrics.possessionValueGain > 0.45) bias += 2;
  if (instructions.holdPosition) bias -= Math.max(0, metrics.possessionValueGain) * 10;
  if (instructions.defensiveDuty) bias -= Math.max(0, metrics.possessionValueGain) * 13;
  if (!wide && isWideRole && (seed.pattern === "halfSpaceDrive" || seed.pattern === "centralLineBreak")) bias -= 1;

  return bias;
}

function movementProfile(pattern: DribblePattern, phase: CarryPhase, distanceM: number, player: Player): Pick<DribbleRoute, "intensity" | "touchScale" | "durationSeconds"> {
  const burst = pattern === "outsideDrive" || pattern === "bylineDrive" ||
    (pattern === "centralLineBreak" && phase === "transition");
  const closeControl = pattern === "insideCut" || pattern === "feintAndGo" || pattern === "escapeTurn";
  const prime = getIconicPrimeProfile(player)?.dribbling;
  const burstTendency = prime?.burst ?? 0.5;
  const controlTendency = prime?.closeControl ?? 0.5;
  const intensity = clamp(
    (burst ? 0.94 + (burstTendency - 0.5) * 0.16 : pattern === "halfSpaceDrive" ? 0.76 : closeControl ? 0.69 : 0.8),
    0.58,
    1,
  );
  // This changes the physical distance between ball contacts: close-control
  // icons take visibly shorter touches; burst carriers push farther into grass.
  const touchScale = clamp(
    burst ? 1.08 + burstTendency * 0.34 : closeControl ? 0.94 - controlTendency * 0.3 : 1,
    0.62,
    1.42,
  );
  const estimatedMps = 3.3 + player.pace * 0.08 + player.acceleration * 0.045;
  return {
    intensity,
    touchScale,
    durationSeconds: clamp(distanceM / estimatedMps + (closeControl ? 0.42 : 0.2), 0.85, 3.2),
  };
}

/** All candidates are exported so deterministic tests and future analysis can
 * inspect why the chosen route won, not merely its label. */
export function rankDribbleRoutes(input: DribblePlanInput): DribbleRoute[] {
  return routeSeeds(input)
    .map((seed) => {
      const metrics = routeMetrics(input, seed);
      const end = endpoint(seed);
      const teammateSpacingM = input.teammates.length === 0
        ? 12
        : Math.min(...input.teammates.map((teammate) => distance(end, teammate) / UNITS_PER_METRE));
      const touchlineM = Math.min(end.y, PITCH_H - end.y) / UNITS_PER_METRE;
      const goalLineM = Math.min(end.x, PITCH_W - end.x) / UNITS_PER_METRE;
      const controlScore = (metrics.pitchControl - 0.5) * 22;
      const valueScore = metrics.possessionValueGain * 12;
      const clearanceScore = clamp(metrics.laneClearanceM - 2, -2, 8) * 0.9;
      const spacingPenalty = teammateSpacingM < 3.2 ? (3.2 - teammateSpacingM) * 3.2 : 0;
      const boundaryPenalty = Math.max(0, 2.2 - touchlineM) * 7 + Math.max(0, 1.8 - goalLineM) * 8;
      const turnPenalty = metrics.turnCost * 8;
      const score = patternBias(input, seed, metrics) + controlScore + valueScore + clearanceScore -
        spacingPenalty - boundaryPenalty - turnPenalty;
      const profile = movementProfile(seed.pattern, input.phase, metrics.distanceM, input.player);
      return {
        pattern: seed.pattern,
        waypoints: seed.waypoints,
        score: Number(score.toFixed(4)),
        pitchControl: Number(metrics.pitchControl.toFixed(4)),
        possessionValueGain: Number(metrics.possessionValueGain.toFixed(4)),
        laneClearanceM: Number(metrics.laneClearanceM.toFixed(3)),
        safeKnockOnM: Number(metrics.safeKnockOnM.toFixed(3)),
        ...profile,
      };
    })
    .sort((a, b) =>
      b.score - a.score ||
      b.pitchControl - a.pitchControl ||
      b.possessionValueGain - a.possessionValueGain ||
      a.pattern.localeCompare(b.pattern) ||
      a.waypoints[0].y - b.waypoints[0].y,
    );
}

export function chooseDribbleRoute(input: DribblePlanInput): DribbleRoute {
  const routes = rankDribbleRoutes(input);
  // centralLineBreak is always generated, so this is only a defensive guard
  // for malformed external inputs.
  return routes[0] ?? {
    pattern: "centralLineBreak",
    waypoints: [pointFromOffsets(input.current, input.attackingDirection, 4, 0)],
    score: 0,
    pitchControl: 0.5,
    possessionValueGain: 0,
    laneClearanceM: 0,
    safeKnockOnM: 2,
    intensity: 0.72,
    touchScale: 1,
    durationSeconds: 1,
  };
}
