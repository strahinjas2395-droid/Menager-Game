import { describe, expect, it } from "vitest";
import {
  MatchSimulator,
  assignTacticalNumbers,
  buildTeamSide,
  getAICoachProfile,
  selectBestXI,
  shotDecisionProbability,
  type TeamSide,
} from "@/engine/matchSimulator";
import { SeededRNG } from "@/database/rng";
import { generateSquad } from "@/database/playerGenerator";
import {
  DefensiveLine,
  Difficulty,
  MatchEventType,
  MentalityLevel,
  PlayStyle,
  PlaystyleTag,
  PressingIntensity,
  TempoSetting,
  TimeWasting,
  WidthSetting,
  type Player,
  type PlayerRoleAssignment,
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
  vx: number;
  vy: number;
  nextTouchAt: number;
  brainTx: number;
  brainTy: number;
  brainNextAt: number;
  role: string;
  roleAssignment: PlayerRoleAssignment;
  intent: string;
  runUntil: number;
  sentOff: boolean;
}

interface SimulatorTestHarness {
  homePlayers: SimulatorTestPlayer[];
  awayPlayers: SimulatorTestPlayer[];
  ball: { x: number; y: number };
  decisionCd: number;
  carrier: { side: "home" | "away"; i: number } | null;
  setPiece: { kind: string; side: "home" | "away"; takerIdx: number; timer: number } | null;
  penaltyState: { side: "home" | "away"; takerIdx: number; timer: number } | null;
  giveBallTo: (side: "home" | "away", index: number) => void;
  movePlayer: (player: SimulatorTestPlayer, dt: number, intensity: number) => void;
  startSetPiece: (kind: "corner" | "throw" | "freeKick" | "goalKick", side: "home" | "away", x: number, y: number) => void;
  startPenalty: (side: "home" | "away") => void;
  executeKnockOn: (side: "home" | "away", player: SimulatorTestPlayer, attempted: boolean, defenderId?: string) => void;
  receivePass: (side: "home" | "away", receiverIndex: number, flight: {
    fromX: number; fromY: number; toX: number; toY: number; dur: number; countsAsPass?: boolean;
  }) => void;
  tryMidflightInterception: (flight: {
    kind: "pass"; side: "home" | "away"; fromX: number; fromY: number;
    toX: number; toY: number; dur: number; t: number; challengedIds: string[];
  }, progress: number) => boolean;
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
  it("reaches half time after eight minutes of unaccelerated real time", () => {
    const { sim } = setup(4241);
    for (let tick = 0; tick < 4799; tick++) sim.tick(0.1);
    expect(sim.getState().phase).not.toBe("halftime");
    expect(sim.getState().gameTime).toBeCloseTo(2699.4375, 3);
    sim.tick(0.1);
    expect(sim.getState().phase).toBe("halftime");
    expect(sim.getState().gameTime).toBe(2700);
  });

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

  it("retains deterministic action ledgers and heatmaps for every player who appeared", () => {
    const { sim } = setup(4242);
    playFullMatch(sim);
    const state = sim.getState();
    const analysis = state.analysis;
    expect(analysis).toBeDefined();
    expect(analysis?.schemaVersion).toBe(2);
    expect(analysis?.injuries).toBeDefined();
    expect(Object.keys(analysis?.players ?? {}).length).toBeGreaterThanOrEqual(22);
    expect(analysis?.tacticalEvents?.length).toBeGreaterThan(40);
    expect(analysis?.tacticalEvents?.some((event) => event.type === "pass" || event.type === "throughBall")).toBe(true);
    expect(analysis?.tacticalEvents?.some((event) => event.type === "shot" && (event.expectedGoals ?? 0) > 0)).toBe(true);
    const movementEvents = analysis?.tacticalEvents?.filter((event) =>
      (event.type === "carry" || event.type === "dribble") && event.qualifier?.startsWith("movement:"),
    ) ?? [];
    expect(movementEvents.length).toBeGreaterThan(0);
    expect(new Set(movementEvents.map((event) => event.qualifier?.split(";")[0])).size).toBeGreaterThan(1);
    expect(movementEvents.some((event) =>
      event.endY !== undefined && Math.abs(event.endY - event.y) > 15,
    )).toBe(true);
    expect(analysis?.teamSummaries?.home.possessionSequences).toBeGreaterThan(0);
    expect(analysis?.passNetworks?.home.length).toBeGreaterThan(0);

    const players = Object.values(analysis?.players ?? {});
    const homePlayers = players.filter((player) => player.side === "home");
    const awayPlayers = players.filter((player) => player.side === "away");
    expect(homePlayers.reduce((sum, player) => sum + player.passesAttempted, 0)).toBe(state.stats.passesAttemptedHome);
    expect(awayPlayers.reduce((sum, player) => sum + player.passesCompleted, 0)).toBe(state.stats.passesCompletedAway);
    expect(players.reduce((sum, player) => sum + player.goals, 0)).toBe(state.homeScore + state.awayScore);
    expect(players.some((player) => player.touches > 0)).toBe(true);
    expect(players.some((player) => player.distanceCoveredKm > 0)).toBe(true);
    expect(analysis?.tacticalChanges.some((change) => change.source === "ai")).toBe(true);
    expect(analysis?.tacticalChanges.some((change) =>
      change.changes.some((detail) => /Mentality|Pressing|Tempo|Formation/.test(detail)),
    )).toBe(true);
    for (const player of players) {
      expect(player.heatmap).toHaveLength(96);
      expect(player.minutesPlayed).toBeGreaterThan(0);
      expect(player.conditionBefore).toBeGreaterThan(0);
      expect(player.conditionAfter).toBeLessThanOrEqual(player.conditionBefore ?? 100);
      expect(player.passesFailed).toBe(Math.max(0, player.passesAttempted - player.passesCompleted));
    }

    const replay = setup(4242).sim;
    playFullMatch(replay);
    expect(replay.getAnalysis()).toEqual(sim.getAnalysis());
  });

