import { describe, expect, it } from "vitest";
import { SeededRNG } from "@/database/rng";
import { generateSquad } from "@/database/playerGenerator";
import { CUP_ROUND_WEEKS, penaltyShootout } from "@/engine/cupEngine";
import {
  CONTINENTAL_ID,
  CONT_GROUP_WEEKS,
  generateGroupFixtures,
  selectQualifiedClubs,
} from "@/engine/continentalEngine";
import { applyQuickMatchPlayerStats, TOTAL_WEEKS, fixturesForWeek, transferWindowOpen } from "@/engine/seasonManager";
import {
  aiTransferActivity,
  askingPriceFor,
  completeTransfer,
  makeBid,
  negotiateContract,
  playerImportance,
} from "@/engine/transferEngine";
import type { Club, ContinentalGroup, League, Player, WorldDatabase } from "@/types";
import { CompetitionType } from "@/types";

function mkClub(id: string, leagueId: string, reputation: number, budget = 50_000_000): Club {
  return {
    id,
    name: `Club ${id}`,
    shortName: id.slice(0, 3).toUpperCase(),
    primaryColor: "#111",
    secondaryColor: "#222",
    stadiumName: "Stadium",
    stadiumCapacity: 30000,
    leagueId,
    budget,
    wageBudget: 1_000_000,
    reputation,
    fanBaseSize: 10000,
    playerIds: [],
    managerId: `mgr-${id}`,
    facilities: { training: 5, youth: 5, stadium: 5 },
    leaguePosition: 0,
  };
}

describe("penaltyShootout", () => {
  it("produces a winner (no draw) within a sane range", () => {
    const rng = new SeededRNG(21);
    const homeSquad = generateSquad("h", 1, "Bretherland", rng, 1);
    const awaySquad = generateSquad("a", 1, "Bretherland", rng, 2);
    for (let i = 0; i < 20; i++) {
      const res = penaltyShootout(homeSquad, awaySquad, rng);
      expect(res.home).not.toBe(res.away); // always a winner
      expect(res.home).toBeGreaterThanOrEqual(0);
      expect(res.away).toBeGreaterThanOrEqual(0);
      expect(res.home + res.away).toBeGreaterThanOrEqual(1);
      expect(res.home + res.away).toBeLessThanOrEqual(40);
    }
  });

  it("is deterministic per seed", () => {
    const s1 = generateSquad("h", 1, "Bretherland", new SeededRNG(1), 1);
    const s2 = generateSquad("a", 1, "Bretherland", new SeededRNG(1), 2);
    const a = penaltyShootout(s1, s2, new SeededRNG(50));
    const b = penaltyShootout(s1, s2, new SeededRNG(50));
    expect(a).toEqual(b);
  });
});

describe("continentalEngine", () => {
  it("selects 32 clubs: top 4 from each of the top-8 leagues", () => {
    const leagues: League[] = [];
    const clubs: Club[] = [];
    for (let l = 0; l < 20; l++) {
      const league: League = {
        id: `l${l}`,
        name: `League ${l}`,
        nation: "X",
        nationFlag: "🏴",
        tier: l < 15 ? 1 : 2,
        reputation: l < 8 ? 100 - l * 5 : 40,
        clubIds: [],
      };
      for (let c = 0; c < 8; c++) {
        const club = mkClub(`l${l}c${c}`, league.id, league.reputation - c);
        clubs.push(club);
        league.clubIds.push(club.id);
      }
      leagues.push(league);
    }
    const selected = selectQualifiedClubs(leagues, clubs);
    expect(selected).toHaveLength(32);
    expect(new Set(selected.map((c) => c.id)).size).toBe(32);
    // none from leagues outside the top 8 (rank >= 8)
    expect(selected.some((c) => c.leagueId === "l8" || c.leagueId === "l15")).toBe(false);
    // 4 per qualifying league
    for (const l of [0, 3, 7]) {
      expect(selected.filter((c) => c.leagueId === `l${l}`)).toHaveLength(4);
    }
  });

  it("generates a double round-robin inside a group of 4", () => {
    const groups: ContinentalGroup[] = [{ name: "A", clubIds: ["a", "b", "c", "d"] }];
    const fixtures = generateGroupFixtures(groups);
    expect(fixtures).toHaveLength(12);
    expect(fixtures.every((f) => f.competitionType === CompetitionType.Continental)).toBe(true);
    expect(fixtures.every((f) => f.competitionId === CONTINENTAL_ID)).toBe(true);
    expect(fixtures.every((f) => f.group === "A")).toBe(true);

    const weeks = [...new Set(fixtures.map((f) => f.week))].sort((a, b) => a - b);
    expect(weeks).toEqual([...CONT_GROUP_WEEKS]);

    // each pair meets exactly twice (home & away)
    const pairs = fixtures.map((f) => [f.homeClubId, f.awayClubId].sort().join("-"));
    expect(new Set(pairs).size).toBe(6);
    for (const pair of new Set(pairs)) {
      expect(pairs.filter((p) => p === pair)).toHaveLength(2);
    }
    // each club plays every matchday
    for (const club of ["a", "b", "c", "d"]) {
      for (const week of CONT_GROUP_WEEKS) {
        expect(
          fixtures.some(
            (f) => f.week === week && (f.homeClubId === club || f.awayClubId === club),
          ),
          `${club}@w${week}`,
        ).toBe(true);
      }
    }
  });
});

