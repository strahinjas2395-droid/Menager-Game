import { describe, expect, it } from "vitest";
import { SeededRNG } from "@/database/rng";
import { generateSquad } from "@/database/playerGenerator";
import { buildTeamSide } from "@/engine/matchSimulator";
import { buildOppositionReport } from "@/engine/oppositionAnalysis";
import {
  CompetitionType,
  DefensiveLine,
  ManagerPersonality,
  MentalityLevel,
  PlayStyle,
  PlaystyleTag,
  PressingIntensity,
  TempoSetting,
  TimeWasting,
  WidthSetting,
  type Fixture,
  type GameSave,
  type TacticalSetup,
} from "@/types";

function tactics(): TacticalSetup {
  return {
    formation: "4-3-3",
    playStyle: PlayStyle.DirectCounterAttack,
    tempo: TempoSetting.Fast,
    passingLength: TempoSetting.Fast,
    defensiveLine: DefensiveLine.Deep,
    pressing: PressingIntensity.High,
    width: WidthSetting.Wide,
    mentality: MentalityLevel.Positive,
    timeWasting: TimeWasting.Late,
    offsideTrap: false,
    counterAttack: true,
    positionOverrides: {},
    setPieces: { cornerLeftId: null, cornerRightId: null, freeKickId: null, penaltyId: null, captainId: null },
  };
}

function fixture(id: string, week: number, home: string, away: string, played = false, score = [0, 0]): Fixture {
  return {
    id,
    competitionType: CompetitionType.League,
    competitionId: "league",
    round: week,
    week,
    homeClubId: home,
    awayClubId: away,
    played,
    homeGoals: score[0],
    awayGoals: score[1],
  };
}

describe("opposition intelligence", () => {
  it("builds a deterministic coach, tactics, danger-player and form dossier", () => {
    const rng = new SeededRNG(7001);
    const squad = generateSquad("opp", 2, "Bretherland", rng, 7001);
    const star = squad.find((player) => player.primaryPosition !== "GK")!;
    Object.assign(star, {
      pace: 20,
      acceleration: 20,
      finishing: 19,
      offTheBall: 19,
      playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.ClinicalFinisher],
      seasonStats: { appearances: 8, goals: 9, assists: 3, yellowCards: 0, redCards: 0, lastRating: 8.2 },
    });
    const plan = tactics();
    const opponent = buildTeamSide({
      clubId: "opp",
      name: "Opposition Athletic",
      shortName: "OPA",
      primaryColor: "#cc2233",
      secondaryColor: "#fff",
      isHome: false,
      squad,
      tactics: plan,
      isUserTeam: false,
      manager: { id: "manager", name: "Mira Tactic", reputation: 83, tacticalFlexibility: 17 },
    });
    const next = fixture("next", 9, "user", "opp");
    const playedFixtures = [
      fixture("old-1", 8, "opp", "other", true, [3, 1]),
      fixture("old-2", 7, "other", "opp", true, [2, 2]),
      fixture("old-3", 6, "opp", "other", true, [0, 1]),
    ];
    const players = Object.fromEntries(squad.map((player) => [player.id, player]));
    const save = {
      userClubId: "user",
      results: {},
      world: {
        players,
        clubs: {
          user: { id: "user", name: "User FC", shortName: "USR" },
          opp: { id: "opp", name: "Opposition Athletic", shortName: "OPA", managerId: "manager" },
          other: { id: "other", name: "Other Town", shortName: "OTH" },
        },
        managers: {
          manager: {
            id: "manager",
            firstName: "Mira",
            lastName: "Tactic",
            nationality: "Bretherland",
            personality: ManagerPersonality.TacticallyObsessed,
            reputation: 83,
            clubId: "opp",
            formation: "4-3-3",
            playStyle: PlayStyle.DirectCounterAttack,
            tacticalFlexibility: 17,
          },
        },
        leagues: {},
        fixtures: Object.fromEntries([next, ...playedFixtures].map((item) => [item.id, item])),
      },
    } as unknown as GameSave;

    const report = buildOppositionReport(save, next, opponent);
    expect(report.coach).toMatchObject({ name: "Mira Tactic", tacticalFlexibility: 17 });
    expect(report.expectedFormation).toBe("4-3-3");
    expect(report.playStyle).toBe(PlayStyle.DirectCounterAttack);
    expect(report.expectedXI).toHaveLength(11);
    expect(report.dangerousPlayers).toHaveLength(4);
    expect(report.dangerousPlayers.some((player) => player.playerId === star.id)).toBe(true);
    expect(report.dangerousPlayers.find((player) => player.playerId === star.id)).toMatchObject({ goals: 9, assists: 3, form: "Excellent" });
    expect(report.likelyThreats.join(" ")).toContain("space");
    expect(report.strengths).toHaveLength(3);
    expect(report.weaknesses).toHaveLength(2);
    expect(report.seasonRecord).toEqual({ played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 5, goalsAgainst: 4, cleanSheets: 0 });
    expect(report.recentForm.map((match) => match.result)).toEqual(["W", "D", "L"]);
    expect(buildOppositionReport(save, next, opponent)).toEqual(report);
  });
});
