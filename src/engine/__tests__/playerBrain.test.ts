import { describe, expect, it } from "vitest";
import {
  STYLE_BEHAVIORS,
  chooseSpatialTarget,
  playerAcceleration,
  playerSprintSpeed,
} from "@/engine/playerBrain";
import { generatePlayer } from "@/database/playerGenerator";
import { iconicPrimeProfileId } from "@/engine/iconicPrimeProfiles";
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

  it("makes contrasting iconic nines choose their researched reception movement", () => {
    const spatialInput = (p: Player) => ({
      player: p,
      playerIndex: 9,
      role: "ST",
      current: { x: 700, y: 325 },
      baseTarget: { x: 725, y: 325 },
      ball: { x: 520, y: 330 },
      carrier: { x: 520, y: 330 },
      teammates: [{ id: p.id, role: "ST", x: 700, y: 325 }],
      opponents: [
        { id: "press", role: "CDM", x: 540, y: 330 },
        { id: "cb1", role: "CB", x: 805, y: 275 },
        { id: "cb2", role: "CB", x: 810, y: 385 },
      ],
      attackingDirection: 1 as const,
      style: PlayStyle.Balanced,
      hasPossession: true,
      transitionAge: 9,
      runActive: false,
      stayWide: false,
      cutInside: false,
      holdPosition: false,
      forwardRuns: false,
    });
    const channelNine = player({
      id: "channel-nine",
      primaryPosition: PrimaryPosition.ST,
      iconicPrimeProfileId: iconicPrimeProfileId("Erling Haland"),
      playstyles: [],
    });
    const falseNine = player({
      id: "false-nine",
      primaryPosition: PrimaryPosition.ST,
      iconicPrimeProfileId: iconicPrimeProfileId("Francesco Toti"),
      playstyles: [],
    });

    const channelTarget = chooseSpatialTarget(spatialInput(channelNine));
    const falseNineTarget = chooseSpatialTarget(spatialInput(falseNine));

    expect(channelTarget.intent).toBe("runBehind");
    expect(falseNineTarget.intent).toBe("comeShort");
    expect(channelTarget.x).toBeGreaterThan(falseNineTarget.x + 100);
  });

  it("underlaps a wide carrier through the inside channel", () => {
    const p = player({ id: "left-back", offTheBall: 17, playstyles: [] });
    const target = chooseSpatialTarget({
      player: p,
      playerIndex: 3,
      role: "LB",
      current: { x: 480, y: 105 },
      baseTarget: { x: 500, y: 105 },
      ball: { x: 575, y: 72 },
      carrier: { x: 575, y: 72 },
      teammates: [
        { id: "left-back", role: "LB", x: 480, y: 105 },
        { id: "winger", role: "LW", x: 575, y: 72 },
      ],
      opponents: [
        { id: "full-back", role: "RB", x: 650, y: 80 },
        { id: "cover", role: "CB", x: 720, y: 300 },
      ],
      attackingDirection: 1,
      style: PlayStyle.TotalFootball,
      hasPossession: true,
      transitionAge: 8,
      runActive: false,
      stayWide: false,
      cutInside: true,
      holdPosition: false,
      forwardRuns: false,
    });

    expect(target.intent).toBe("underlap");
    expect(target.x).toBeGreaterThan(575);
    expect(target.y).toBeGreaterThan(105);
    expect(target.y).toBeLessThan(325);
  });

  it("comes short to give a pressured carrier a wall-pass option", () => {
    const p = player({ id: "nine", offTheBall: 16, teamwork: 17, playstyles: [] });
    const target = chooseSpatialTarget({
      player: p,
      playerIndex: 9,
      role: "ST",
      current: { x: 705, y: 330 },
      baseTarget: { x: 735, y: 330 },
      ball: { x: 515, y: 325 },
      carrier: { x: 515, y: 325 },
      teammates: [{ id: "nine", role: "ST", x: 705, y: 330 }],
      opponents: [
        { id: "presser", role: "CDM", x: 535, y: 330 },
        { id: "cb1", role: "CB", x: 790, y: 270 },
        { id: "cb2", role: "CB", x: 800, y: 390 },
      ],
      attackingDirection: 1,
      style: PlayStyle.TikiTaka,
      hasPossession: true,
      transitionAge: 9,
      runActive: false,
      stayWide: false,
      cutInside: false,
      holdPosition: false,
      forwardRuns: false,
    });

    expect(target.intent).toBe("comeShort");
    expect(target.x).toBeLessThan(705);
    expect(target.x).toBeGreaterThan(515);
  });

  it("occupies the far-post channel when a wide carrier can cross", () => {
    const p = player({
      id: "box-runner",
      offTheBall: 18,
      heading: 17,
      playstyles: [PlaystyleTag.AerialThreat],
    });
    const target = chooseSpatialTarget({
      player: p,
      playerIndex: 9,
      role: "ST",
      current: { x: 690, y: 340 },
      baseTarget: { x: 735, y: 325 },
      ball: { x: 720, y: 75 },
      carrier: { x: 720, y: 75 },
      teammates: [{ id: "box-runner", role: "ST", x: 690, y: 340 }],
      opponents: [
        { id: "cb1", role: "CB", x: 845, y: 265 },
        { id: "cb2", role: "CB", x: 850, y: 400 },
        { id: "gk", role: "GK", x: 960, y: 325 },
      ],
      attackingDirection: 1,
      style: PlayStyle.WingPlay,
      hasPossession: true,
      transitionAge: 8,
      runActive: false,
      stayWide: false,
      cutInside: false,
      holdPosition: false,
      forwardRuns: false,
    });

    expect(target.intent).toBe("crossReceiver");
    expect(target.x).toBeGreaterThan(720);
    expect(target.y).toBeGreaterThan(400);
  });

  it("continues a give-and-go beyond the new ball carrier", () => {
    const p = player({ id: "wall-passer", offTheBall: 17, acceleration: 17, playstyles: [] });
    const target = chooseSpatialTarget({
      player: p,
      playerIndex: 7,
      role: "CM",
      current: { x: 555, y: 270 },
      baseTarget: { x: 550, y: 270 },
      ball: { x: 590, y: 325 },
      carrier: { x: 590, y: 325 },
      teammates: [
        { id: "wall-passer", role: "CM", x: 555, y: 270 },
        { id: "receiver", role: "CAM", x: 590, y: 325 },
      ],
      opponents: [
        { id: "screen", role: "CDM", x: 640, y: 330 },
        { id: "cover", role: "CB", x: 760, y: 390 },
      ],
      attackingDirection: 1,
      style: PlayStyle.TikiTaka,
      hasPossession: true,
      transitionAge: 7,
      runActive: true,
      stayWide: false,
      cutInside: false,
      holdPosition: false,
      forwardRuns: false,
    });

    expect(target.intent).toBe("giveAndGo");
    expect(target.x).toBeGreaterThan(650);
    expect(Math.abs(target.y - 325)).toBeGreaterThan(25);
  });

  it("turns explicit support and box jobs into contrasting physical destinations", () => {
    const striker = player({ id: "instructed-nine", offTheBall: 16, pace: 15, playstyles: [] });
    const common = {
      player: striker,
      playerIndex: 9,
      role: "ST",
      current: { x: 675, y: 325 },
      baseTarget: { x: 700, y: 325 },
      ball: { x: 520, y: 90 },
      carrier: { x: 520, y: 90 },
      teammates: [{ id: striker.id, role: "ST", x: 675, y: 325 }],
      opponents: [
        { id: "cb-one", role: "CB", x: 810, y: 270 },
        { id: "cb-two", role: "CB", x: 815, y: 390 },
      ],
      attackingDirection: 1 as const,
      style: PlayStyle.Balanced,
      hasPossession: true,
      transitionAge: 8,
      runActive: false,
      stayWide: false,
      cutInside: false,
      holdPosition: false,
      forwardRuns: false,
    };

    const short = chooseSpatialTarget({ ...common, instructions: { supportRun: "comeShort" } });
    const beyond = chooseSpatialTarget({ ...common, instructions: { supportRun: "runInBehind" } });
    const crossingContext = { ...common, ball: { x: 720, y: 90 }, carrier: { x: 720, y: 90 } };
    const nearPost = chooseSpatialTarget({ ...crossingContext, instructions: { boxRole: "nearPost" } });
    const farPost = chooseSpatialTarget({ ...crossingContext, instructions: { boxRole: "farPost" } });

    expect(short.intent).toBe("comeShort");
    expect(beyond.intent).toBe("runBehind");
    expect(beyond.x).toBeGreaterThan(short.x + 100);
    expect(nearPost.intent).toBe("crossReceiver");
    expect(farPost.intent).toBe("crossReceiver");
    expect(farPost.y).toBeGreaterThan(nearPost.y + 130);
  });
});
