import { describe, expect, it } from "vitest";
import { generatePlayer } from "@/database/playerGenerator";
import {
  chooseDribbleRoute,
  rankDribbleRoutes,
  type DribblePlanInput,
  type MovementOpponent,
} from "@/engine/movementPatterns";
import { iconicPrimeProfileId } from "@/engine/iconicPrimeProfiles";
import { PlayStyle, PlaystyleTag, PrimaryPosition, type Player } from "@/types";

function player(overrides: Partial<Player> = {}): Player {
  return {
    ...generatePlayer({ seed: 923, position: PrimaryPosition.LW, potentialCeiling: 16 }),
    id: "carrier",
    pace: 16,
    acceleration: 16,
    agility: 16,
    dribbling: 16,
    ballControl: 15,
    decisions: 15,
    flair: 15,
    balance: 14,
    composure: 14,
    crossing: 14,
    playstyles: [],
    ...overrides,
  };
}

function opponent(id: string, x: number, y: number, overrides: Partial<MovementOpponent> = {}): MovementOpponent {
  return {
    id,
    x,
    y,
    pace: 13,
    acceleration: 13,
    anticipation: 13,
    ...overrides,
  };
}

function input(overrides: Partial<DribblePlanInput> = {}): DribblePlanInput {
  return {
    player: player(),
    role: "LW",
    tacticalRole: "Winger",
    current: { x: 560, y: 105 },
    velocity: { x: 45, y: 0 },
    opponents: [
      opponent("fullback", 650, 115),
      opponent("cover", 705, 250),
    ],
    teammates: [{ x: 625, y: 325 }],
    attackingDirection: 1,
    pressure: 0.12,
    phase: "create",
    style: PlayStyle.Balanced,
    instructions: {},
    ...overrides,
  };
}

