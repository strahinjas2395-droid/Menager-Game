import {
  Difficulty,
  type MatchPlanAttackApproach,
  type OpponentMatchPlan,
  type OpponentPlayerPlan,
  type Player,
} from "@/types";

export interface MatchPlanPlayer {
  player: Player;
  role: string;
}

export function emptyOpponentMatchPlan(fixtureId: string, source: "user" | "ai" = "user"): OpponentMatchPlan {
  return { fixtureId, source, instructions: [] };
}

export function defaultOpponentPlayerPlan(player: Player): OpponentPlayerPlan {
  return {
    targetPlayerId: player.id,
    targetPlayerName: `${player.firstName} ${player.lastName}`,
    tightMarking: false,
    pressing: "normal",
    showOnto: "normal",
    doubleTeam: false,
    preventCrosses: false,
    attackApproach: "none",
  };
}

export function hasActiveOpponentInstruction(instruction: OpponentPlayerPlan): boolean {
  return Boolean(
    instruction.markerPlayerId || instruction.tightMarking || instruction.pressing !== "normal" ||
    instruction.showOnto !== "normal" || instruction.doubleTeam || instruction.preventCrosses ||
    instruction.attackApproach !== "none",
  );
}

/** Validate all identities and enum values before a plan reaches the simulation. */
export function sanitizeOpponentMatchPlan(
  plan: OpponentMatchPlan | undefined,
  fixtureId: string,
  ownPlayers: readonly Player[],
  opponents: readonly Player[],
  source: "user" | "ai" = plan?.source ?? "user",
): OpponentMatchPlan {
  const own = new Map(
    ownPlayers.filter((player) => player.primaryPosition !== "GK").map((player) => [player.id, player]),
  );
  const targets = new Map(opponents.map((player) => [player.id, player]));
  const byTarget = new Map<string, OpponentPlayerPlan>();
  for (const raw of plan?.instructions ?? []) {
    const target = targets.get(raw.targetPlayerId);
    if (!target) continue;
    const marker = raw.markerPlayerId ? own.get(raw.markerPlayerId) : undefined;
    const pressing = raw.pressing === "pressOnReceive" || raw.pressing === "standOff"
      ? raw.pressing
      : "normal";
    const showOnto = raw.showOnto === "inside" || raw.showOnto === "outside" || raw.showOnto === "weakFoot"
      ? raw.showOnto
      : "normal";
    const attackApproach = raw.attackApproach === "pace" || raw.attackApproach === "dribble" || raw.attackApproach === "aerial"
      ? raw.attackApproach
      : "none";
    const instruction: OpponentPlayerPlan = {
      targetPlayerId: target.id,
      targetPlayerName: `${target.firstName} ${target.lastName}`,
      markerPlayerId: marker?.id,
      markerPlayerName: marker ? `${marker.firstName} ${marker.lastName}` : undefined,
      tightMarking: raw.tightMarking === true,
      pressing,
      showOnto,
      doubleTeam: raw.doubleTeam === true && pressing !== "standOff",
      preventCrosses: raw.preventCrosses === true,
      attackApproach,
    };
    if (hasActiveOpponentInstruction(instruction)) byTarget.set(target.id, instruction);
  }
  const usedMarkers = new Set<string>();
  const instructions = [...byTarget.values()].map((instruction) => {
    if (!instruction.markerPlayerId) return instruction;
    if (usedMarkers.has(instruction.markerPlayerId)) {
      // One footballer cannot execute two exact marking jobs at once. Keep the
      // first assignment deterministic and leave the later target in zonal care.
      return { ...instruction, markerPlayerId: undefined, markerPlayerName: undefined };
    }
    usedMarkers.add(instruction.markerPlayerId);
    return instruction;
  }).filter(hasActiveOpponentInstruction).slice(0, 8);
  return { fixtureId, source, instructions };
}

export function upsertOpponentInstruction(
  plan: OpponentMatchPlan,
  instruction: OpponentPlayerPlan,
): OpponentMatchPlan {
  const instructions = plan.instructions.filter((entry) => entry.targetPlayerId !== instruction.targetPlayerId);
  if (hasActiveOpponentInstruction(instruction)) instructions.push(instruction);
  return { ...plan, instructions };
}

export function summarizeOpponentInstruction(instruction: OpponentPlayerPlan): string[] {
  const summary: string[] = [];
  if (instruction.markerPlayerName) summary.push(`${instruction.markerPlayerName} marks`);
  if (instruction.tightMarking) summary.push("tight marking");
  if (instruction.pressing === "pressOnReceive") summary.push("press on reception");
  if (instruction.pressing === "standOff") summary.push("stand off");
  if (instruction.showOnto !== "normal") summary.push(`show ${instruction.showOnto === "weakFoot" ? "onto weak foot" : instruction.showOnto}`);
  if (instruction.doubleTeam) summary.push("double-team");
  if (instruction.preventCrosses) summary.push("block crosses");
  if (instruction.attackApproach !== "none") summary.push(`attack with ${instruction.attackApproach}`);
  return summary;
}