  it("resolves reproducible in-match injuries without counting them as red cards", () => {
    const { sim } = setup(7);
    playFullMatch(sim);
    const state = sim.getState();
    const injury = state.analysis?.injuries?.[0];
    expect(injury).toMatchObject({
      playerName: "Kyle Hughes",
      side: "away",
      name: "Ankle sprain",
      severity: "Minor",
      recoveryWeeks: 2,
    });
    expect(state.events.some((event) => event.type === MatchEventType.Injury && event.playerId === injury?.playerId)).toBe(true);
    expect(state.analysis?.players[injury!.playerId].redCards).toBe(0);
  });

  it("scales opposition observation and decisions across the expanded difficulty ladder", () => {
    const beginner = getAICoachProfile(Difficulty.Beginner);
    const professional = getAICoachProfile(Difficulty.Professional);
    const ultimate = getAICoachProfile(Difficulty.Ultimate);
    expect(beginner.firstReviewMinute).toBeGreaterThan(professional.firstReviewMinute);
    expect(professional.firstReviewMinute).toBeGreaterThan(ultimate.firstReviewMinute);
    expect(ultimate.reviewIntervalMinutes).toBeLessThan(beginner.reviewIntervalMinutes);
    expect(ultimate.decisionQuality).toBeGreaterThan(professional.decisionQuality);
    expect(ultimate.usesMatchTrends).toBe(true);
    expect(beginner.usesMatchTrends).toBe(false);
  });

  it("accelerates, brakes and turns players according to physical attributes", () => {
    const { sim } = setup(6001);
    const internal = simulatorHarness(sim);
    internal.carrier = null;
    const slow = internal.homePlayers[1];
    const fast = internal.homePlayers[2];
    Object.assign(slow.p, { pace: 5, acceleration: 5, agility: 7 });
    Object.assign(fast.p, { pace: 19, acceleration: 19, agility: 17 });
    for (const player of [slow, fast]) {
      player.x = 250;
      player.y = 300;
      player.tx = 800;
      player.ty = 300;
      player.vx = 0;
      player.vy = 0;
    }

    internal.movePlayer(slow, 0.05, 1);
    internal.movePlayer(fast, 0.05, 1);
    expect(Math.hypot(fast.vx, fast.vy)).toBeGreaterThan(Math.hypot(slow.vx, slow.vy));
    // Nobody reaches top speed from rest in the first 50ms.
    expect(Math.hypot(fast.vx, fast.vy) / 10).toBeLessThan(1);

    for (let i = 0; i < 19; i++) {
      internal.movePlayer(slow, 0.05, 1);
      internal.movePlayer(fast, 0.05, 1);
    }
    expect(fast.x).toBeGreaterThan(slow.x + 10);

    const beforeTurn = fast.x;
    fast.tx = 100;
    internal.movePlayer(fast, 0.05, 1);
    // Momentum has to be braked before the player can reverse direction.
    expect(fast.x).toBeGreaterThan(beforeTurn);
  });