describe("contextual dribble movement", () => {
  it("ranks routes deterministically with explicit control and possession value", () => {
    const context = input();
    const first = rankDribbleRoutes(context);
    const second = rankDribbleRoutes(context);

    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThanOrEqual(6);
    expect(first[0].pitchControl).toBeGreaterThanOrEqual(0);
    expect(first[0].pitchControl).toBeLessThanOrEqual(1);
    expect(first[0].possessionValueGain).not.toBe(0);
    expect(first[0].waypoints.length).toBeGreaterThan(0);
  });

  it("lets footedness and a cut-inside instruction produce a physical inward route", () => {
    const route = chooseDribbleRoute(input({
      player: player({
        preferredFoot: "Right",
        playstyles: [PlaystyleTag.CreativeInsideForward, PlaystyleTag.Dribbler],
      }),
      tacticalRole: "InsideForward",
      instructions: { cutInside: true, dribbleMore: true },
    }));

    expect(route.pattern).toBe("insideCut");
    expect(route.waypoints).toHaveLength(2);
    expect(route.waypoints[0].y).toBeLessThan(105); // sells the outside feint
    expect(route.waypoints[1].y).toBeGreaterThan(155); // exits towards goal/centre
  });

  it("uses the outside/byline with the natural wide foot and Wing Play", () => {
    const route = chooseDribbleRoute(input({
      player: player({
        preferredFoot: "Left",
        pace: 19,
        acceleration: 18,
        crossing: 18,
        playstyles: [PlaystyleTag.Winger, PlaystyleTag.CutbackSpecialist],
      }),
      current: { x: 735, y: 88 },
      velocity: { x: 60, y: -2 },
      opponents: [opponent("inside-defender", 790, 160)],
      phase: "finish",
      style: PlayStyle.WingPlay,
      instructions: { stayWide: true },
    }));

    expect(route.pattern).toBe("bylineDrive");
    expect(route.waypoints.at(-1)?.x).toBeGreaterThan(790);
    expect(route.waypoints.at(-1)?.y).toBeLessThan(88);
  });

  it("turns away from contact when pressure makes the progressive lane uncontrollable", () => {
    const route = chooseDribbleRoute(input({
      role: "CM",
      tacticalRole: "DeepLyingPlaymaker",
      player: player({
        primaryPosition: PrimaryPosition.CM,
        preferredFoot: "Right",
        pace: 11,
        acceleration: 11,
        ballControl: 18,
        balance: 18,
        composure: 18,
        playstyles: [PlaystyleTag.PressResistant],
      }),
      current: { x: 355, y: 325 },
      velocity: { x: 20, y: 0 },
      opponents: [
        opponent("presser", 365, 343, { pace: 16, acceleration: 17 }),
        opponent("screen", 420, 325, { anticipation: 17 }),
      ],
      teammates: [{ x: 300, y: 225 }, { x: 290, y: 430 }],
      pressure: 0.91,
      phase: "buildUp",
      style: PlayStyle.PossessionBased,
    }));

    expect(route.pattern).toBe("escapeTurn");
    expect(route.waypoints).toHaveLength(2);
    expect(route.waypoints[0].x).toBeLessThan(355); // first step protects the ball backwards
    expect(route.waypoints[0].y).toBeLessThan(325); // away from the presser below him
  });

  it("routes a won one-v-one around the defender instead of continuing straight", () => {
    const route = chooseDribbleRoute(input({
      current: { x: 500, y: 325 },
      velocity: { x: 48, y: 0 },
      role: "CAM",
      tacticalRole: "AttackingMidfielder",
      player: player({ playstyles: [PlaystyleTag.Dribbler] }),
      opponents: [
        opponent("beaten", 532, 325),
        opponent("cover", 640, 250),
      ],
      beatenOpponentId: "beaten",
      pressure: 0.65,
      phase: "create",
    }));

    expect(route.pattern).toBe("feintAndGo");
    expect(Math.abs(route.waypoints.at(-1)!.y - 325)).toBeGreaterThan(30);
    expect(route.waypoints.at(-1)!.x).toBeGreaterThan(550);
  });

  it("only permits a long knock-on when cover leaves enough reachable grass", () => {
    const open = chooseDribbleRoute(input({
      current: { x: 470, y: 325 },
      role: "CAM",
      tacticalRole: "ShadowStriker",
      player: player({
        pace: 19,
        acceleration: 19,
        playstyles: [PlaystyleTag.PaceAbuser],
      }),
      opponents: [opponent("trailing", 425, 330, { pace: 11 })],
      phase: "transition",
      pressure: 0.05,
    }));
    const covered = chooseDribbleRoute(input({
      current: { x: 470, y: 325 },
      role: "CAM",
      player: player({ pace: 19, acceleration: 19, playstyles: [PlaystyleTag.PaceAbuser] }),
      opponents: [
        opponent("trailing", 425, 330, { pace: 11 }),
        opponent("cover-one", 520, 320, { pace: 18, acceleration: 18 }),
        opponent("cover-two", 555, 365, { pace: 17, acceleration: 17 }),
      ],
      phase: "transition",
      pressure: 0.25,
    }));

    expect(open.safeKnockOnM).toBeGreaterThan(4.2);
    expect(covered.safeKnockOnM).toBeLessThan(open.safeKnockOnM);
    expect(covered.pitchControl).toBeLessThan(open.pitchControl);
  });

  it("turns iconic dribbling fingerprints into different routes and physical touch lengths", () => {
    const common = {
      current: { x: 500, y: 325 },
      velocity: { x: 35, y: 0 },
      role: "CAM",
      tacticalRole: "AttackingMidfielder",
      opponents: [
        opponent("duel", 535, 325),
        opponent("cover", 645, 255),
      ],
      pressure: 0.46,
      phase: "create" as const,
    };
    const closeController = rankDribbleRoutes(input({
      ...common,
      player: player({
        preferredFoot: "Right",
        iconicPrimeProfileId: iconicPrimeProfileId("Ronaldo Gaucho"),
      }),
    }));
    const channelRunner = rankDribbleRoutes(input({
      ...common,
      player: player({
        preferredFoot: "Right",
        iconicPrimeProfileId: iconicPrimeProfileId("Erling Haland"),
      }),
    }));
    const gauchoFeint = closeController.find((route) => route.pattern === "feintAndGo")!;
    const halandFeint = channelRunner.find((route) => route.pattern === "feintAndGo")!;

    expect(gauchoFeint.score).toBeGreaterThan(halandFeint.score + 9);
    expect(gauchoFeint.touchScale).toBeLessThan(halandFeint.touchScale);
    expect(rankDribbleRoutes(input({
      ...common,
      player: player({ preferredFoot: "Right", iconicPrimeProfileId: iconicPrimeProfileId("Ronaldo Gaucho") }),
    }))).toEqual(closeController);
  });

  it("mirrors equivalent away-team routes without changing the decision", () => {
    const home = chooseDribbleRoute(input({
      current: { x: 735, y: 88 },
      opponents: [opponent("inside", 790, 160)],
      phase: "finish",
      style: PlayStyle.WingPlay,
      instructions: { stayWide: true },
      player: player({ preferredFoot: "Left", playstyles: [PlaystyleTag.Winger] }),
    }));
    const away = chooseDribbleRoute(input({
      current: { x: 265, y: 562 },
      velocity: { x: -45, y: 0 },
      opponents: [opponent("inside", 210, 490)],
      teammates: [{ x: 375, y: 325 }],
      attackingDirection: -1,
      phase: "finish",
      style: PlayStyle.WingPlay,
      instructions: { stayWide: true },
      player: player({ preferredFoot: "Left", playstyles: [PlaystyleTag.Winger] }),
    }));

    expect(away.pattern).toBe(home.pattern);
    expect(away.waypoints.at(-1)!.x).toBeCloseTo(1000 - home.waypoints.at(-1)!.x, 5);
    expect(away.waypoints.at(-1)!.y).toBeCloseTo(650 - home.waypoints.at(-1)!.y, 5);
  });

  it("makes explicit inside and down-line carries choose different real routes", () => {
    const common = input({
      player: player({ preferredFoot: "Right", playstyles: [] }),
      current: { x: 655, y: 92 },
      velocity: { x: 42, y: 0 },
      opponents: [opponent("full-back", 735, 122), opponent("cover", 800, 285)],
      phase: "finish",
      style: PlayStyle.Balanced,
    });
    const inside = chooseDribbleRoute({ ...common, instructions: { carryPath: "inside" } });
    const line = chooseDribbleRoute({ ...common, instructions: { carryPath: "downLine" } });

    expect(["insideCut", "halfSpaceDrive"]).toContain(inside.pattern);
    expect(["outsideDrive", "bylineDrive"]).toContain(line.pattern);
    expect(inside.waypoints.at(-1)!.y).toBeGreaterThan(line.waypoints.at(-1)!.y + 55);
  });
});
