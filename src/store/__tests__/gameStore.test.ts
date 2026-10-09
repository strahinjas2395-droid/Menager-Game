import { describe, expect, it } from "vitest";
import { useGameStore } from "@/store/gameStore";
import { LEAGUES_DATA, slugify } from "@/database/leagueGenerator";
import { Difficulty, type MatchResult, type MatchStats } from "@/types";

function emptyStats(): MatchStats {
  return {
    possessionHome: 50,
    shotsHome: 5,
    shotsOnTargetHome: 2,
    passesAttemptedHome: 200,
    passesCompletedHome: 170,
    tacklesHome: 15,
    foulsHome: 10,
    cornersHome: 4,
    possessionAway: 50,
    shotsAway: 5,
    shotsOnTargetAway: 2,
    passesAttemptedAway: 200,
    passesCompletedAway: 170,
    tacklesAway: 15,
    foulsAway: 10,
    cornersAway: 4,
  };
}

describe("core game loop (integration)", () => {
  it("creates a career, plays through the first weeks, keeps data consistent", async () => {
    const league = LEAGUES_DATA.find((l) => l.nation === "Bretherland" && l.tier === 1)!;
    const leagueId = slugify(league.name);
    const clubId = slugify(league.clubs[0]);

    await useGameStore.getState().newCareer({
      managerName: "Test Manager",
      managerNationality: "Valdoria",
      difficulty: Difficulty.Professional,
      leagueId,
      clubId,
    });

    const store = () => useGameStore.getState();
    const save = store().save;
    expect(save).toBeTruthy();
    expect(save!.userClubId).toBe(clubId);
    expect(Object.keys(save!.world.leagues)).toHaveLength(20);
    expect(Object.keys(save!.world.clubs)).toHaveLength(400);
    expect(Object.keys(save!.world.players).length).toBeGreaterThan(5000);
    expect(Object.keys(save!.world.fixtures).length).toBeGreaterThan(7600); // 20x380 league + cups
    expect(save!.cup).toBeTruthy();
    expect(save!.continental?.groups).toHaveLength(8);
    expect(save!.season.currentWeek).toBe(1);
    expect(save!.season.transferWindowOpen).toBe(true);
    expect(save!.inbox.length).toBeGreaterThanOrEqual(1);
    expect(save!.tacticalSetup.formation).toBeTruthy();

    const buildResult = (fixtureId: string): MatchResult => {
      const s = store().save!;
      const fixture = s.world.fixtures[fixtureId];
      const userSquad = s.world.clubs[s.userClubId].playerIds;
      const ratings: Record<string, number> = {};
      for (const pid of userSquad) ratings[pid] = 6.5 + ((pid.length % 10) / 10);
      return {
        fixtureId,
        homeClubId: fixture.homeClubId,
        awayClubId: fixture.awayClubId,
        homeGoals: 2,
        awayGoals: 1,
        stats: emptyStats(),
        ratings,
        events: [],
      };
    };

    // Play like the UI does until we cross into week 8
    let guard = 0;
    let r = store().advanceWeek();
    while (guard++ < 120) {
      if (r.type === "match") {
        r = store().recordUserMatch(buildResult(r.fixtureId));
      } else {
        if (store().save!.season.currentWeek >= 8) break;
        r = store().advanceWeek();
      }
    }
    expect(guard).toBeLessThan(120);

    const after = store().save!;
    expect(after.season.currentWeek).toBeGreaterThanOrEqual(8);

    // user's league fixtures for weeks 1-7 all played
    const userLeagueFixtures = Object.values(after.world.fixtures).filter(
      (f) =>
        f.competitionId === leagueId &&
        (f.homeClubId === clubId || f.awayClubId === clubId) &&
        f.week <= 7,
    );
    expect(userLeagueFixtures).toHaveLength(7);
    expect(userLeagueFixtures.every((f) => f.played)).toBe(true);

    // every club in the user's league played exactly 7 league games
    const leagueFixtures = Object.values(after.world.fixtures).filter(
      (f) => f.competitionId === leagueId && f.week <= 7,
    );
    expect(leagueFixtures).toHaveLength(7 * 10);
    expect(leagueFixtures.every((f) => f.played)).toBe(true);

    // standings add up: played = 7 for everyone
    const table = Object.values(after.world.leagues).find((l) => l.id === leagueId)!
      .clubIds.map((id) => {
        const played = leagueFixtures.filter(
          (f) => f.homeClubId === id || f.awayClubId === id,
        ).length;
        return played;
      });
    expect(table.every((p) => p === 7)).toBe(true);

    // news from user matches landed in the inbox
    expect(after.inbox.length).toBeGreaterThanOrEqual(2);

    // results recorded
    expect(Object.keys(after.results).length).toBeGreaterThanOrEqual(7);

    // player season stats updated (user squad has appearances)
    const anyUserPlayer = after.world.clubs[clubId].playerIds
      .map((id) => after.world.players[id])
      .find((p) => p && p.seasonStats.appearances > 0);
    expect(anyUserPlayer).toBeTruthy();

    // advancing further does not throw
    const r2 = store().advanceWeek();
    expect(["match", "none", "seasonEnd"]).toContain(r2.type);
  }, 30_000);
});
