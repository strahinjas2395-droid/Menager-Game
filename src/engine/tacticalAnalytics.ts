import { clamp } from "@/database/rng";
import type {
  PassNetworkEdge,
  TacticalEvent,
  TacticalTeamSummary,
} from "@/types";

const PITCH_WIDTH = 1000;
const PITCH_HEIGHT = 650;

/** A deterministic location/pressure xG estimate; no player overall is used. */
export function expectedGoalsAt(
  x: number,
  y: number,
  pressure = 0,
  qualifier?: string,
): number {
  if (qualifier === "penalty") return 0.76;
  const dxM = Math.max(0, PITCH_WIDTH - x) / 10;
  const dyM = Math.abs(y - PITCH_HEIGHT / 2) / 10;
  const distance = Math.hypot(dxM, dyM);
  const centrality = 1 - clamp(dyM / 32.5, 0, 1);
  const closeRange = 1 / (1 + Math.exp((distance - 16.5) / 4.2));
  const pressurePenalty = clamp(pressure, 0, 1) * 0.42;
  const setPiecePenalty = qualifier === "freeKick" ? 0.38 : 0;
  return Number(clamp(
    0.015 + closeRange * (0.5 + centrality * 0.34) * (1 - pressurePenalty) * (1 - setPiecePenalty),
    0.01,
    0.82,
  ).toFixed(3));
}

function progressive(event: TacticalEvent): boolean {
  if (event.endX === undefined || event.outcome !== "complete") return false;
  return event.endX - event.x >= 100 || (event.x < 660 && event.endX >= 660);
}

function entersFinalThird(event: TacticalEvent): boolean {
  return event.endX !== undefined && event.x < 667 && event.endX >= 667 &&
    (event.outcome === "complete" || event.outcome === "won");
}

function entersBox(event: TacticalEvent): boolean {
  return event.endX !== undefined && event.x < 835 && event.endX >= 835 &&
    (event.endY ?? event.y) >= 124 && (event.endY ?? event.y) <= 526 &&
    (event.outcome === "complete" || event.outcome === "won");
}

export function buildPassNetwork(
  events: readonly TacticalEvent[],
  side: "home" | "away",
): PassNetworkEdge[] {
  const edges = new Map<string, PassNetworkEdge>();
  for (const event of events) {
    if (
      event.side !== side || event.outcome !== "complete" || !event.playerId || !event.relatedPlayerId ||
      !["pass", "throughBall", "cross"].includes(event.type)
    ) continue;
    const key = `${event.playerId}>${event.relatedPlayerId}`;
    const edge = edges.get(key) ?? {
      side,
      fromPlayerId: event.playerId,
      toPlayerId: event.relatedPlayerId,
      completed: 0,
      progressive: 0,
    };
    edge.completed += 1;
    if (progressive(event)) edge.progressive += 1;
    edges.set(key, edge);
  }
  return [...edges.values()]
    .sort((a, b) => b.completed - a.completed || b.progressive - a.progressive ||
      a.fromPlayerId.localeCompare(b.fromPlayerId) || a.toPlayerId.localeCompare(b.toPlayerId))
    .slice(0, 30);
}

function summaryFor(
  events: readonly TacticalEvent[],
  side: "home" | "away",
  finalThirdTotal: number,
): TacticalTeamSummary {
  const mine = events.filter((event) => event.side === side);
  const opponents = events.filter((event) => event.side !== side);
  const passes = mine.filter((event) => ["pass", "throughBall", "cross"].includes(event.type));
  const sequences = new Map<number, number>();
  const directSequences = new Set<number>();
  for (const event of mine) {
    sequences.set(event.possessionId, (sequences.get(event.possessionId) ?? 0) + 1);
    if (
      event.sequenceIndex <= 3 && event.x < 420 && (event.endX ?? event.x) > 720 &&
      (event.outcome === "complete" || event.outcome === "won")
    ) directSequences.add(event.possessionId);
  }
  const sequenceActions = [...sequences.values()];
  const finalThirdActions = mine.filter((event) => event.x >= 667 || (event.endX ?? 0) >= 667).length;
  const defensiveActions = mine.filter((event) =>
    ["tackle", "interception", "foul"].includes(event.type) && event.x >= 400,
  ).length;
  const oppositionBuildPasses = opponents.filter((event) =>
    ["pass", "throughBall"].includes(event.type) && event.x <= 600 && event.outcome === "complete",
  ).length;

  return {
    side,
    expectedGoals: Number(mine.reduce((sum, event) => sum + (event.expectedGoals ?? 0), 0).toFixed(2)),
    passesAttempted: passes.length,
    passesCompleted: passes.filter((event) => event.outcome === "complete").length,
    progressivePasses: passes.filter(progressive).length,
    finalThirdEntries: mine.filter(entersFinalThird).length,
    boxEntries: mine.filter(entersBox).length,
    highRegains: mine.filter((event) =>
      ["recovery", "interception", "tackle"].includes(event.type) &&
      ["won", "complete"].includes(event.outcome) && event.x >= 600,
    ).length,
    turnovers: mine.filter((event) =>
      ["pass", "throughBall", "cross", "dribble"].includes(event.type) &&
      ["failed", "lost"].includes(event.outcome),
    ).length,
    pressingActions: defensiveActions,
    possessionSequences: sequences.size,
    averageSequenceActions: Number((
      sequenceActions.reduce((sum, count) => sum + count, 0) / Math.max(1, sequenceActions.length)
    ).toFixed(1)),
    directAttacks: directSequences.size,
    leftChannelActions: mine.filter((event) => event.y < PITCH_HEIGHT / 3).length,
    centralChannelActions: mine.filter((event) => event.y >= PITCH_HEIGHT / 3 && event.y <= PITCH_HEIGHT * 2 / 3).length,
    rightChannelActions: mine.filter((event) => event.y > PITCH_HEIGHT * 2 / 3).length,
    fieldTilt: finalThirdTotal > 0 ? Math.round(finalThirdActions / finalThirdTotal * 100) : 50,
    ppda: Number((oppositionBuildPasses / Math.max(1, defensiveActions)).toFixed(1)),
  };
}

export function buildTacticalAnalytics(events: readonly TacticalEvent[]): {
  teamSummaries: { home: TacticalTeamSummary; away: TacticalTeamSummary };
  passNetworks: { home: PassNetworkEdge[]; away: PassNetworkEdge[] };
} {
  const finalThirdTotal = events.filter((event) => event.x >= 667 || (event.endX ?? 0) >= 667).length;
  return {
    teamSummaries: {
      home: summaryFor(events, "home", finalThirdTotal),
      away: summaryFor(events, "away", finalThirdTotal),
    },
    passNetworks: {
      home: buildPassNetwork(events, "home"),
      away: buildPassNetwork(events, "away"),
    },
  };
}
