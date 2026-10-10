import { SeededRNG, clamp } from "@/database/rng";
import {
  type InjurySeverity,
  type InjurySource,
  type MatchInjuryRecord,
  type Player,
  type PlayerInjury,
  type PlayerMatchAnalysis,
  type TeamTrainingFocus,
  type TrainingDevelopmentFocus,
  type TrainingPlan,
  type TrainingWeekReport,
  type WorldDatabase,
} from "@/types";

export const DEFAULT_CONDITION = 92;
export const DEFAULT_SHARPNESS = 65;

export function defaultTrainingPlan(): TrainingPlan {
  return {
    intensity: "Normal",
    teamFocus: "Balanced",
    restPlayerIds: [],
    individualFocus: {},
  };
}

export function playerCondition(player: Player): number {
  return clamp(player.condition ?? DEFAULT_CONDITION, 0, 100);
}

export function playerSharpness(player: Player): number {
  return clamp(player.matchSharpness ?? DEFAULT_SHARPNESS, 0, 100);
}

export function isPlayerAvailable(player: Player): boolean {
  return !player.injury || player.injury.weeksRemaining <= 0;
}

export function initializePlayerFitness(player: Player): void {
  player.condition = playerCondition(player);
  player.matchSharpness = playerSharpness(player);
  player.injury ??= null;
  player.trainingProgress ??= {};
}

export function normalizeWorldFitness(world: WorldDatabase): void {
  for (const player of Object.values(world.players)) initializePlayerFitness(player);
}

/** Condition affects the physical state from kick-off, while attributes stay untouched. */
export function matchStartingEnergy(player: Player): number {
  return clamp(0.68 + playerCondition(player) * 0.0032, 0.68, 1);
}

export function postMatchCondition(
  before: number,
  minutes: number,
  distanceKm: number,
  sprints: number,
  naturalFitness: number,
): number {
  const workload = minutes * 0.13 + distanceKm * 0.72 + Math.min(8, sprints * 0.12);
  const resilience = (clamp(naturalFitness, 1, 20) - 10) * 0.28;
  return Number(clamp(before - Math.max(0, workload - resilience), 28, before).toFixed(1));
}

export function applyMatchLoad(player: Player, report: PlayerMatchAnalysis): void {
  initializePlayerFitness(player);
  const before = report.conditionBefore ?? playerCondition(player);
  player.condition = report.conditionAfter ?? postMatchCondition(
    before,
    report.minutesPlayed,
    report.distanceCoveredKm,
    report.sprints,
    player.naturalFitness,
  );
  player.matchSharpness = Number(clamp(
    playerSharpness(player) + Math.min(12, report.minutesPlayed * 0.1) - (report.minutesPlayed < 20 ? 1 : 0),
    0,
    100,
  ).toFixed(1));
}

export function injuryFromMatchRecord(
  record: MatchInjuryRecord,
  seasonYear: number,
  week: number,
): PlayerInjury {
  return {
    id: `inj-${record.playerId}-${seasonYear}-${week}-${record.minute}`,
    name: record.name,
    bodyArea: record.bodyArea,
    severity: record.severity,
    source: "match",
    occurredSeason: seasonYear,
    occurredWeek: week,
    totalWeeks: record.recoveryWeeks,
    weeksRemaining: record.recoveryWeeks,
    rehabProgress: 0,
  };
}

const FOCUS_ATTRIBUTES: Record<TrainingDevelopmentFocus, readonly (keyof Player)[]> = {
  Attacking: ["finishing", "offTheBall", "composure", "longShots", "dribbling"],
  Defending: ["tackling", "marking", "interceptions", "positioning", "concentration"],
  Possession: ["ballControl", "shortPassing", "longPassing", "technique", "decisions"],
  Physical: ["pace", "acceleration", "strength", "agility", "naturalFitness"],
  SetPieces: ["freeKickAccuracy", "penaltyTaking", "crossing", "heading", "technique"],
};

