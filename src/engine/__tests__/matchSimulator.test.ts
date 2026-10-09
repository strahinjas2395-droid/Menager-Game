import { describe, expect, it } from "vitest";
import {
  MatchSimulator,
  buildTeamSide,
  selectBestXI,
  type TeamSide,
} from "@/engine/matchSimulator";
import { SeededRNG } from "@/database/rng";
import { generateSquad } from "@/database/playerGenerator";
import {
  DefensiveLine,
  MentalityLevel,
  PlayStyle,
  PressingIntensity,
  TempoSetting,
  TimeWasting,
  WidthSetting,
  type Player,
  type TacticalSetup,
} from "@/types";

function tactics(formation = "4-3-3"): TacticalSetup {
  return {
    formation,
    playStyle: PlayStyle.Balanced,
    tempo: TempoSetting.Normal,
    passingLength: TempoSetting.Normal,
    defensiveLine: DefensiveLine.Normal,
    pressing: PressingIntensity.Standard,
    width: WidthSetting.Normal,
    mentality: MentalityLevel.Balanced,
    timeWasting: TimeWasting.Late,
    offsideTrap: false,
    counterAttack: false,
    positionOverrides: {},
    setPieces: {
      cornerLeftId: null,
      cornerRightId: null,
      freeKickId: null,
      penaltyId: null,
      captainId: null,
    },
  };
}

function setup(seed = 100, awayFormation = "4-4-2") {
  const rng = new SeededRNG(seed);
  const homeSquad = generateSquad("red", 1, "Bretherland", rng, seed);
  const awaySquad = generateSquad("blue", 6, "Bretherland", rng, seed + 1);

  const home = buildTeamSide({
    clubId: "red",
    name: "Red FC",
    shortName: "RED",
    primaryColor: "#d33",
    secondaryColor: "#fff",
    isHome: true,
    squad: homeSquad,
    tactics: tactics("4-3-3"),
    isUserTeam: false,
  });
  const away = buildTeamSide({
    clubId: "blue",
    name: "Blue FC",
    shortName: "BLU",
    primaryColor: "#26f",
    secondaryColor: "#fff",
    isHome: false,
    squad: awaySquad,
    tactics: tactics(awayFormation),
    isUserTeam: false,
  });
  const sim = new MatchSimulator(home, away, { seed });
  return { sim, home, away, homeSquad, awaySquad };
}

function playFullMatch(sim: MatchSimulator) {
  sim.start();
  sim.skipToStop(); // -> halftime
  sim.resume(); // second half kickoff
  sim.skipToStop(); // -> fulltime
}

describe("selectBestXI", () => {
  it("picks exactly 11 starters incl. a GK, plus a bench", () => {
    const rng = new SeededRNG(5);
    const squad = generateSquad("x", 1, "Bretherland", rng, 5);
    const { starters, bench, roles, basePositions } = selectBestXI(squad, "4-3-3");
    expect(starters).toHaveLength(11);
    expect(bench.length).toBeGreaterThanOrEqual(4);
    expect(bench.length).toBeLessThanOrEqual(7);
    expect(starters.some((p) => p.primaryPosition === "GK")).toBe(true);
    expect(roles).toHaveLength(11);
    expect(basePositions).toHaveLength(11);
    for (const b of bench) expect(starters.includes(b)).toBe(false);
    // no duplicates
    expect(new Set(starters.map((p) => p.id)).size).toBe(11);
  });
});

