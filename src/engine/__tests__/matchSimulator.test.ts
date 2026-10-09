import { describe, expect, it } from "vitest";
import {
  MatchSimulator,
  assignTacticalNumbers,
  buildTeamSide,
  selectBestXI,
  shotDecisionProbability,
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

interface SimulatorTestPlayer {
  p: Player;
  x: number;
  y: number;
  tx: number;
  ty: number;
  role: string;
  sentOff: boolean;
}

interface SimulatorTestHarness {
  homePlayers: SimulatorTestPlayer[];
  awayPlayers: SimulatorTestPlayer[];
  ball: { x: number; y: number };
  decisionCd: number;
  giveBallTo: (side: "home" | "away", index: number) => void;
  awardGoal: (side: "home" | "away", scorer?: SimulatorTestPlayer | null) => void;
}

function simulatorHarness(sim: MatchSimulator): SimulatorTestHarness {
  return sim as unknown as SimulatorTestHarness;
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

  it("play styles produce materially different passing behaviour", () => {
    const tiki = setup(212);
    tiki.home.tactics.playStyle = PlayStyle.TikiTaka;
    playFullMatch(tiki.sim);

    const route = setup(212);
    route.home.tactics.playStyle = PlayStyle.RouteOne;
    playFullMatch(route.sim);

    const tikiStats = tiki.sim.getStats();
    const routeStats = route.sim.getStats();
    expect(tikiStats.passesAttemptedHome).toBeGreaterThan(routeStats.passesAttemptedHome * 1.5);
    expect(tikiStats.passesCompletedHome / tikiStats.passesAttemptedHome)
      .toBeGreaterThan(routeStats.passesCompletedHome / routeStats.passesAttemptedHome);
  });

  it("applies formation and instruction changes during a live match", () => {
    const { sim, home } = setup(313);
    sim.tick(0.5);
    const beforeTime = sim.getState().gameTime;
    const changed = { ...home.tactics, formation: "4-4-2", pressing: PressingIntensity.Extreme };
    sim.updateTactics("home", changed);
    sim.updateDirectives("home", {
      [home.starters[9].id]: { targetMan: true, holdPosition: true },
    }, { clearImmediately: true });
    expect(sim.home.tactics.formation).toBe("4-4-2");
    expect(sim.home.tactics.pressing).toBe(PressingIntensity.Extreme);
    expect(sim.home.teamDirectives).toEqual({ clearImmediately: true });
    expect(sim.home.roles.filter((r) => r === "ST")).toHaveLength(2);
    expect(sim.getState().gameTime).toBe(beforeTime); // tactical UI does not restart the match
  });


  it("uses stable, intuitive traditional numbers for formation roles", () => {
    const { home } = setup(515);
    const numbers = home.displayNumbers;
    expect(numbers).toHaveLength(11);
    expect(new Set(numbers).size).toBe(11);
    expect(numbers[home.roles.indexOf("GK")]).toBe(1);
    expect(numbers[home.roles.indexOf("RB")]).toBe(2);
    expect(numbers[home.roles.indexOf("LB")]).toBe(3);
    expect(numbers.filter((_, i) => home.roles[i] === "CB")).toEqual([4, 5]);
    expect(numbers[home.roles.indexOf("RW")]).toBe(7);
    expect(numbers[home.roles.indexOf("ST")]).toBe(9);
    expect(numbers[home.roles.indexOf("LW")]).toBe(11);
    expect(assignTacticalNumbers(["GK", "CB", "CB", "CAM", "ST"])).toEqual([1, 4, 5, 10, 9]);
  });

  it("shoot-more instruction raises sensible long shots but never halfway attempts", () => {
    const { home } = setup(616);
    const shooter = home.starters.find((p) => p.primaryPosition !== "GK")!;
    const normal = shotDecisionProbability(
      shooter, "CM", 30, MentalityLevel.Balanced, PlayStyle.Balanced, false,
    );
    const instructed = shotDecisionProbability(
      shooter, "CM", 30, MentalityLevel.Balanced, PlayStyle.Balanced, true,
    );
    const halfway = shotDecisionProbability(
      shooter, "CM", 48, MentalityLevel.UltraAttacking, PlayStyle.RouteOne, true,
    );
    expect(normal).toBeGreaterThan(0.04);
    expect(instructed).toBeGreaterThan(normal * 1.5);
    expect(halfway).toBeLessThanOrEqual(0.002);
  });

  it("publishes explicit airborne-ball state during lofted play", () => {
    const { sim, home, away } = setup(717);
    home.tactics.playStyle = PlayStyle.RouteOne;
    away.tactics.playStyle = PlayStyle.LongBallDirect;
    home.tactics.passingLength = TempoSetting.VeryFast;
    away.tactics.passingLength = TempoSetting.VeryFast;
    let sawAir = false;
    let sawGround = false;
    for (let i = 0; i < 4500 && sim.getState().phase !== "halftime"; i++) {
      sim.tick(0.1);
      const state = sim.getState();
      if (state.phase === "flight") {
        if (state.ball.airborne) sawAir = true;
        else sawGround = true;
      }
      if (sawAir && sawGround) break;
    }
    expect(sawAir).toBe(true);
    expect(sawGround).toBe(true);
  });


  it("takes some default shots from outside the box without an instruction", () => {
    let rangedAttempts = 0;
    for (const seed of [801, 802, 803]) {
      const { sim } = setup(seed);
      playFullMatch(sim);
      rangedAttempts += sim.getEvents().filter(
        (event) => event.type === "Chance" && event.text.includes("shoots from"),
      ).length;
    }
    expect(rangedAttempts).toBeGreaterThan(0);
  });

  it("turns a resolved recipient into deliberate aerial service during play", () => {
    let targetedService = 0;
    for (const seed of [901, 902, 903]) {
      const { sim, home } = setup(seed);
      const leftBack = home.starters[home.roles.indexOf("LB")];
      const striker = home.starters[home.roles.indexOf("ST")];
      expect(leftBack).toBeTruthy();
      expect(striker).toBeTruthy();
      home.directives = {
        [leftBack.id]: {
          directPassing: true,
          preferredTargetId: striker.id,
          preferredTargetName: `${striker.firstName} ${striker.lastName}`,
          targetPriority: 1,
          targetDelivery: "aerial",
        },
      };
      playFullMatch(sim);
      targetedService += sim.getEvents().filter(
        (event) => event.type === "Instruction" &&
          event.playerId === leftBack.id &&
          event.text.includes(`seeks ${striker.lastName}`) &&
          event.text.includes("aerial ball"),
      ).length;
    }
    expect(targetedService).toBeGreaterThanOrEqual(2);
  });

  it("makes a striker with a defensive duty occupy a genuinely deeper block", () => {
    const sampleStrikerX = (defensiveDuty: boolean) => {
      const { sim, home } = setup(944);
      const strikerIndex = home.roles.indexOf("ST");
      const striker = home.starters[strikerIndex];
      if (defensiveDuty) {
        home.directives = {
          [striker.id]: { defensiveDuty: true, holdPosition: true, forwardRuns: false },
        };
      }
      const samples: number[] = [];
      for (let i = 0; i < 3600 && sim.getState().phase !== "halftime"; i++) {
        sim.tick(0.1);
        const state = sim.getState();
        if (state.phase === "open" && state.possession === "away") {
          samples.push(state.homePositions[strikerIndex].x);
        }
      }
      expect(samples.length).toBeGreaterThan(100);
      return samples.reduce((sum, x) => sum + x, 0) / samples.length;
    };

    const normalX = sampleStrikerX(false);
    const defensiveX = sampleStrikerX(true);
    expect(defensiveX).toBeLessThan(normalX - 120);
    expect(defensiveX).toBeLessThan(520);
  });

  it("executes a team-wide immediate-clearance plan only in defensive danger", () => {
    let clearances = 0;
    for (const seed of [951, 952]) {
      const { sim, home } = setup(seed);
      home.teamDirectives = { clearImmediately: true };
      playFullMatch(sim);
      const events = sim.getEvents().filter(
        (event) => event.type === "Instruction" && event.text.includes("clears the danger immediately"),
      );
      clearances += events.length;
      expect(events.every((event) => event.clubId === home.clubId)).toBe(true);
    }
    expect(clearances).toBeGreaterThanOrEqual(2);
  });

  it("removes current and reception delays for an instructed clearance in genuine danger", () => {
    const { sim, home } = setup(960);
    const internal = simulatorHarness(sim);
    const defenderIndex = Math.max(0, home.roles.findIndex((role) => role === "CB"));
    const defender = internal.homePlayers[defenderIndex];
    defender.x = 125;
    defender.y = 325;
    defender.tx = defender.x;
    defender.ty = defender.y;
    internal.awayPlayers.forEach((player, index) => {
      player.x = 720 + index * 8;
      player.y = 60 + index * 45;
    });

    internal.giveBallTo("home", defenderIndex);
    expect(internal.decisionCd).toBeGreaterThan(0);
    sim.updateDirectives("home", {}, { clearImmediately: true });
    expect(internal.decisionCd).toBe(0);
    internal.decisionCd = 1;
    internal.giveBallTo("home", defenderIndex);
    expect(internal.decisionCd).toBe(0);

    sim.tick(0.1);
    expect(sim.getState().phase).toBe("flight");
    expect(sim.getEvents().some(
      (event) => event.type === "Instruction" && event.text.includes("clears the danger immediately"),
    )).toBe(true);
  });

  it("keeps a pressured carrier moving when there is no space beyond the goal line", () => {
    const { sim, home } = setup(961);
    const internal = simulatorHarness(sim);
    const carrierIndex = Math.max(0, home.roles.findIndex((role) => role === "ST"));
    const carrier = internal.homePlayers[carrierIndex];
    carrier.x = 980;
    carrier.y = 325;
    carrier.tx = carrier.x;
    carrier.ty = carrier.y;
    internal.awayPlayers.forEach((player) => {
      player.x = 100;
      player.y = 90;
      player.tx = player.x;
      player.ty = player.y;
    });
    internal.awayPlayers.find((player) => player.role !== "GK")!.x = 935;
    internal.awayPlayers.find((player) => player.role !== "GK")!.y = 325;

    internal.giveBallTo("home", carrierIndex);
    internal.decisionCd = 5; // isolate protective movement from the next action
    const before = { x: carrier.x, y: carrier.y };
    sim.tick(0.1);
    const after = sim.getState().homePositions[carrierIndex];

    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(1);
    expect(after.x).toBeLessThan(before.x); // turns back into playable space
    expect(internal.decisionCd).toBeLessThan(0.25); // pressure cancels the stale wait
  });

  it("caps coordinated pressure instead of letting a team instruction swarm the carrier", () => {
    const { sim, home, away } = setup(962);
    const internal = simulatorHarness(sim);
    away.tactics.pressing = PressingIntensity.Extreme;
    sim.updateDirectives("away", {}, { pressHard: true });

    const carrierIndex = Math.max(0, home.roles.findIndex((role) => role !== "GK"));
    const carrier = internal.homePlayers[carrierIndex];
    carrier.x = 250;
    carrier.y = 250;
    carrier.tx = carrier.x;
    carrier.ty = carrier.y;
    const outfield = internal.awayPlayers.filter((player) => player.role !== "GK");
    outfield.forEach((player, index) => {
      const angle = (index / outfield.length) * Math.PI * 2;
      player.x = 250 + Math.cos(angle) * 120;
      player.y = 250 + Math.sin(angle) * 120;
      player.tx = player.x;
      player.ty = player.y;
    });

    internal.giveBallTo("home", carrierIndex);
    internal.decisionCd = 5;
    sim.tick(0.1);
    const directlyConverging = outfield.filter(
      (player) => Math.hypot(player.tx - internal.ball.x, player.ty - internal.ball.y) < 100,
    );

    expect(directlyConverging.length).toBeLessThanOrEqual(3);
  });

  it("leaves the scored ball behind the line and animates the scoring team before kickoff", () => {
    const { sim, home } = setup(963);
    const internal = simulatorHarness(sim);
    const scorerIndex = Math.max(0, home.roles.findIndex((role) => role === "ST"));
    const scorer = internal.homePlayers[scorerIndex];
    scorer.x = 940;
    scorer.y = 120;
    scorer.tx = scorer.x;
    scorer.ty = scorer.y;
    internal.ball = { x: 994, y: 310 };

    internal.awardGoal("home", scorer);
    const scored = sim.getState();
    expect(scored.phase).toBe("celebration");
    expect(scored.ball.x).toBeGreaterThan(1000);
    expect(scored.homePositions[scorerIndex].x).toBe(940); // no instant formation reset
    expect(sim.getEvents().at(-1)?.type).toBe("Goal");

    sim.tick(0.2);
    const celebrating = sim.getState();
    expect(celebrating.homePositions[scorerIndex]).not.toEqual(scored.homePositions[scorerIndex]);
    expect(celebrating.ball.x).toBeGreaterThan(1000);
  });

});