  it("turns explicit role and duty choices into measurably different physical movement", () => {
    const runFullBack = (assignment: PlayerRoleAssignment) => {
      const built = setup(6011);
      built.home.isUserTeam = true;
      const fullBackIndex = Math.max(0, built.home.roles.findIndex((role) => role === "RB" || role === "LB"));
      const playerId = built.home.starters[fullBackIndex].id;
      built.home.tactics.playerRoles = { [playerId]: assignment };
      const sim = new MatchSimulator(built.home, built.away, { seed: 6011 });
      const internal = simulatorHarness(sim);
      const carrierIndex = Math.max(0, built.home.roles.findIndex((role) => role === "CM" || role === "CDM"));
      internal.awayPlayers.forEach((player, index) => {
        player.x = 820;
        player.y = 40 + index * 52;
      });
      sim.phase = "open";
      internal.giveBallTo("home", carrierIndex);
      internal.decisionCd = 5;
      sim.tick(0.1);
      return {
        targetX: internal.homePlayers[fullBackIndex].tx,
        targetY: internal.homePlayers[fullBackIndex].ty,
        lineup: sim.getState().homeLineup[fullBackIndex],
      };
    };

    const defender = runFullBack({ role: "FullBack", duty: "Defend" });
    const attacker = runFullBack({ role: "WingBack", duty: "Attack" });
    expect(attacker.targetX).toBeGreaterThan(defender.targetX + 70);
    expect(Math.abs(attacker.targetY - 325)).toBeGreaterThan(Math.abs(defender.targetY - 325));
    expect(defender.lineup).toMatchObject({ tacticalRole: "FullBack", duty: "Defend" });
    expect(attacker.lineup).toMatchObject({ tacticalRole: "WingBack", duty: "Attack" });
  });

  it("applies live role changes immediately and retains the job in analysis", () => {
    const built = setup(6012);
    built.home.isUserTeam = true;
    const midfielderIndex = Math.max(0, built.home.roles.findIndex((role) => role === "CM"));
    const midfielder = built.home.starters[midfielderIndex];
    const sim = new MatchSimulator(built.home, built.away, { seed: 6012 });
    sim.updateTactics("home", {
      ...built.home.tactics,
      playerRoles: {
        ...(built.home.tactics.playerRoles ?? {}),
        [midfielder.id]: { role: "Mezzala", duty: "Attack" },
      },
    });

    expect(sim.getState().homeLineup[midfielderIndex]).toMatchObject({
      playerId: midfielder.id,
      tacticalRole: "Mezzala",
      duty: "Attack",
    });
    expect(sim.getAnalysis().players[midfielder.id]).toMatchObject({
      tacticalRole: "Mezzala",
      duty: "Attack",
    });
    expect(sim.getAnalysis().tacticalChanges.at(-1)?.changes.some((change) => change.includes("Mezzala"))).toBe(true);
  });

  it("gives a substitute their validated configured role in the inherited formation position", () => {
    const built = setup(6013);
    built.home.isUserTeam = true;
    const strikerIndex = Math.max(0, built.home.roles.findIndex((role) => role === "ST"));
    const substitute = built.home.bench[0];
    built.home.tactics.playerRoles = {
      [substitute.id]: { role: "TargetForward", duty: "Support" },
    };
    const sim = new MatchSimulator(built.home, built.away, { seed: 6013 });
    expect(sim.substitute("home", strikerIndex, 0)).toBe(true);
    expect(sim.getState().homeLineup[strikerIndex]).toMatchObject({
      playerId: substitute.id,
      position: "ST",
      tacticalRole: "TargetForward",
      duty: "Support",
    });
  });

  it("renders controlled possession as repeated touches with ball-player separation", () => {
    const { sim, home } = setup(6002);
    const internal = simulatorHarness(sim);
    const carrierIndex = home.roles.findIndex((role) => role !== "GK");
    const carrier = internal.homePlayers[carrierIndex];
    carrier.x = 480;
    carrier.y = 325;
    carrier.vx = 0;
    carrier.vy = 0;
    internal.awayPlayers.forEach((player) => {
      player.x = 850;
      player.y = 80;
    });
    sim.phase = "open";
    internal.giveBallTo("home", carrierIndex);
    internal.decisionCd = 5;

    let maxSeparation = 0;
    for (let i = 0; i < 8; i++) {
      sim.tick(0.12);
      const state = sim.getState();
      const player = state.homePositions[carrierIndex];
      maxSeparation = Math.max(maxSeparation, Math.hypot(state.ball.x - player.x, state.ball.y - player.y));
      expect(state.ball.mode).toBe("controlled");
      expect(Math.hypot(state.ball.x - player.x, state.ball.y - player.y)).toBeLessThan(32);
    }
    expect(maxSeparation).toBeGreaterThan(2.5);
  });

