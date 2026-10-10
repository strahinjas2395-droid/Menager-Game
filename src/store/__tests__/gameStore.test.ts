import { describe, expect, it } from "vitest";
import { getMatchContext, useGameStore } from "@/store/gameStore";
import { buildInstructionRoster, instructionContextFingerprint } from "@/engine/directives";
import { defaultOpponentPlayerPlan } from "@/engine/matchPlan";
import { LEAGUES_DATA, slugify } from "@/database/leagueGenerator";
import { Difficulty, GameMode, type MatchResult, type MatchStats, type PlayerMatchAnalysis } from "@/types";

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
    carriesHome: 42,
    throwInsHome: 18,
    crossesHome: 12,
    throughBallsHome: 2,
    dribblesAttemptedHome: 14,
    dribblesCompletedHome: 7,
    knockOnsHome: 4,
    possessionAway: 50,
    shotsAway: 5,
    shotsOnTargetAway: 2,
    passesAttemptedAway: 200,
    passesCompletedAway: 170,
    tacklesAway: 15,
    foulsAway: 10,
    cornersAway: 4,
    carriesAway: 42,
    throwInsAway: 18,
    crossesAway: 12,
    throughBallsAway: 2,
    dribblesAttemptedAway: 14,
    dribblesCompletedAway: 7,
    knockOnsAway: 4,
  };
}

