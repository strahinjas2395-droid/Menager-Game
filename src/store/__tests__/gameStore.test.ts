import { describe, expect, it } from "vitest";
import { getMatchContext, useGameStore } from "@/store/gameStore";
import { buildInstructionRoster, instructionContextFingerprint } from "@/engine/directives";
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

    // dragged position overrides flow into the match context (mirrored for away)
    const week1UserFixture = Object.values(save!.world.fixtures).find(
      (f) =>
        f.week === 1 &&
        (f.homeClubId === clubId || f.awayClubId === clubId),
    )!;
    let ctx = getMatchContext(save!, week1UserFixture.id)!;
    const userSide = week1UserFixture.homeClubId === clubId ? ctx.home : ctx.away;
    const starterId = userSide.starters[0].id;
    const starterIdx = userSide.starters.findIndex((p) => p.id === starterId);
    save!.tacticalSetup.positionOverrides[starterId] = { x: 333, y: 222 };
    ctx = getMatchContext(save!, week1UserFixture.id)!;
    const userSide2 = week1UserFixture.homeClubId === clubId ? ctx.home : ctx.away;
    expect(userSide2.basePositions[starterIdx]).toEqual(
      week1UserFixture.homeClubId === clubId
        ? { x: 333, y: 222 }
        : { x: 667, y: 222 },
    );
    delete save!.tacticalSetup.positionOverrides[starterId];

    // free-text individual instructions persist and reach the match engine as directives
    await store().updatePlayerInstructions({
      [starterId]: "Hold your position, keep passes short and press aggressively",
    });
    expect(store().save!.world.players[starterId].individualInstructions).toContain("keep passes short");
    ctx = getMatchContext(store().save!, week1UserFixture.id)!;
    const instructedSide = week1UserFixture.homeClubId === clubId ? ctx.home : ctx.away;
    expect(instructedSide.directives?.[starterId]).toMatchObject({
      holdPosition: true,
      shortPassing: true,
      pressHard: true,
    });

    // A persisted AI interpretation—not a keyword match—also reaches both
    // team-wide behavior and a resolved player assignment.
    const fullSquad = store().save!.world.clubs[clubId].playerIds
      .map((id) => store().save!.world.players[id]);
    const roster = buildInstructionRoster(
      fullSquad,
      instructedSide.starters,
      instructedSide.roles,
      instructedSide.displayNumbers,
    );
    const contextFingerprint = instructionContextFingerprint(roster);
    const targetId = instructedSide.starters.find((player) => player.id !== starterId)!.id;
    const teamText = "evryone boot itt away rite now; our one shud fynd the other lad";
    await store().updateTactics({
      ...store().save!.tacticalSetup,
      teamInstructions: teamText,
      instructionCache: {
        players: {},
        team: {
          schemaVersion: 1,
          input: teamText,
          scope: "team",
          contextFingerprint,
          directives: { clearImmediately: true },
          assignments: [{
            playerId: starterId,
            playerName: `${instructedSide.starters[0].firstName} ${instructedSide.starters[0].lastName}`,
            directives: {
              directPassing: true,
              preferredTargetId: targetId,
              targetPriority: 1,
              targetDelivery: "aerial",
            },
          }],
          understood: ["Clear danger immediately", "Starter deliberately seeks the selected teammate"],
          unsupported: [],
          source: "ai",
          model: "integration-test",
          createdAt: 1,
        },
      },
    });
    ctx = getMatchContext(store().save!, week1UserFixture.id)!;
    const semanticSide = week1UserFixture.homeClubId === clubId ? ctx.home : ctx.away;
    expect(semanticSide.teamDirectives).toEqual({ clearImmediately: true });
    expect(semanticSide.directives?.[starterId]).toMatchObject({
      preferredTargetId: targetId,
      targetPriority: 1,
      targetDelivery: "aerial",
    });

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

  it("plays a full 42-week season through to rollover", async () => {
    const league = LEAGUES_DATA.find((l) => l.nation === "Bretherland" && l.tier === 1)!;
    const leagueId = slugify(league.name);
    const champId = slugify(
      LEAGUES_DATA.find((l) => l.nation === "Bretherland" && l.tier === 2)!.name,
    );
    const clubId = slugify(league.clubs[0]);

    await useGameStore.getState().newCareer({
      managerName: "Season Tester",
      managerNationality: "Bretherland",
      difficulty: Difficulty.Amateur,
      leagueId,
      clubId,
    });

    const store = () => useGameStore.getState();

    // capture pre-rollover state
    const youthBase = Object.keys(store().save!.world.players).length;
    const bretherlandUnion = new Set([
      ...store().save!.world.leagues[leagueId].clubIds,
      ...store().save!.world.leagues[champId].clubIds,
    ]);
    expect(bretherlandUnion.size).toBe(40);
    const samplePlayerId = store().save!.world.clubs[clubId].playerIds[0];
    const sampleAgeBefore = store().save!.world.players[samplePlayerId].age;

    const buildResult = (fixtureId: string): MatchResult => {
      const s = store().save!;
      const fixture = s.world.fixtures[fixtureId];
      const ratings: Record<string, number> = {};
      for (const pid of s.world.clubs[s.userClubId].playerIds) ratings[pid] = 7;
      return {
        fixtureId,
        homeClubId: fixture.homeClubId,
        awayClubId: fixture.awayClubId,
        homeGoals: 1,
        awayGoals: 1,
        stats: emptyStats(),
        ratings,
        events: [],
      };
    };

    let guard = 0;
    let seasonEnd = false;
    let r = store().advanceWeek();
    while (guard++ < 400) {
      if (r.type === "match") r = store().recordUserMatch(buildResult(r.fixtureId));
      else if (r.type === "seasonEnd") {
        seasonEnd = true;
        break;
      } else r = store().advanceWeek();
    }
    expect(seasonEnd, `loop guard hit with week=${store().save!.season.currentWeek}`).toBe(true);
    expect(guard).toBeLessThan(400);

    const after = store().save!;
    expect(after.season.seasonYear).toBe(2027);
    expect(after.season.currentWeek).toBe(1);
    expect(after.season.transferWindowOpen).toBe(true);

    // new fixtures generated: 380 fresh league games, none played
    const newLeague = Object.values(after.world.fixtures).filter(
      (f) => f.competitionId === leagueId,
    );
    expect(newLeague).toHaveLength(380);
    expect(newLeague.every((f) => !f.played)).toBe(true);

    // fresh cup + continental
    expect(after.cup).toBeTruthy();
    expect(after.continental?.groups).toHaveLength(8);
    expect(after.continental?.koRound).toBe(1);
    expect(
      Object.values(after.world.fixtures).filter((f) => f.competitionId === "cup").length,
    ).toBe(4); // fresh cup R1: 8 unseeded clubs → 4 matches

    // promotion/relegation shuffled clubs between tiers but kept the nation at 40
    const unionAfter = new Set([
      ...after.world.leagues[leagueId].clubIds,
      ...after.world.leagues[champId].clubIds,
    ]);
    expect(unionAfter.size).toBe(40);
    expect(unionAfter).toEqual(bretherlandUnion);

    // youth intake: +2 per club
    expect(Object.keys(after.world.players).length).toBe(youthBase + 800);

    // aging + stat reset
    expect(after.world.players[samplePlayerId].age).toBe(sampleAgeBefore + 1);
    expect(after.world.players[samplePlayerId].seasonStats.appearances).toBe(0);
  }, 120_000);
});
