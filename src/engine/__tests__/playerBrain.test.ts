import { describe, expect, it } from "vitest";
import {
  STYLE_BEHAVIORS,
  chooseSpatialTarget,
  playerAcceleration,
  playerSprintSpeed,
} from "@/engine/playerBrain";
import { generatePlayer } from "@/database/playerGenerator";
import { PlayStyle, PlaystyleTag, PrimaryPosition, type Player } from "@/types";

function player(overrides: Partial<Player> = {}): Player {
  return {
    ...generatePlayer({ seed: 771, position: PrimaryPosition.CM, potentialCeiling: 13 }),
    ...overrides,
  };
}

describe("player brain", () => {
  it("creates a visible speed and acceleration gap without making jogging a permanent sprint", () => {
    const slow = player({ pace: 5, acceleration: 5, ballControl: 10, dribbling: 10, playstyles: [] });
    const fast = player({
      pace: 19,
      acceleration: 19,
      ballControl: 16,
      dribbling: 17,
      playstyles: [PlaystyleTag.PaceAbuser],
    });

    expect(playerSprintSpeed(fast)).toBeGreaterThan(playerSprintSpeed(slow) + 2);
    expect(playerSprintSpeed(fast, true)).toBeGreaterThan(playerSprintSpeed(slow, true) + 2);
    expect(playerAcceleration(fast)).toBeGreaterThan(playerAcceleration(slow) + 2);
    expect(playerSprintSpeed(fast, true)).toBeLessThan(playerSprintSpeed(fast));
  });

  it("makes team styles materially different behavior profiles", () => {
    expect(STYLE_BEHAVIORS[PlayStyle.TikiTaka].circulation)
      .toBeGreaterThan(STYLE_BEHAVIORS[PlayStyle.RouteOne].circulation * 3);
    expect(STYLE_BEHAVIORS[PlayStyle.RouteOne].directness)
      .toBeGreaterThan(STYLE_BEHAVIORS[PlayStyle.TikiTaka].directness * 4);
    expect(STYLE_BEHAVIORS[PlayStyle.WingPlay].crossing)
      .toBeGreaterThan(STYLE_BEHAVIORS[PlayStyle.PossessionBased].crossing * 3);
    expect(STYLE_BEHAVIORS[PlayStyle.DirectCounterAttack].runBehind)
      .toBeGreaterThan(STYLE_BEHAVIORS[PlayStyle.ParkTheBus].runBehind * 2);
  });

  it("chooses an open supporting lane instead of standing behind an opponent", () => {
    const p = player({ id: "brain", teamwork: 17, decisions: 16, playstyles: [] });
    const target = chooseSpatialTarget({
      player: p,
      playerIndex: 6,
      role: "CM",
      current: { x: 470, y: 325 },
      baseTarget: { x: 520, y: 325 },
      ball: { x: 500, y: 325 },
      carrier: { x: 500, y: 325 },
      teammates: [
        { id: "brain", role: "CM", x: 470, y: 325 },
        { id: "mate", role: "CM", x: 520, y: 240 },
      ],
      opponents: [
        { id: "marker", role: "CDM", x: 535, y: 325 },
        { id: "marker2", role: "CM", x: 590, y: 350 },
      ],
      attackingDirection: 1,
      style: PlayStyle.PossessionBased,
      hasPossession: true,
      transitionAge: 9,
      runActive: false,
      stayWide: false,
      cutInside: false,
      holdPosition: false,
      forwardRuns: false,
    });

    expect(Math.abs(target.y - 325)).toBeGreaterThan(35);
    expect(Math.hypot(target.x - 535, target.y - 325)).toBeGreaterThan(65);
    expect(target.intent).toBe("support");
  });

  it("lets a space interpreter make a run beyond the ball in a counterattack", () => {
    const p = player({
      id: "runner",
      pace: 17,
      offTheBall: 18,
      playstyles: [PlaystyleTag.SpaceInterpreter, PlaystyleTag.PaceAbuser],
    });
    const target = chooseSpatialTarget({
      player: p,
      playerIndex: 9,
      role: "ST",
      current: { x: 610, y: 325 },
      baseTarget: { x: 670, y: 325 },
      ball: { x: 500, y: 350 },
      carrier: { x: 500, y: 350 },
      teammates: [{ id: "runner", role: "ST", x: 610, y: 325 }],
      opponents: [
        { id: "cb1", role: "CB", x: 735, y: 270 },
        { id: "cb2", role: "CB", x: 740, y: 385 },
        { id: "gk", role: "GK", x: 955, y: 325 },
      ],
      attackingDirection: 1,
      style: PlayStyle.DirectCounterAttack,
      hasPossession: true,
      transitionAge: 1,
      runActive: false,
      stayWide: false,
      cutInside: false,
      holdPosition: false,
      forwardRuns: false,
    });

    expect(target.intent).toBe("runBehind");
    expect(target.x).toBeGreaterThan(700);
    expect(target.x).toBeLessThan(740); // holds the shoulder until the pass is kicked
  });
});