describe("seasonManager", () => {
  it("has 42 weeks with cup rounds at 7/14/21/28/35", () => {
    expect(TOTAL_WEEKS).toBe(42);
    expect(CUP_ROUND_WEEKS).toEqual({ 1: 7, 2: 14, 3: 21, 4: 28, 5: 35 });
  });

  it("opens transfer windows in weeks 1-4 and 19-22 only", () => {
    for (const w of [1, 2, 3, 4, 19, 20, 21, 22]) expect(transferWindowOpen(w)).toBe(true);
    for (const w of [0, 5, 10, 18, 23, 30, 42]) expect(transferWindowOpen(w)).toBe(false);
  });

  it("attributes background-match appearances, goals, assists and form to AI players", () => {
    const squad = generateSquad("form", 2, "Bretherland", new SeededRNG(880), 880);
    applyQuickMatchPlayerStats(squad, 3, 1, new SeededRNG(99));
    expect(squad.filter((player) => player.seasonStats.appearances === 1)).toHaveLength(11);
    expect(squad.reduce((sum, player) => sum + player.seasonStats.goals, 0)).toBe(3);
    expect(squad.reduce((sum, player) => sum + player.seasonStats.assists, 0)).toBeLessThanOrEqual(3);
    expect(squad.some((player) => player.seasonStats.lastRating >= 7)).toBe(true);
  });

  it("fixturesForWeek filters only that week", () => {
    const fixtures = [1, 5, 5, 9].map((week, i) => ({
      id: `f${i}`,
      competitionType: CompetitionType.League,
      competitionId: "l1",
      round: 1,
      week,
      homeClubId: "a",
      awayClubId: "b",
      played: false,
      homeGoals: 0,
      awayGoals: 0,
    }));
    expect(fixturesForWeek(fixtures, 5)).toHaveLength(2);
    expect(fixturesForWeek(fixtures, 1)).toHaveLength(1);
    expect(fixturesForWeek(fixtures, 7)).toHaveLength(0);
  });
});

