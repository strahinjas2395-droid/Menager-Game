import { describe, expect, it } from "vitest";
import { SeededRNG } from "@/database/rng";
import { generateSquad } from "@/database/playerGenerator";
import {
  defaultTrainingPlan,
  isPlayerAvailable,
  playerCondition,
  matchStartingEnergy,
  playerSharpness,
  postMatchCondition,
  processWeeklyTraining,
} from "@/engine/fitness";
import { selectBestXI } from "@/engine/matchSimulator";
import { teamStrength } from "@/engine/leagueEngine";
import type { Club, Player, WorldDatabase } from "@/types";

function smallWorld(): { world: WorldDatabase; players: Player[] } {
  const players = generateSquad("fitness-club", 3, "Bretherland", new SeededRNG(881), 91).slice(0, 14);
  for (const player of players) {
    player.condition = 55;
    player.matchSharpness = 60;
    player.injury = null;
    player.trainingProgress = {};
  }
  const club = {
    id: "fitness-club",
    name: "Fitness FC",
    shortName: "FIT",
    playerIds: players.map((player) => player.id),
    facilities: { training: 8, youth: 7 },
  } as unknown as Club;
  return {
    players,
    world: {
      players: Object.fromEntries(players.map((player) => [player.id, player])),
      clubs: { [club.id]: club },
      leagues: {},
      managers: {},
      fixtures: {},
    },
  };
}

describe("persistent fitness, recovery and training", () => {
  it("provides backward-compatible readiness defaults and deterministic match fatigue", () => {
    const player = generateSquad("legacy", 2, "Bretherland", new SeededRNG(9), 2)[0];
    delete player.condition;
    delete player.matchSharpness;
    expect(playerCondition(player)).toBe(92);
    expect(playerSharpness(player)).toBe(65);
    expect(postMatchCondition(92, 90, 10.5, 24, 12)).toBeLessThan(75);
    player.condition = 35;
    expect(matchStartingEnergy(player)).toBeLessThan(0.82);
  });

  it("advances rest, training development and rehabilitation once per calendar week", () => {
    const { world, players } = smallWorld();
    const resting = players[0];
    const rehabilitating = players[1];
    rehabilitating.injury = {
      id: "injury", name: "Ankle sprain", bodyArea: "ankle", severity: "Moderate", source: "match",
      occurredSeason: 2026, occurredWeek: 2, totalWeeks: 2, weeksRemaining: 2, rehabProgress: 0,
    };
    const plan = defaultTrainingPlan();
    plan.intensity = "High";
    plan.teamFocus = "Physical";
    plan.restPlayerIds = [resting.id];
    plan.individualFocus[players[2].id] = "Attacking";

    const first = processWeeklyTraining(world, "fitness-club", plan, 2026, 3, 1234);
    const conditionAfterOneRun = playerCondition(resting);
    const duplicate = processWeeklyTraining(world, "fitness-club", plan, 2026, 3, 1234);
    expect(duplicate.developed).toEqual([]);
    expect(playerCondition(resting)).toBe(conditionAfterOneRun);
    expect(playerCondition(resting)).toBeGreaterThan(playerCondition(players[2]));
    expect(playerSharpness(resting)).toBeLessThan(playerSharpness(players[2]));
    expect(rehabilitating.injury?.weeksRemaining).toBe(1);
    expect(first.seasonYear).toBe(2026);

    processWeeklyTraining(world, "fitness-club", plan, 2026, 4, 1234);
    expect(rehabilitating.injury).toBeNull();
    expect(isPlayerAvailable(rehabilitating)).toBe(true);
  });

  it("is reproducible from the same world, plan, calendar and seed", () => {
    const one = smallWorld();
    const two = smallWorld();
    const planOne = defaultTrainingPlan();
    const planTwo = defaultTrainingPlan();
    planOne.teamFocus = planTwo.teamFocus = "Possession";
    planOne.intensity = planTwo.intensity = "High";
    const reportOne = processWeeklyTraining(one.world, "fitness-club", planOne, 2027, 11, 5521);
    const reportTwo = processWeeklyTraining(two.world, "fitness-club", planTwo, 2027, 11, 5521);
    expect(reportOne).toEqual(reportTwo);
    expect(JSON.stringify(one.world.players)).toBe(JSON.stringify(two.world.players));
  });

  it("makes persistent readiness affect quick-match performance without changing attributes", () => {
    const fresh = smallWorld().players;
    const tired = fresh.map((player) => ({ ...player, condition: 38, matchSharpness: 25 }));
    expect(teamStrength(tired)).toBeLessThan(teamStrength(fresh));
    expect(tired[0].pace).toBe(fresh[0].pace);
    expect("overall" in tired[0]).toBe(false);
  });

  it("keeps injured players out of selection when a fit eleven exists", () => {
    const { players } = smallWorld();
    const unavailable = players.find((player) => player.primaryPosition !== "GK")!;
    unavailable.injury = {
      id: "out", name: "Knee sprain", bodyArea: "knee", severity: "Serious", source: "training",
      occurredSeason: 2026, occurredWeek: 4, totalWeeks: 8, weeksRemaining: 8, rehabProgress: 0,
    };
    const selected = selectBestXI(players, "4-3-3");
    expect(selected.starters).toHaveLength(11);
    expect(selected.starters.some((player) => player.id === unavailable.id)).toBe(false);
    expect(selected.bench.some((player) => player.id === unavailable.id)).toBe(false);
  });
});