function detailedPlayer(playerId: string, clubId: string, side: "home" | "away", playerName: string): PlayerMatchAnalysis {
  return {
    playerId, clubId, side, playerName, shirtNumber: 9, position: "ST", started: true,
    minuteOn: 0, minuteOff: 90, minutesPlayed: 90, rating: 7.4,
    touches: 42, carries: 8, passesAttempted: 24, passesCompleted: 19, passesFailed: 5,
    keyPasses: 2, throughBalls: 1, crossesAttempted: 0, crossesCompleted: 0,
    shots: 3, shotsOnTarget: 2, goals: 0, assists: 1,
    dribblesAttempted: 4, dribblesCompleted: 2, possessionLost: 9,
    tacklesAttempted: 2, tacklesWon: 1, interceptions: 1, recoveries: 3,
    clearances: 0, blocks: 0, aerialDuels: 3, aerialDuelsWon: 2,
    foulsCommitted: 1, foulsWon: 2, offsides: 1, saves: 0,
    yellowCards: 0, redCards: 0, distanceCoveredKm: 10.4, sprints: 17,
    heatmap: Array(96).fill(1),
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
    expect(save!.gameMode).toBe(GameMode.Modern);
    expect(Object.values(save!.world.players).some((player) => player.modernPlayerIdentityId)).toBe(true);
    expect(Object.values(save!.world.players).some((player) => player.iconicPrimeProfileId)).toBe(false);
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
    const structuredRoles = {
      [starterId]: { role: "SweeperKeeper" as const, duty: "Support" as const },
    };
    const roster = buildInstructionRoster(
      fullSquad,
      instructedSide.starters,
      instructedSide.roles,
      instructedSide.displayNumbers,
      structuredRoles,
    );
    const contextFingerprint = instructionContextFingerprint(roster);
    const targetId = instructedSide.starters.find((player) => player.id !== starterId)!.id;
    const teamText = "evryone boot itt away rite now; our one shud fynd the other lad";
    await store().updateTactics({
      ...store().save!.tacticalSetup,
      playerRoles: {
        ...(store().save!.tacticalSetup.playerRoles ?? {}),
        ...structuredRoles,
      },
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
    expect(semanticSide.tactics.playerRoles?.[starterId]).toEqual({
      role: "SweeperKeeper",
      duty: "Support",
    });

    // Exact opponent plans are validated, keyed by fixture and compiled into
    // the user side without making the field mandatory for older saves.
    const oppositionSide = week1UserFixture.homeClubId === clubId ? ctx.away : ctx.home;
    const opponentTarget = oppositionSide.starters.find((player) => player.primaryPosition !== "GK")!;
    const exactMarker = semanticSide.starters.find((player) => player.primaryPosition !== "GK")!;
    const savedPlan = await store().updateOpponentPlan(week1UserFixture.id, {
      fixtureId: "spoofed-fixture",
      source: "ai",
      instructions: [{
        ...defaultOpponentPlayerPlan(opponentTarget),
        targetPlayerName: "spoofed target",
        markerPlayerId: exactMarker.id,
        markerPlayerName: "spoofed marker",
        tightMarking: true,
        pressing: "pressOnReceive",
        showOnto: "weakFoot",
        doubleTeam: true,
        preventCrosses: false,
        attackApproach: "pace",
      }],
    });
    expect(savedPlan).toMatchObject({ fixtureId: week1UserFixture.id, source: "user" });
    expect(savedPlan?.instructions[0]).toMatchObject({
      targetPlayerId: opponentTarget.id,
      targetPlayerName: `${opponentTarget.firstName} ${opponentTarget.lastName}`,
      markerPlayerId: exactMarker.id,
      markerPlayerName: `${exactMarker.firstName} ${exactMarker.lastName}`,
    });
    expect(store().save!.opponentPlans?.[week1UserFixture.id]).toEqual(savedPlan);
    ctx = getMatchContext(store().save!, week1UserFixture.id)!;
    expect((ctx.home.isUserTeam ? ctx.home : ctx.away).opponentPlan).toEqual(savedPlan);

    const currentPlans = store().save!.opponentPlans;
    delete store().save!.opponentPlans;
    expect(getMatchContext(store().save!, week1UserFixture.id)).toBeTruthy();
    expect((getMatchContext(store().save!, week1UserFixture.id)!.home.isUserTeam
      ? getMatchContext(store().save!, week1UserFixture.id)!.home
      : getMatchContext(store().save!, week1UserFixture.id)!.away).opponentPlan).toBeUndefined();
    store().save!.opponentPlans = currentPlans;

    const currentPlayerRoles = store().save!.tacticalSetup.playerRoles;
    delete store().save!.tacticalSetup.playerRoles;
    const legacyRoleContext = getMatchContext(store().save!, week1UserFixture.id)!;
    expect(legacyRoleContext.home.isUserTeam
      ? legacyRoleContext.home.tactics.playerRoles
      : legacyRoleContext.away.tactics.playerRoles).toBeUndefined();
    store().save!.tacticalSetup.playerRoles = currentPlayerRoles;

    const currentManagerMemories = store().save!.managerMemories;
    delete store().save!.managerMemories;
    expect(getMatchContext(store().save!, week1UserFixture.id)).toBeTruthy();
    store().save!.managerMemories = currentManagerMemories;

    // Manager-controlled training/rest persists by exact player identity.
    await store().updateTrainingPlan({ intensity: "High", teamFocus: "Possession" });
    await store().togglePlayerRest(starterId);
    await store().setIndividualTraining(starterId, "Physical");
    expect(store().save!.trainingPlan).toMatchObject({ intensity: "High", teamFocus: "Possession" });
    expect(store().save!.trainingPlan?.restPlayerIds).toContain(starterId);
    expect(store().save!.trainingPlan?.individualFocus[starterId]).toBe("Physical");

    const buildResult = (fixtureId: string): MatchResult => {
      const s = store().save!;
      const fixture = s.world.fixtures[fixtureId];
      const userSquad = s.world.clubs[s.userClubId].playerIds;
      const ratings: Record<string, number> = {};
      for (const pid of userSquad) ratings[pid] = 6.5 + ((pid.length % 10) / 10);
      const tracked = s.world.players[userSquad[0]];
      const playerReport = detailedPlayer(
        tracked.id,
        s.userClubId,
        fixture.homeClubId === s.userClubId ? "home" : "away",
        `${tracked.firstName} ${tracked.lastName}`,
      );
      return {
        fixtureId,
        homeClubId: fixture.homeClubId,
        awayClubId: fixture.awayClubId,
        homeGoals: 2,
        awayGoals: 1,
        stats: emptyStats(),
        ratings,
        analysis: {
          schemaVersion: 1,
          heatmapColumns: 12,
          heatmapRows: 8,
          generatedAtMinute: 90,
          initialHomeFormation: "4-3-3",
          initialAwayFormation: "4-3-3",
          finalHomeFormation: "4-3-3",
          finalAwayFormation: "4-3-3",
          players: { [tracked.id]: playerReport },
          tacticalChanges: [],
        },
        events: [],
      };
    };

    // Play like the UI does until we cross into week 8
    let guard = 0;
    let r = store().advanceWeek();
    if (r.type === "match") {
      const firstResult = buildResult(r.fixtureId);
      const injuredId = Object.keys(firstResult.analysis!.players)[0];
      firstResult.analysis!.injuries = [{
        playerId: injuredId,
        playerName: firstResult.analysis!.players[injuredId].playerName,
        clubId,
        side: week1UserFixture.homeClubId === clubId ? "home" : "away",
        minute: 63,
        name: "Hamstring strain",
        bodyArea: "hamstring",
        severity: "Moderate",
        recoveryWeeks: 8,
      }];
      r = store().recordUserMatch(firstResult);
      expect(store().save!.world.players[injuredId].injury).toMatchObject({
        source: "match", name: "Hamstring strain",
      });
      expect(store().save!.world.players[injuredId].injury!.weeksRemaining).toBeGreaterThan(0);
    }
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

    // Results carry permanent display metadata so they remain readable after
    // season fixture regeneration; legacy results without telemetry still load.
    expect(Object.keys(after.results).length).toBeGreaterThanOrEqual(7);
    for (const result of Object.values(after.results)) {
      expect(result.seasonYear).toBeGreaterThanOrEqual(2026);
      expect(result.week).toBeGreaterThan(0);
      expect(result.competitionLabel).toBeTruthy();
      expect(result.homeClubName).toBeTruthy();
      expect(result.awayClubName).toBeTruthy();
      expect(result.analysis?.players).toBeTruthy();
    }

    // Exact opposition managers retain structured memories across fixtures.
    expect(Object.keys(after.managerMemories ?? {}).length).toBeGreaterThan(0);
    const remembered = Object.values(after.managerMemories ?? {})[0];
    expect(remembered.meetings).toBeGreaterThan(0);
    expect(remembered.encounters[0]?.fixtureId).toBeTruthy();
    expect(Object.keys(remembered.playerKnowledge).length).toBeGreaterThan(0);

    // player season stats updated (user squad has appearances)
    const anyUserPlayer = after.world.clubs[clubId].playerIds
      .map((id) => after.world.players[id])
      .find((p) => p && p.seasonStats.appearances > 0);
    expect(anyUserPlayer).toBeTruthy();
    expect(anyUserPlayer!.seasonStats.assists).toBeGreaterThan(0);

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
    expect(after.gameMode).toBe(GameMode.Modern);
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

  it("persists an explicit Iconic Prime career and safely migrates a pre-mode save", async () => {
    const league = LEAGUES_DATA.find((candidate) => candidate.nation === "Bretherland" && candidate.tier === 1)!;
    const leagueId = slugify(league.name);
    const clubId = slugify(league.clubs[0]);

    await useGameStore.getState().newCareer({
      managerName: "Prime Manager",
      managerNationality: "Valdoria",
      difficulty: Difficulty.WorldClass,
      gameMode: GameMode.Iconic,
      leagueId,
      clubId,
    });

    const iconicSave = useGameStore.getState().save!;
    expect(iconicSave.gameMode).toBe(GameMode.Iconic);
    expect(Object.values(iconicSave.world.players).filter((player) => player.iconicPrimeProfileId)).toHaveLength(109);
    expect(Object.values(iconicSave.world.players).some((player) => player.modernPlayerIdentityId)).toBe(false);

    const legacySave = structuredClone(iconicSave);
    delete legacySave.gameMode;
    await useGameStore.getState().replaceSave(legacySave);
    expect(useGameStore.getState().save!.gameMode).toBe(GameMode.Iconic);
  }, 60_000);
});