/** Difficulty-scaled AI plan built from role-specific qualities, never a stored overall rating. */
export function buildAIOpponentMatchPlan(
  fixtureId: string,
  own: readonly MatchPlanPlayer[],
  opponents: readonly MatchPlanPlayer[],
  difficulty: Difficulty | string | undefined,
): OpponentMatchPlan {
  const level = difficultyLevel(difficulty);
  if (!own.length || !opponents.length || level === 0) return emptyOpponentMatchPlan(fixtureId, "ai");

  const threats = [...opponents]
    .filter(({ role }) => role !== "GK")
    .map((entry) => ({ ...entry, threat: threatScore(entry.player, entry.role) }))
    .sort((a, b) => b.threat - a.threat || a.player.id.localeCompare(b.player.id));
  const focusCount = level >= 6 ? 2 : 1;
  const instructions: OpponentPlayerPlan[] = [];
  for (const target of threats.slice(0, focusCount)) {
    const marker = [...own]
      .filter(({ role }) => role !== "GK")
      .sort((a, b) => markerScore(b.player, b.role, target.player, target.role) - markerScore(a.player, a.role, target.player, target.role))[0];
    const wideTarget = ["RW", "LW", "RM", "LM", "RWB", "LWB", "RB", "LB"].includes(target.role);
    instructions.push({
      targetPlayerId: target.player.id,
      targetPlayerName: `${target.player.firstName} ${target.player.lastName}`,
      markerPlayerId: level >= 2 ? marker?.player.id : undefined,
      markerPlayerName: level >= 2 && marker ? `${marker.player.firstName} ${marker.player.lastName}` : undefined,
      tightMarking: level >= 2,
      pressing: level >= 1 ? "pressOnReceive" : "normal",
      showOnto: level >= 3 ? "weakFoot" : "normal",
      doubleTeam: level >= 5 && target.threat >= 51,
      preventCrosses: level >= 4 && wideTarget,
      attackApproach: "none",
    });
  }

  if (level >= 4) {
    const vulnerable = [...opponents]
      .filter(({ role }) => ["CB", "RB", "LB", "RWB", "LWB"].includes(role))
      .sort((a, b) => vulnerabilityScore(b.player) - vulnerabilityScore(a.player))[0];
    if (vulnerable) {
      const existing = instructions.find((entry) => entry.targetPlayerId === vulnerable.player.id);
      const approach = chooseAttackApproach(own, vulnerable.player);
      if (existing) existing.attackApproach = approach;
      else instructions.push({ ...defaultOpponentPlayerPlan(vulnerable.player), attackApproach: approach });
    }
  }

  return sanitizeOpponentMatchPlan(
    { fixtureId, source: "ai", instructions },
    fixtureId,
    own.map(({ player }) => player),
    opponents.map(({ player }) => player),
    "ai",
  );
}

function difficultyLevel(difficulty: Difficulty | string | undefined): number {
  switch (difficulty) {
    case Difficulty.Beginner: return 0;
    case Difficulty.Amateur: return 1;
    case Difficulty.SemiPro: return 2;
    case Difficulty.Professional: return 3;
    case Difficulty.WorldClass: return 4;
    case Difficulty.Legend:
    case Difficulty.Legendary: return 5;
    case Difficulty.Ultimate: return 6;
    default: return 2;
  }
}

function threatScore(player: Player, role: string): number {
  const form = player.seasonStats.lastRating > 0 ? Math.max(0, player.seasonStats.lastRating - 6) * 3 : 0;
  const output = player.seasonStats.goals * 0.5 + player.seasonStats.assists * 0.35;
  if (["ST", "CF", "RW", "LW"].includes(role)) {
    return player.finishing * 1.1 + player.offTheBall + player.pace * 0.8 + player.dribbling * 0.55 + form + output;
  }
  return player.creativity + player.shortPassing + player.decisions + player.dribbling * 0.45 + form + output;
}

function markerScore(marker: Player, role: string, target: Player, targetRole: string): number {
  const positionalFit = ["CB", "CDM", "DM", "RB", "LB", "RWB", "LWB"].includes(role) ? 8 : 0;
  const wideFit = ["RW", "LW", "RM", "LM"].includes(targetRole) && ["RB", "LB", "RWB", "LWB"].includes(role) ? 8 : 0;
  return marker.marking + marker.positioning + marker.tackling + marker.pace * 0.6 + marker.strength * 0.3 + positionalFit + wideFit - Math.max(0, target.pace - marker.pace) * 0.4;
}

function vulnerabilityScore(player: Player): number {
  return (21 - player.pace) * 0.9 + (21 - player.acceleration) * 0.7 + (21 - player.aerialDuels) * 0.35 + (21 - player.positioning) * 0.4;
}

function chooseAttackApproach(own: readonly MatchPlanPlayer[], defender: Player): MatchPlanAttackApproach {
  const attackers = own.filter(({ role }) => ["ST", "CF", "RW", "LW", "CAM", "RM", "LM"].includes(role));
  const pace = attackers.reduce((best, { player }) => Math.max(best, player.pace + player.acceleration), 0) / 2;
  const aerial = attackers.reduce((best, { player }) => Math.max(best, player.heading + player.jumping), 0) / 2;
  const dribble = attackers.reduce((best, { player }) => Math.max(best, player.dribbling + player.agility), 0) / 2;
  const paceEdge = pace - defender.pace;
  const aerialEdge = aerial - (defender.aerialDuels + defender.jumping) / 2;
  const dribbleEdge = dribble - (defender.tackling + defender.agility) / 2;
  if (paceEdge >= aerialEdge && paceEdge >= dribbleEdge) return "pace";
  if (aerialEdge >= dribbleEdge) return "aerial";
  return "dribble";
}