  it("turns a poor first touch on a hard pass into a recoverable loose ball", () => {
    const { sim, home } = setup(6005);
    const internal = simulatorHarness(sim);
    const receiverIndex = Math.max(0, home.roles.findIndex((role) => role !== "GK"));
    const receiver = internal.homePlayers[receiverIndex];
    Object.assign(receiver.p, { ballControl: 1, technique: 1, composure: 1 });
    receiver.x = 520;
    receiver.y = 325;
    internal.awayPlayers[1].x = 535;
    internal.awayPlayers[1].y = 325;
    const hardPass = {
      fromX: 120,
      fromY: 325,
      toX: 520,
      toY: 325,
      dur: 0.22,
      countsAsPass: true,
    };

    let failed = false;
    for (let attempt = 0; attempt < 10 && !failed; attempt++) {
      internal.carrier = null;
      internal.ball.x = hardPass.toX;
      internal.ball.y = hardPass.toY;
      internal.receivePass("home", receiverIndex, hardPass);
      failed = internal.carrier === null;
    }
    expect(failed).toBe(true);
    const escaped = Math.hypot(internal.ball.x - receiver.x, internal.ball.y - receiver.y);
    expect(escaped).toBeGreaterThan(10);
    expect(escaped).toBeLessThan(48);
    expect(sim.getState().ball.mode).toBe("loose");
  });

  it("allows a defender to intercept only when a ground-pass lane physically reaches them", () => {
    const { sim } = setup(6006);
    const internal = simulatorHarness(sim);
    internal.awayPlayers.forEach((player, index) => {
      player.x = 800;
      player.y = 50 + index * 50;
    });
    const interceptor = internal.awayPlayers.find((p) => p.role !== "GK")!;
    Object.assign(interceptor.p, {
      interceptions: 20,
      anticipation: 20,
      playstyles: [PlaystyleTag.Interceptor],
    });
    internal.ball.x = 500;
    internal.ball.y = 325;
    const pass = () => ({
      kind: "pass" as const,
      side: "home" as const,
      fromX: 0,
      fromY: 325,
      toX: 1000,
      toY: 325,
      dur: 8,
      t: 4,
      challengedIds: [],
    });

    expect(internal.tryMidflightInterception(pass(), 0.5)).toBe(false);
    interceptor.x = 500;
    interceptor.y = 325;
    let won = false;
    for (let attempt = 0; attempt < 6 && !won; attempt++) {
      internal.ball.x = 500;
      internal.ball.y = 325;
      won = internal.tryMidflightInterception(pass(), 0.5);
    }
    expect(won).toBe(true);
    expect(internal.carrier?.side).toBe("away");
  });

  it("spends most movement at walk/jog speed while retaining occasional sprints", () => {
    const { sim } = setup(6004);
    const samples: number[] = [];
    for (let tick = 0; tick < 1200; tick++) {
      sim.tick(0.1);
      if (tick > 100) {
        const state = sim.getState();
        samples.push(...state.homePositions.slice(1).map((p) => p.speed));
        samples.push(...state.awayPositions.slice(1).map((p) => p.speed));
      }
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length * 0.5)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(median).toBeGreaterThan(0.45);
    expect(median).toBeLessThan(2.5);
    expect(p95).toBeGreaterThan(3.5);
    expect(p95).toBeLessThan(7.5);
  });

  it("turns a pace-abuser's long touch into a visible ball race", () => {
    const { sim, home } = setup(6003);
    const internal = simulatorHarness(sim);
    const runnerIndex = Math.max(0, home.roles.findIndex((role) => ["ST", "RW", "LW"].includes(role)));
    const runner = internal.homePlayers[runnerIndex];
    Object.assign(runner.p, {
      pace: 19,
      acceleration: 19,
      dribbling: 17,
      playstyles: [PlaystyleTag.PaceAbuser],
    });
    runner.x = 500;
    runner.y = 325;
    runner.vx = 0;
    runner.vy = 0;
    internal.homePlayers.forEach((player, index) => {
      if (index !== runnerIndex) { player.x = 250; player.y = 100 + index * 30; }
    });
    internal.awayPlayers.forEach((player, index) => {
      player.x = 760;
      player.y = 60 + index * 45;
      Object.assign(player.p, { pace: 7, acceleration: 7 });
    });
    sim.phase = "open";
    internal.giveBallTo("home", runnerIndex);
    internal.executeKnockOn("home", runner, false);
    expect(sim.getState().phase).toBe("flight");
    expect(sim.getStats().knockOnsHome).toBe(1);

    sim.tick(0.15);
    const state = sim.getState();
    expect(state.ball.mode).toBe("flight");
    expect(state.ball.x).toBeGreaterThan(state.homePositions[runnerIndex].x + 5);
    expect(state.homePositions[runnerIndex].intent).toBe("runBehind");
  });