describe("MatchSimulator", () => {
  it("simulates a full match with valid outputs", () => {
    const { sim } = setup(4242);
    sim.start();
    sim.skipToStop();
    expect(sim.getState().phase).toBe("halftime");
    expect(sim.hasNewState()).toBe(true);

    sim.resume();
    sim.skipToStop();

    const state = sim.getState();
    const stats = sim.getStats();
    const events = sim.getEvents();

    expect(state.phase).toBe("fulltime");
    expect(state.homeScore).toBeGreaterThanOrEqual(0);
    expect(state.awayScore).toBeGreaterThanOrEqual(0);
    expect(state.homeScore).toBeLessThan(30);
    expect(state.gameTime).toBeGreaterThanOrEqual(2700);

    expect(stats.possessionHome + stats.possessionAway).toBe(100);
    expect(stats.shotsHome + stats.shotsAway).toBeGreaterThan(0);
    expect(stats.passesAttemptedHome).toBeGreaterThan(0);

    expect(events.some((e) => e.type === "KickOff")).toBe(true);
    expect(events.some((e) => e.type === "HalfTime")).toBe(true);
    expect(events.some((e) => e.type === "FullTime")).toBe(true);

    expect(state.homeLineup).toHaveLength(11);
    expect(state.awayLineup).toHaveLength(11);

    const ratings = Object.values(state.ratings);
    expect(ratings).toHaveLength(22);
    for (const r of ratings) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(10);
    }

    for (const pos of state.homePositions) {
      expect(pos.x).toBeGreaterThanOrEqual(-5);
      expect(pos.x).toBeLessThanOrEqual(1005);
      expect(pos.y).toBeGreaterThanOrEqual(-5);
      expect(pos.y).toBeLessThanOrEqual(655);
    }
  });

  it("produces goals across a handful of seeds", () => {
    let goalsMatches = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const { sim } = setup(seed);
      playFullMatch(sim);
      const s = sim.getState();
      if (s.homeScore + s.awayScore > 0) goalsMatches++;
      expect(s.homeScore).toBeGreaterThanOrEqual(0);
      expect(s.awayScore).toBeGreaterThanOrEqual(0);
    }
    expect(goalsMatches).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic for the same seed", () => {
    const a = setup(777);
    playFullMatch(a.sim);
    const b = setup(777);
    playFullMatch(b.sim);

    const sa = a.sim.getState();
    const sb = b.sim.getState();
    expect(sa.homeScore).toBe(sb.homeScore);
    expect(sa.awayScore).toBe(sb.awayScore);
    expect(a.sim.getEvents().map((e) => `${e.minute}-${e.type}`)).toEqual(
      b.sim.getEvents().map((e) => `${e.minute}-${e.type}`),
    );
  });

  it("different seeds diverge (rng actually matters)", () => {
    const results = new Set<string>();
    for (const seed of [11, 22, 33, 44]) {
      const { sim } = setup(seed);
      playFullMatch(sim);
      const s = sim.getState();
      results.add(`${s.homeScore}-${s.awayScore}`);
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it("mirror: away side defends the far goal (x=1000), home defends x=0", () => {
    const { home, away } = setup(9);
    const homeGkX = Math.min(...home.basePositions.map((p) => p.x));
    const awayGkX = Math.max(...away.basePositions.map((p) => p.x));
    expect(homeGkX).toBeLessThan(100); // home GK near own goal at x=0
    expect(awayGkX).toBeGreaterThan(900); // away GK near own goal at x=1000
    const avg = (s: TeamSide) =>
      s.basePositions.reduce((sum, p) => sum + p.x, 0) / s.basePositions.length;
    expect(avg(away)).toBeGreaterThan(avg(home)); // mirrored: away sits deeper toward 1000
  });

  it("substitute swaps a starter for a bench player", () => {
    const { sim } = setup(55);
    sim.start();
    sim.skipToStop();
    const before = sim.getState().homeLineup.map((l) => l.playerId);
    const ok = sim.substitute("home", 3, 0);
    expect(ok).toBe(true);
    const after = sim.getState().homeLineup.map((l) => l.playerId);
    expect(after).not.toEqual(before);
    expect(after).toHaveLength(11);
    // the subbed-in player came from the bench
    const benchIds = sim.home.bench.map((p: Player) => p.id);
    expect(after).toContain(benchIds[0]);
  });
});
