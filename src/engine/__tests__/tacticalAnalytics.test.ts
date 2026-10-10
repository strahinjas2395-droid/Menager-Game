import { describe, expect, it } from "vitest";
import { buildTacticalAnalytics, expectedGoalsAt } from "@/engine/tacticalAnalytics";
import type { TacticalEvent } from "@/types";

function event(partial: Partial<TacticalEvent> & Pick<TacticalEvent, "id" | "side" | "type">): TacticalEvent {
  return {
    second: 60,
    minute: 1,
    clubId: partial.side,
    outcome: "complete",
    x: 200,
    y: 325,
    pressure: 0.2,
    phase: "buildUp",
    possessionId: 1,
    sequenceIndex: 1,
    ...partial,
  };
}

describe("event-level tactical analytics", () => {
  it("rates close central shots above pressured long-range efforts", () => {
    const close = expectedGoalsAt(900, 325, 0.1);
    const long = expectedGoalsAt(690, 120, 0.8);
    expect(close).toBeGreaterThan(long * 5);
    expect(expectedGoalsAt(880, 325, 1, "penalty")).toBe(0.76);
  });

  it("derives entries, sequences, field tilt and pass networks from exact events", () => {
    const events: TacticalEvent[] = [
      event({ id: "h1", side: "home", type: "pass", playerId: "h-a", relatedPlayerId: "h-b", x: 300, endX: 520 }),
      event({ id: "h2", side: "home", type: "throughBall", playerId: "h-b", relatedPlayerId: "h-c", x: 620, endX: 760, sequenceIndex: 2 }),
      event({ id: "h3", side: "home", type: "pass", playerId: "h-a", relatedPlayerId: "h-b", x: 760, endX: 860, endY: 325, sequenceIndex: 3 }),
      event({ id: "h4", side: "home", type: "shot", playerId: "h-c", outcome: "saved", x: 880, expectedGoals: 0.35, sequenceIndex: 4 }),
      event({ id: "h5", side: "home", type: "interception", playerId: "h-b", outcome: "won", x: 710, possessionId: 2 }),
      event({ id: "a1", side: "away", type: "pass", playerId: "a-a", relatedPlayerId: "a-b", x: 150, endX: 270, possessionId: 3 }),
      event({ id: "a2", side: "away", type: "pass", playerId: "a-b", outcome: "failed", x: 270, endX: 410, possessionId: 3, sequenceIndex: 2 }),
    ];
    const analytics = buildTacticalAnalytics(events);
    expect(analytics.teamSummaries.home).toMatchObject({
      expectedGoals: 0.35,
      passesAttempted: 3,
      passesCompleted: 3,
      progressivePasses: 3,
      finalThirdEntries: 1,
      boxEntries: 1,
      highRegains: 1,
      possessionSequences: 2,
    });
    expect(analytics.teamSummaries.home.fieldTilt).toBeGreaterThan(analytics.teamSummaries.away.fieldTilt);
    expect(analytics.teamSummaries.away.turnovers).toBe(1);
    expect(analytics.passNetworks.home[0]).toMatchObject({
      fromPlayerId: "h-a",
      toPlayerId: "h-b",
      completed: 2,
    });
  });
});