  it("turns a won dribble into a lateral body-and-ball route around the defender", () => {
    const { sim, home } = setup(6010);
    const internal = simulatorHarness(sim);
    const runnerIndex = Math.max(0, home.roles.findIndex((role) => role === "CM" || role === "CAM"));
    const runner = internal.homePlayers[runnerIndex];
    const defender = internal.awayPlayers.find((player) => player.role !== "GK")!;
    runner.role = "CAM";
    Object.assign(runner.p, {
      pace: 17,
      acceleration: 17,
      agility: 19,
      dribbling: 19,
      flair: 18,
      playstyles: [PlaystyleTag.Dribbler],
    });
    runner.x = 500;
    runner.y = 325;
    runner.vx = 42;
    runner.vy = 0;
    internal.awayPlayers.forEach((player, index) => {
      player.x = 790;
      player.y = 55 + index * 48;
    });
    defender.x = 532;
    defender.y = 325;
    sim.phase = "open";
    internal.giveBallTo("home", runnerIndex);
    internal.executeKnockOn("home", runner, true, defender.p.id);

    const event = sim.getAnalysis().tacticalEvents?.at(-1);
    expect(sim.getState().phase).toBe("flight");
    expect(event).toMatchObject({ type: "dribble", playerId: runner.p.id });
    expect(event?.qualifier).toMatch(/^movement:/);
    expect(Math.abs((event?.endY ?? event?.y ?? 325) - (event?.y ?? 325))).toBeGreaterThan(18);

    sim.tick(0.15);
    const state = sim.getState();
    expect(state.ball.mode).toBe("flight");
    expect(Math.abs(state.ball.y - 325)).toBeGreaterThan(3);
    expect(state.homePositions[runnerIndex].intent).toBe("runBehind");
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
    expect(goalsMatches).toBeGreaterThanOrEqual(2);
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
      const stats = sim.getStats();
      // Common football scorelines can repeat; the complete match fingerprint
      // must still diverge when the RNG seed changes.
      results.add(
        `${s.homeScore}-${s.awayScore}:${stats.shotsHome}-${stats.shotsAway}:` +
        `${stats.passesAttemptedHome}-${stats.passesAttemptedAway}:${sim.getEvents().length}`,
      );
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
    const report = sim.getAnalysis();
    expect(report.players[before[3]].started).toBe(true);
    expect(report.players[before[3]].minuteOff).toBe(45);
    expect(report.players[benchIds[0]].started).toBe(false);
    expect(report.players[benchIds[0]].minuteOn).toBe(45);
  });

  it("play styles produce materially different buildup, width, runs and carrying", () => {
    const tiki = setup(212);
    tiki.home.tactics.playStyle = PlayStyle.TikiTaka;
    playFullMatch(tiki.sim);

    const route = setup(212);
    route.home.tactics.playStyle = PlayStyle.RouteOne;
    playFullMatch(route.sim);

    const tikiStats = tiki.sim.getStats();
    const routeStats = route.sim.getStats();

    const wing = setup(212);
    wing.home.tactics.playStyle = PlayStyle.WingPlay;
    playFullMatch(wing.sim);
    const wingStats = wing.sim.getStats();

    const counter = setup(212);
    counter.home.tactics.playStyle = PlayStyle.DirectCounterAttack;
    playFullMatch(counter.sim);
    const counterStats = counter.sim.getStats();

    expect(tikiStats.passesAttemptedHome).toBeGreaterThan(routeStats.passesAttemptedHome * 1.5);
    expect(tikiStats.passesCompletedHome / tikiStats.passesAttemptedHome)
      .toBeGreaterThan(routeStats.passesCompletedHome / routeStats.passesAttemptedHome);
    expect(routeStats.throughBallsHome + routeStats.crossesHome)
      .toBeGreaterThan(tikiStats.throughBallsHome + tikiStats.crossesHome);
    expect(wingStats.crossesHome).toBeGreaterThan(tikiStats.crossesHome + 3);
    expect(wingStats.passesAttemptedHome).toBeGreaterThan(routeStats.passesAttemptedHome * 1.15);
    const counterTransitionRate = (
      counterStats.throughBallsHome + counterStats.knockOnsHome + counterStats.shotsHome
    ) / counterStats.passesAttemptedHome;
    const tikiTransitionRate = (
      tikiStats.throughBallsHome + tikiStats.knockOnsHome + tikiStats.shotsHome
    ) / tikiStats.passesAttemptedHome;
    expect(counterTransitionRate).toBeGreaterThan(tikiTransitionRate * 1.6);
  });