describe("transferEngine", () => {
  function buildWorld() {
    const seller = mkClub("seller", "l0", 50, 10_000_000);
    const buyer = mkClub("buyer", "l1", 70, 20_000_000);
    const broke = mkClub("broke", "l2", 40, 1_000_000);
    seller.playerIds = ["p1"];
    const player = {
      id: "p1",
      firstName: "Test",
      lastName: "Player",
      nationality: "Bretherland",
      age: 25,
      reputation: 700,
      morale: 70,
      contract: {
        clubId: "seller",
        weeklyWage: 20_000,
        contractYearsRemaining: 2,
        transferValue: 10_000_000,
      },
    } as unknown as Player;
    const world: WorldDatabase = {
      players: { p1: player },
      clubs: { seller, buyer, broke },
      leagues: {},
      managers: {},
      fixtures: {},
    };
    return { world, player, seller, buyer, broke };
  }

  function buildProtectedTransferWorld() {
    const user = mkClub("user", "l0", 80, 1_000_000);
    const seller = mkClub("seller-ai", "l1", 55, 1_000_000);
    const buyer = mkClub("buyer-ai", "l2", 75, 100_000_000);

    const player = (
      id: string,
      clubId: string,
      reputation: number,
      transferValue = 1_000_000,
    ) => ({
      id,
      firstName: "Transfer",
      lastName: id,
      primaryPosition: "ST",
      reputation,
      morale: 70,
      contract: {
        clubId,
        weeklyWage: 10_000,
        contractYearsRemaining: 3,
        transferValue,
      },
    } as unknown as Player);

    // The user star deliberately outranks the AI-owned target. Without the
    // protected-club boundary this exact seed selects and sells the user star.
    const userStar = player("user-star", user.id, 100);
    const sellerStar = player("seller-star", seller.id, 90);
    const buyerSquad = Array.from({ length: 15 }, (_, index) =>
      player(`buyer-${index}`, buyer.id, 10, 500_000));

    user.playerIds = [userStar.id];
    seller.playerIds = [sellerStar.id];
    buyer.playerIds = buyerSquad.map((member) => member.id);
    const players = Object.fromEntries(
      [userStar, sellerStar, ...buyerSquad].map((member) => [member.id, member]),
    );
    const world: WorldDatabase = {
      players,
      clubs: { [user.id]: user, [seller.id]: seller, [buyer.id]: buyer },
      leagues: {},
      managers: {},
      fixtures: {},
    };
    return { world, user, userStar, seller, sellerStar, buyer };
  }

  it("asks a premium over value for a key player", () => {
    const { world, player } = buildWorld();
    expect(playerImportance(player, world)).toBe(1); // only player in squad
    // 10M * (1.05 + 1.0 * 0.55) = 16M
    expect(askingPriceFor(player, world)).toBe(16_000_000);
  });

  it("rejects lowball bids, counters mid bids, accepts at asking", () => {
    const { world, player } = buildWorld();

    const low = makeBid(player, 10_000_000, world, "buyer");
    expect(low.accepted).toBe(false);
    expect(low.counterAmount).toBeUndefined();

    const mid = makeBid(player, 14_000_000, world, "buyer"); // >= 85% of 16M
    expect(mid.accepted).toBe(false);
    expect(mid.counterAmount).toBe(16_000_000);

    const fair = makeBid(player, 16_000_000, world, "buyer");
    expect(fair.accepted).toBe(true);

    const over = makeBid(player, 17_000_000, world, "broke"); // 17M > 1M budget
    expect(over.accepted).toBe(false);
    expect(over.reason).toContain("budget");
  });

  it("contract demands scale with ambition and wage", () => {
    const { world, player } = buildWorld();
    // buyer rep 70 vs seller 50 → ambition ~0.33 → demand ≈ 20k * 1.51 = ~30.3k
    const happy = negotiateContract(player, 45_000, 3, world, "buyer");
    expect(happy.accepted).toBe(true);

    const close = negotiateContract(player, 28_000, 2, world, "buyer");
    expect(close.accepted).toBe(false);
    expect(close.wageDemand).toBeGreaterThan(27_000);
    expect(close.wageDemand).toBeLessThan(32_000);

    const insult = negotiateContract(player, 21_000, 2, world, "buyer");
    expect(insult.accepted).toBe(false);
  });

  it("completeTransfer moves the player and swaps budgets", () => {
    const { world, player, seller, buyer } = buildWorld();
    const res = completeTransfer(world, "p1", 16_000_000, 35_000, 3, "buyer");
    expect(res.ok).toBe(true);
    expect(player.contract.clubId).toBe("buyer");
    expect(player.contract.weeklyWage).toBe(35_000);
    expect(player.contract.contractYearsRemaining).toBe(3);
    expect(buyer.budget).toBe(4_000_000);
    expect(seller.budget).toBe(26_000_000);
    expect(buyer.playerIds).toContain("p1");
    expect(seller.playerIds).not.toContain("p1");
  });

  it("completeTransfer refuses bids over budget", () => {
    const { world } = buildWorld();
    const res = completeTransfer(world, "p1", 50_000_000, 35_000, 3, "broke");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("budget");
  });

  it("keeps the user club and its players outside background AI transfers", () => {
    const { world, user, userStar, seller, sellerStar, buyer } = buildProtectedTransferWorld();
    const userBefore = structuredClone(user);
    const userStarBefore = structuredClone(userStar);

    const completed = aiTransferActivity(world, {
      userClubId: user.id,
      rng: new SeededRNG(1),
      moves: 1,
    });

    expect(completed).toEqual([{
      playerId: sellerStar.id,
      from: seller.id,
      to: buyer.id,
      fee: 1_600_000,
    }]);
    expect(completed.every((move) => move.from !== user.id && move.to !== user.id)).toBe(true);
    expect(user).toEqual(userBefore);
    expect(userStar).toEqual(userStarBefore);
    expect(user.playerIds).toEqual([userStar.id]);
    expect(world.players[userStar.id].contract.clubId).toBe(user.id);
    expect(seller.playerIds).not.toContain(sellerStar.id);
    expect(buyer.playerIds).toContain(sellerStar.id);
  });

  it("never uses the user club as an AI buyer", () => {
    const { world, user, seller, buyer } = buildProtectedTransferWorld();
    const newUserSquad = [...buyer.playerIds];
    for (const playerId of newUserSquad) world.players[playerId].contract.clubId = user.id;
    user.playerIds = newUserSquad;
    user.budget = 100_000_000;
    buyer.playerIds = [];
    buyer.budget = 1_000_000;
    seller.budget = 1_000_000;
    const before = structuredClone(world);

    expect(aiTransferActivity(world, {
      userClubId: user.id,
      rng: new SeededRNG(1),
      moves: 1,
    })).toEqual([]);
    expect(world).toEqual(before);
  });

  it("fails closed without a valid protected user club", () => {
    const { world } = buildProtectedTransferWorld();
    const before = structuredClone(world);

    expect(aiTransferActivity(world, {
      userClubId: "missing-user-club",
      rng: new SeededRNG(1),
      moves: 10,
    })).toEqual([]);
    expect(world).toEqual(before);
  });

  it("keeps protected AI transfer activity deterministic", () => {
    const first = buildProtectedTransferWorld().world;
    const second = buildProtectedTransferWorld().world;

    const firstMoves = aiTransferActivity(first, {
      userClubId: "user",
      rng: new SeededRNG(77),
      moves: 8,
    });
    const secondMoves = aiTransferActivity(second, {
      userClubId: "user",
      rng: new SeededRNG(77),
      moves: 8,
    });

    expect(firstMoves).toEqual(secondMoves);
    expect(first).toEqual(second);
  });
});