const DEVELOPMENT_FOCUSES: TrainingDevelopmentFocus[] = [
  "Attacking", "Defending", "Possession", "Physical", "SetPieces",
];

export function processWeeklyTraining(
  world: WorldDatabase,
  userClubId: string,
  plan: TrainingPlan,
  seasonYear: number,
  week: number,
  seed: number,
): TrainingWeekReport {
  const key = `${seasonYear}:${week}`;
  const report: TrainingWeekReport = {
    seasonYear,
    week,
    conditionImproved: [],
    developed: [],
    injuries: [],
    returned: [],
  };
  if (plan.lastProcessed === key) return report;
  const rng = new SeededRNG(seed ^ week * 7919 ^ seasonYear);
  const resting = new Set(plan.restPlayerIds);

  for (const club of Object.values(world.clubs)) {
    const isUser = club.id === userClubId;
    const intensity = isUser ? plan.intensity : "Normal";
    const teamFocus = isUser ? plan.teamFocus : "Balanced";
    const facility = clamp(club.facilities.training, 1, 10);
    for (const playerId of club.playerIds) {
      const player = world.players[playerId];
      if (!player) continue;
      initializePlayerFitness(player);
      const before = playerCondition(player);

      if (player.injury && player.injury.weeksRemaining > 0) {
        player.injury.weeksRemaining = Math.max(0, player.injury.weeksRemaining - 1);
        player.injury.rehabProgress = Number(clamp(
          1 - player.injury.weeksRemaining / Math.max(1, player.injury.totalWeeks),
          0,
          1,
        ).toFixed(2));
        player.condition = Number(clamp(before + 18 + player.naturalFitness * 0.45 + facility * 0.7, 0, 100).toFixed(1));
        player.matchSharpness = Number(clamp(playerSharpness(player) - 4, 0, 100).toFixed(1));
        if (player.injury.weeksRemaining === 0) {
          if (isUser) report.returned.push(player.id);
          player.injury = null;
          player.condition = Math.max(player.condition, 68);
        }
        continue;
      }

      const rests = isUser && resting.has(player.id);
      const intensityLoad = intensity === "High" ? 16 : intensity === "Low" ? 4 : 9;
      const recoveryBonus = teamFocus === "Recovery" ? 9 : 0;
      const restBonus = rests ? 16 : 0;
      const recovery = 13 + player.naturalFitness * 0.65 + facility * 0.55 + recoveryBonus + restBonus - (rests ? 0 : intensityLoad);
      player.condition = Number(clamp(before + recovery, 0, 100).toFixed(1));
      const sharpnessDelta = rests ? -3 : intensity === "High" ? 7 : intensity === "Low" ? 2 : 4;
      player.matchSharpness = Number(clamp(playerSharpness(player) + sharpnessDelta, 0, 100).toFixed(1));
      if (player.condition - before >= 8 && isUser) report.conditionImproved.push(player.id);

      if (!rests && teamFocus !== "Recovery") {
        const selectedFocus = isUser
          ? plan.individualFocus[player.id] ?? (teamFocus === "Balanced" ? rng.pick(DEVELOPMENT_FOCUSES) : teamFocus)
          : rng.pick(DEVELOPMENT_FOCUSES);
        developPlayer(player, selectedFocus, facility, intensity, rng, report, isUser);
      }

      if (!rests) {
        const conditionRisk = Math.max(0, 72 - playerCondition(player)) * 0.00045;
        const ageRisk = Math.max(0, player.age - 29) * 0.00055;
        const intensityRisk = intensity === "High" ? 0.011 : intensity === "Low" ? 0.0015 : 0.004;
        const fitnessProtection = player.naturalFitness * 0.00022 + facility * 0.00018;
        const risk = clamp(intensityRisk + conditionRisk + ageRisk - fitnessProtection, 0.0005, 0.045);
        if (rng.chance(risk)) {
          player.injury = rollInjury(player, "training", seasonYear, week, rng);
          if (isUser) report.injuries.push(player.id);
          player.condition = Math.min(playerCondition(player), 62);
        }
      }
    }
  }
  plan.lastProcessed = key;
  // Rest is a one-week medical/training decision; it must be deliberately
  // selected again if the manager wants to extend it.
  plan.restPlayerIds = [];
  return report;
}

