import { describe, expect, it } from "vitest";
import {
  calculateStandings,
  generateFixtureList,
  playerStrength,
  poisson,
  simulateQuickMatch,
  teamStrength,
} from "@/engine/leagueEngine";
import { SeededRNG } from "@/database/rng";
import { generateSquad } from "@/database/playerGenerator";
import { CompetitionType, type Club, type Fixture } from "@/types";

function makeClubs(n: number): Club[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `Club ${i}`,
    shortName: `C${i}`,
    primaryColor: "#111",
    secondaryColor: "#222",
    stadiumName: "S",
    stadiumCapacity: 20000,
    leagueId: "l1",
    budget: 10_000_000,
    wageBudget: 1_000_000,
    reputation: 50,
    fanBaseSize: 10000,
    playerIds: [],
    managerId: "m",
    facilities: { training: 5, youth: 5, stadium: 5 },
    leaguePosition: 0,
  }));
}

describe("leagueEngine", () => {
  it("generates a full double round-robin (380 fixtures, 38 rounds)", () => {
    const clubs = makeClubs(20);
    const fixtures = generateFixtureList(clubs, "l1", (r) => r);
    expect(fixtures).toHaveLength(380);

    const rounds = new Set(fixtures.map((f) => f.round));
    expect(rounds.size).toBe(38);

    // every club plays 38 games, 19 home + 19 away
    for (const c of clubs) {
      const home = fixtures.filter((f) => f.homeClubId === c.id);
      const away = fixtures.filter((f) => f.awayClubId === c.id);
      expect(home).toHaveLength(19);
      expect(away).toHaveLength(19);
    }

    // no fixture against itself, unique ids
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(380);
    expect(fixtures.every((f) => f.homeClubId !== f.awayClubId)).toBe(true);
  });

  it("calculates standings sorted by points then goal difference", () => {
    const clubs = makeClubs(4);
    const fixtures: Fixture[] = [
      { id: "f1", competitionType: CompetitionType.League, competitionId: "l1", round: 1, week: 1, homeClubId: "c0", awayClubId: "c1", played: true, homeGoals: 3, awayGoals: 1 },
      { id: "f2", competitionType: CompetitionType.League, competitionId: "l1", round: 1, week: 1, homeClubId: "c2", awayClubId: "c3", played: true, homeGoals: 0, awayGoals: 0 },
      { id: "f3", competitionType: CompetitionType.League, competitionId: "l1", round: 2, week: 2, homeClubId: "c1", awayClubId: "c0", played: true, homeGoals: 2, awayGoals: 2 },
    ];
    const table = calculateStandings(fixtures, "l1", clubs.map((c) => c.id));
    // c0: W 3-1 + D 2-2 => 4pts (+2 GD); c1: L + D => 1pt (-2 GD);
    // c2 & c3: D => 1pt (0 GD) rank above c1 on goal difference
    expect(table[0].clubId).toBe("c0");
    expect(table[0].points).toBe(4);
    expect(table.map((r) => r.points)).toEqual([4, 1, 1, 1]);
    expect(table[3].clubId).toBe("c1");
    expect(table[3].goalDifference).toBe(-2);
    expect(table[1].goalDifference).toBe(0);
    expect(table[1].played).toBe(1);
    expect(table[0].played).toBe(2);
  });

  it("produces plausible quick-sim scorelines", () => {
    const rng = new SeededRNG(7);
    const home = generateSquad("h", 1, "Bretherland", rng, 100);
    const away = generateSquad("a", 4, "Valdoria", rng, 200);
    expect(teamStrength(home)).toBeGreaterThan(5);
    expect(playerStrength(home[0])).toBeGreaterThan(1);

    let wins = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const r = simulateQuickMatch(home, away, rng);
      expect(r.homeGoals).toBeGreaterThanOrEqual(0);
      expect(r.homeGoals).toBeLessThanOrEqual(12);
      if (r.homeGoals > r.awayGoals) wins++;
    }
    // stronger home side with home advantage should win a majority
    expect(wins / N).toBeGreaterThan(0.45);
    expect(wins / N).toBeLessThan(0.95);
  });

  it("samples a poisson distribution with sane mean", () => {
    const rng = new SeededRNG(3);
    let sum = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) sum += poisson(1.5, rng);
    const mean = sum / N;
    expect(mean).toBeGreaterThan(1.2);
    expect(mean).toBeLessThan(1.8);
  });
});