  it("applies formation and instruction changes during a live match", () => {
    const { sim, home } = setup(313);
    sim.tick(0.5);
    const beforeTime = sim.getState().gameTime;
    const changed = { ...home.tactics, formation: "4-4-2", pressing: PressingIntensity.Extreme };
    sim.updateTactics("home", changed, "Assistant advice: raise pressure");
    sim.updateDirectives("home", {
      [home.starters[9].id]: { targetMan: true, holdPosition: true },
    }, { clearImmediately: true });
    expect(sim.home.tactics.formation).toBe("4-4-2");
    expect(sim.home.tactics.pressing).toBe(PressingIntensity.Extreme);
    expect(sim.home.teamDirectives).toEqual({ clearImmediately: true });
    expect(sim.home.roles.filter((r) => r === "ST")).toHaveLength(2);
    expect(sim.getState().gameTime).toBe(beforeTime); // tactical UI does not restart the match
    expect(sim.getAnalysis().tacticalChanges.at(-1)?.reason).toBe("Assistant advice: raise pressure");
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
    expect(targetedService).toBeGreaterThanOrEqual(1);
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

    // From rest the first frame is an acceleration step, not an instantaneous
    // teleport to top speed; it must still begin the turn immediately.
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.05);
    expect(after.speed).toBeGreaterThan(0);
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

  it("makes an exact tight marker approach the named opponent measurably closer and from the requested side", () => {
    const run = (planned: boolean) => {
      const built = setup(9631);
      built.home.isUserTeam = true;
      const markerIndex = Math.max(0, built.home.roles.findIndex((role) => role === "CB"));
      const targetIndex = Math.max(0, built.away.roles.findIndex((role) => role === "RW" || role === "LW"));
      if (planned) {
        built.home.opponentPlan = {
          fixtureId: "marking-test",
          source: "user",
          instructions: [{
            targetPlayerId: built.away.starters[targetIndex].id,
            targetPlayerName: "untrusted",
            markerPlayerId: built.home.starters[markerIndex].id,
            markerPlayerName: "untrusted",
            tightMarking: true,
            pressing: "normal",
            showOnto: "outside",
            doubleTeam: false,
            preventCrosses: false,
            attackApproach: "none",
          }],
        };
      }
      const sim = new MatchSimulator(built.home, built.away, { seed: 9631, fixtureId: "marking-test" });
      const internal = simulatorHarness(sim);
      const marker = internal.homePlayers[markerIndex];
      const target = internal.awayPlayers[targetIndex];
      marker.x = 320;
      marker.y = 520;
      marker.vx = 0;
      marker.vy = 0;
      marker.brainTx = marker.x;
      marker.brainTy = marker.y;
      marker.brainNextAt = Infinity;
      target.x = 640;
      target.y = 105;
      target.vx = 0;
      target.vy = 0;
      target.tx = target.x;
      target.ty = target.y;
      internal.giveBallTo("away", targetIndex);
      internal.decisionCd = 5;
      sim.tick(0.1);
      return {
        distance: Math.hypot(marker.tx - target.x, marker.ty - target.y),
        markerTarget: { x: marker.tx, y: marker.ty },
        target: { x: target.x, y: target.y },
      };
    };

    const baseline = run(false);
    const instructed = run(true);
    expect(instructed.distance).toBeLessThan(baseline.distance * 0.7);
    expect(instructed.markerTarget.x).toBeLessThan(instructed.target.x); // goal-side for the home team
    expect(instructed.markerTarget.y).toBeGreaterThan(instructed.target.y); // occupies inside shoulder, showing outside
  });

  it("prioritises reception press and double-team instructions without ever selecting more than two pressers", () => {
    const { sim, home, away } = setup(9632);
    const internal = simulatorHarness(sim);
    away.tactics.pressing = PressingIntensity.Extreme;
    const carrierIndex = Math.max(0, home.roles.findIndex((role) => role === "CAM" || role === "CM"));
    const markerIndex = Math.max(0, away.roles.findIndex((role) => role === "CB"));
    const carrier = internal.homePlayers[carrierIndex];
    carrier.x = 510;
    carrier.y = 310;
    carrier.tx = carrier.x;
    carrier.ty = carrier.y;
    internal.awayPlayers.filter((player) => player.role !== "GK").forEach((player, index) => {
      player.x = 510 + Math.cos(index) * 90;
      player.y = 310 + Math.sin(index) * 90;
      player.tx = player.x;
      player.ty = player.y;
    });
    sim.updateOpponentPlan("away", {
      fixtureId: "press-test",
      source: "ai",
      instructions: [{
        targetPlayerId: home.starters[carrierIndex].id,
        targetPlayerName: "untrusted",
        markerPlayerId: away.starters[markerIndex].id,
        markerPlayerName: "untrusted",
        tightMarking: true,
        pressing: "pressOnReceive",
        showOnto: "weakFoot",
        doubleTeam: true,
        preventCrosses: false,
        attackApproach: "none",
      }],
    });
    internal.giveBallTo("home", carrierIndex);
    internal.decisionCd = 5;
    sim.tick(0.1);

    const pressers = internal.awayPlayers.filter((player) => player.intent === "press");
    expect(pressers).toHaveLength(2);
    expect(pressers.some((player) => player.p.id === away.starters[markerIndex].id)).toBe(true);
  });

  it("applies live plan changes immediately and retains the validated version in permanent analysis", () => {
    const { sim, home, away } = setup(9633);
    const targetIndex = Math.max(0, away.roles.findIndex((role) => role !== "GK"));
    const markerIndex = Math.max(0, home.roles.findIndex((role) => role === "CB"));
    sim.updateOpponentPlan("home", {
      fixtureId: "live-plan",
      source: "user",
      instructions: [{
        targetPlayerId: away.starters[targetIndex].id,
        targetPlayerName: "wrong name",
        markerPlayerId: home.starters[markerIndex].id,
        markerPlayerName: "wrong marker",
        tightMarking: true,
        pressing: "standOff",
        showOnto: "inside",
        doubleTeam: true,
        preventCrosses: false,
        attackApproach: "pace",
      }],
    });

    const analysis = sim.getAnalysis();
    const retained = analysis.opponentPlans?.home?.instructions[0];
    expect(retained).toMatchObject({
      targetPlayerId: away.starters[targetIndex].id,
      targetPlayerName: `${away.starters[targetIndex].firstName} ${away.starters[targetIndex].lastName}`,
      markerPlayerId: home.starters[markerIndex].id,
      pressing: "standOff",
      doubleTeam: false,
      attackApproach: "pace",
    });
    expect(analysis.tacticalChanges.at(-1)?.reason).toBe("Opponent-specific match plan updated");
    expect(analysis.opponentPlanChanges?.filter((change) => change.side === "home")).toHaveLength(2);
    expect(analysis.opponentPlanChanges?.at(-1)?.plan.instructions[0]).toEqual(retained);
  });

  it("lets an AI coach reassign its exact plan through the same mechanism after a lineup change", () => {
    const { sim } = setup(9635);
    const initial = sim.getAnalysis().opponentPlans?.away?.instructions[0];
    expect(initial?.targetPlayerId).toBeTruthy();
    const targetIndex = sim.getState().homeLineup.findIndex((entry) => entry.playerId === initial?.targetPlayerId);
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    expect(sim.substitute("home", targetIndex, 0)).toBe(true);

    const updated = sim.getAnalysis();
    expect(updated.opponentPlans?.away?.instructions.some(
      (instruction) => instruction.targetPlayerId === initial?.targetPlayerId,
    )).toBe(false);
    expect(updated.opponentPlanChanges?.filter((change) => change.side === "away").length).toBeGreaterThan(1);
  });

  it("moves a carrier into a selected weak channel instead of applying a hidden defender penalty", () => {
    const run = (planned: boolean) => {
      const built = setup(9634);
      built.home.isUserTeam = true;
      const carrierIndex = Math.max(0, built.home.roles.findIndex((role) => role === "RW" || role === "LW"));
      const targetIndex = Math.max(0, built.away.roles.findIndex((role) => role === "CB"));
      if (planned) {
        built.home.opponentPlan = {
          fixtureId: "channel-test",
          source: "user",
          instructions: [{
            targetPlayerId: built.away.starters[targetIndex].id,
            targetPlayerName: "target",
            tightMarking: false,
            pressing: "normal",
            showOnto: "normal",
            doubleTeam: false,
            preventCrosses: false,
            attackApproach: "pace",
          }],
        };
      }
      const defenderBefore = {
        pace: built.away.starters[targetIndex].pace,
        acceleration: built.away.starters[targetIndex].acceleration,
      };
      const sim = new MatchSimulator(built.home, built.away, { seed: 9634, fixtureId: "channel-test" });
      const internal = simulatorHarness(sim);
      const carrier = internal.homePlayers[carrierIndex];
      const target = internal.awayPlayers[targetIndex];
      carrier.x = 650;
      carrier.y = 180;
      carrier.tx = carrier.x;
      carrier.ty = carrier.y;
      target.x = 800;
      target.y = 170;
      target.tx = target.x;
      target.ty = target.y;
      internal.awayPlayers.filter((player) => player !== target).forEach((player) => {
        player.x = 180;
        player.y = 500;
      });
      internal.giveBallTo("home", carrierIndex);
      internal.decisionCd = 5;
      sim.tick(0.1);
      expect(target.p.pace).toBe(defenderBefore.pace);
      expect(target.p.acceleration).toBe(defenderBefore.acceleration);
      return { targetX: carrier.tx, runUntil: carrier.runUntil };
    };

    const baseline = run(false);
    const instructed = run(true);
    expect(instructed.targetX).toBeGreaterThan(baseline.targetX + 80);
    expect(instructed.runUntil).toBeGreaterThan(baseline.runUntil);
  });

  it("builds dedicated corner, throw-in, free-kick and goal-kick shapes", () => {
    const cornerGame = setup(970);
    const cornerInternal = simulatorHarness(cornerGame.sim);
    const nominated = cornerGame.home.starters.findIndex((p, i) => cornerGame.home.roles[i] !== "GK");
    cornerGame.home.tactics.setPieces.cornerLeftId = cornerGame.home.starters[nominated].id;
    cornerInternal.startSetPiece("corner", "home", 992, 5);
    expect(cornerInternal.setPiece?.takerIdx).toBe(nominated);
    expect(cornerGame.sim.getStats().cornersHome).toBe(1);
    cornerGame.sim.tick(0.1);
    const aerialRunner = cornerInternal.homePlayers
      .map((p, i) => ({ p, i, score: p.p.heading + p.p.jumping + p.p.offTheBall }))
      .filter(({ p, i }) => p.role !== "GK" && i !== nominated)
      .sort((a, b) => b.score - a.score)[0];
    expect(aerialRunner.p.tx).toBeGreaterThan(820);
    expect(aerialRunner.p.ty).toBeGreaterThan(150);
    for (let i = 0; i < 100; i++) cornerGame.sim.tick(0.1);
    expect(cornerGame.sim.getStats().crossesHome).toBeGreaterThanOrEqual(1);

    const throwGame = setup(971);
    const throwInternal = simulatorHarness(throwGame.sim);
    throwInternal.startSetPiece("throw", "home", 500, 5);
    throwGame.sim.tick(0.1);
    const throwOptions = throwInternal.homePlayers.filter(
      (p, i) => i !== throwInternal.setPiece?.takerIdx && p.tx > 430 && p.tx < 610 && p.ty < 145,
    );
    expect(throwOptions.length).toBeGreaterThanOrEqual(2);
    expect(throwGame.sim.getStats().throwInsHome).toBe(1);

    const freeKickGame = setup(972);
    const freeKickInternal = simulatorHarness(freeKickGame.sim);
    freeKickInternal.startSetPiece("freeKick", "home", 700, 325);
    freeKickGame.sim.tick(0.1);
    const wall = freeKickInternal.awayPlayers.filter((p) => p.role !== "GK" && p.tx > 780 && p.tx < 810);
    expect(wall.length).toBe(4);

    const goalKickGame = setup(973);
    const goalKickInternal = simulatorHarness(goalKickGame.sim);
    goalKickInternal.startSetPiece("goalKick", "home", 70, 325);
    goalKickGame.sim.tick(0.1);
    expect(goalKickInternal.homePlayers[goalKickInternal.setPiece!.takerIdx].role).toBe("GK");
    const splitCentreBacks = goalKickInternal.homePlayers.filter(
      (p) => p.role === "CB" && p.tx > 130 && p.tx < 165 && Math.abs(p.ty - 325) > 80,
    );
    expect(splitCentreBacks).toHaveLength(2);
  });

  it("uses the nominated penalty taker and positions both teams for a rebound", () => {
    const { sim, home } = setup(974);
    const internal = simulatorHarness(sim);
    const striker = Math.max(0, home.roles.findIndex((role) => role === "ST"));
    home.tactics.setPieces.penaltyId = home.starters[striker].id;
    internal.startPenalty("home");
    expect(internal.penaltyState?.takerIdx).toBe(striker);
    sim.tick(0.1);

    const awayKeeper = internal.awayPlayers.find((p) => p.role === "GK")!;
    expect(awayKeeper.tx).toBeGreaterThan(970);
    const playersOutsideArea = [...internal.homePlayers, ...internal.awayPlayers]
      .filter((p) => p.role !== "GK" && p !== internal.homePlayers[striker]);
    expect(playersOutsideArea.every((p) => p.tx <= 820)).toBe(true);

    for (let i = 0; i < 100; i++) sim.tick(0.1);
    expect(sim.getStats().shotsHome).toBe(1);
    expect(sim.getEvents().some((e) => e.type === "PenaltyGoal" || e.type === "PenaltyMissed")).toBe(true);
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