function developPlayer(
  player: Player,
  focus: TrainingDevelopmentFocus,
  facility: number,
  intensity: TrainingPlan["intensity"],
  rng: SeededRNG,
  report: TrainingWeekReport,
  reportDevelopment: boolean,
): void {
  player.trainingProgress ??= {};
  const ageFactor = player.age <= 21 ? 1.3 : player.age <= 25 ? 1 : player.age <= 29 ? 0.7 : 0.35;
  const intensityFactor = intensity === "High" ? 1.25 : intensity === "Low" ? 0.7 : 1;
  const gain = (0.11 + facility * 0.012) * player.developmentRate * ageFactor * intensityFactor;
  const progress = (player.trainingProgress[focus] ?? 0) + gain;
  if (progress < 1) {
    player.trainingProgress[focus] = Number(progress.toFixed(3));
    return;
  }
  player.trainingProgress[focus] = Number((progress - 1).toFixed(3));
  const attributes = FOCUS_ATTRIBUTES[focus];
  const attribute = rng.pick([...attributes]);
  const record = player as unknown as Record<string, number>;
  const before = record[String(attribute)] ?? 1;
  const amount = before >= 19 ? 0.1 : 0.2;
  record[String(attribute)] = Number(clamp(before + amount, 1, 20).toFixed(1));
  if (reportDevelopment) report.developed.push({ playerId: player.id, attribute: String(attribute), amount });
}

function rollInjury(
  player: Player,
  source: InjurySource,
  seasonYear: number,
  week: number,
  rng: SeededRNG,
): PlayerInjury {
  const profile = rng.weighted([
    [{ severity: "Knock" as InjurySeverity, weeks: 1 }, source === "match" ? 28 : 18],
    [{ severity: "Minor" as InjurySeverity, weeks: rng.int(1, 2) }, 48],
    [{ severity: "Moderate" as InjurySeverity, weeks: rng.int(3, 6) }, 20],
    [{ severity: "Serious" as InjurySeverity, weeks: rng.int(7, 14) }, 4],
  ]);
  const bodyArea = rng.pick(["hamstring", "ankle", "knee", "calf", "groin", "foot", "shoulder", "back"]);
  const name = injuryName(bodyArea, profile.severity);
  return {
    id: `inj-${player.id}-${seasonYear}-${week}-${Math.floor(rng.next() * 1e7).toString(36)}`,
    name,
    bodyArea,
    severity: profile.severity,
    source,
    occurredSeason: seasonYear,
    occurredWeek: week,
    totalWeeks: profile.weeks,
    weeksRemaining: profile.weeks,
    rehabProgress: 0,
  };
}

export function rollMatchInjury(
  player: Player,
  rng: SeededRNG,
): Omit<MatchInjuryRecord, "clubId" | "side" | "minute"> {
  const injury = rollInjury(player, "match", 0, 0, rng);
  return {
    playerId: player.id,
    playerName: `${player.firstName} ${player.lastName}`,
    name: injury.name,
    bodyArea: injury.bodyArea,
    severity: injury.severity,
    recoveryWeeks: injury.totalWeeks,
  };
}

function injuryName(bodyArea: string, severity: InjurySeverity): string {
  if (severity === "Knock") return `${capitalize(bodyArea)} knock`;
  if (bodyArea === "hamstring" || bodyArea === "calf" || bodyArea === "groin") return `${capitalize(bodyArea)} strain`;
  if (bodyArea === "ankle" || bodyArea === "knee" || bodyArea === "shoulder") return `${capitalize(bodyArea)} sprain`;
  return `${capitalize(bodyArea)} injury`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
