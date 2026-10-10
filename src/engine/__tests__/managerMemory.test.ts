import { describe, expect, it } from "vitest";
import {
  adaptTacticsToManagerMemory,
  memoryPlayerThreatBonus,
  rememberManagerMatch,
} from "@/engine/managerMemory";
import { defaultTactics } from "@/store/gameStore";
import {
  CompetitionType,
  Difficulty,
  ManagerPersonality,
  PlayStyle,
  type Fixture,
  type Manager,
  type MatchResult,
} from "@/types";

const manager: Manager = {
  id: "manager-rival",
  firstName: "Rival",
  lastName: "Coach",
  nationality: "Bretherland",
  personality: ManagerPersonality.TacticallyObsessed,
  reputation: 72,
  clubId: "rival",
  formation: "4-3-3",
  playStyle: PlayStyle.Balanced,
  tacticalFlexibility: 16,
};

const fixture: Fixture = {
  id: "meeting-1",
  competitionType: CompetitionType.League,
  competitionId: "league",
  round: 1,
  week: 5,
  homeClubId: "user",
  awayClubId: "rival",
  played: true,
  homeGoals: 2,
  awayGoals: 0,
};

function result(rating = 8): MatchResult {
  return {
    fixtureId: fixture.id,
    homeClubId: "user",
    awayClubId: "rival",
    homeGoals: 2,
    awayGoals: 0,
    stats: {} as MatchResult["stats"],
    ratings: { threat: rating },
    events: [],
    analysis: {
      schemaVersion: 2,
      heatmapColumns: 12,
      heatmapRows: 8,
      generatedAtMinute: 90,
      initialHomeFormation: "4-3-3",
      initialAwayFormation: "4-3-3",
      finalHomeFormation: "4-3-3",
      finalAwayFormation: "4-4-2",
      initialHomePlayStyle: PlayStyle.WingPlay,
      finalHomePlayStyle: PlayStyle.WingPlay,
      players: {
        threat: {
          playerId: "threat", clubId: "user", side: "home", playerName: "Fast Winger",
          shirtNumber: 7, position: "RW", started: true, minuteOn: 0, minuteOff: 90,
          minutesPlayed: 90, rating, goals: 1, assists: 1, shots: 4, keyPasses: 3,
        } as never,
      },
      tacticalChanges: [],
      teamSummaries: {
        home: {
          side: "home", expectedGoals: 2.1, fieldTilt: 64, highRegains: 5,
          leftChannelActions: 8, centralChannelActions: 10, rightChannelActions: 28,
        } as never,
        away: { side: "away" } as never,
      },
    },
  };
}

describe("persistent AI manager memory", () => {
  it("remembers exact opponents and structured tactical evidence across meetings", () => {
    const first = rememberManagerMatch(undefined, {
      manager, fixture, result: result(8), userClubId: "user", seasonYear: 2026, week: 5,
    });
    const second = rememberManagerMatch(first, {
      manager,
      fixture: { ...fixture, id: "meeting-2", week: 24 },
      result: result(7),
      userClubId: "user",
      seasonYear: 2026,
      week: 24,
    });
    expect(second.meetings).toBe(2);
    expect(second.encounters).toHaveLength(2);
    expect(second.observedFormations["4-3-3"]).toBe(2);
    expect(second.observedPlayStyles[PlayStyle.WingPlay]).toBe(2);
    expect(second.playerKnowledge.threat).toMatchObject({ meetings: 2, goals: 2, assists: 2, averageRating: 7.5 });
    expect(second.tacticalLessons.some((lesson) => lesson.includes("right attacking channel"))).toBe(true);
  });

  it("lets better difficulties recall and act on memory while beginners do not", () => {
    const memory = rememberManagerMatch(undefined, {
      manager, fixture, result: result(), userClubId: "user", seasonYear: 2026, week: 5,
    });
    const base = defaultTactics("4-3-3");
    const beginner = adaptTacticsToManagerMemory(base, memory, Difficulty.Beginner);
    const elite = adaptTacticsToManagerMemory(base, memory, Difficulty.WorldClass);
    expect(beginner.reasons).toEqual([]);
    expect(beginner.tactics).toEqual(base);
    expect(elite.reasons.some((reason) => reason.includes("wide attacks"))).toBe(true);
    expect(elite.tactics.width).not.toBe(base.width);
    expect(memoryPlayerThreatBonus(memory, "threat", Difficulty.WorldClass))
      .toBeGreaterThan(memoryPlayerThreatBonus(memory, "threat", Difficulty.Amateur));
  });
});
