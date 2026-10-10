import { describe, expect, it } from "vitest";
import { SeededRNG } from "@/database/rng";
import { generateSquad } from "@/database/playerGenerator";
import {
  buildAIOpponentMatchPlan,
  defaultOpponentPlayerPlan,
  sanitizeOpponentMatchPlan,
} from "@/engine/matchPlan";
import { Difficulty, type OpponentPlayerPlan } from "@/types";

function squads() {
  const rng = new SeededRNG(4411);
  return {
    own: generateSquad("own", 2, "Bretherland", rng, 12),
    opponents: generateSquad("opposition", 2, "Bretherland", rng, 13),
  };
}

describe("opponent match plans", () => {
  it("validates exact identities, enums, conflicts, duplicates and the target cap", () => {
    const { own, opponents } = squads();
    const outfield = own.filter((player) => player.primaryPosition !== "GK");
    const marker = outfield[0];
    const first = opponents[1];
    const second = opponents[2];
    const active = opponents.slice(3, 14).map((target, index): OpponentPlayerPlan => ({
      ...defaultOpponentPlayerPlan(target),
      tightMarking: true,
      markerPlayerId: index < 2 ? marker.id : outfield[index + 1]?.id,
      markerPlayerName: "untrusted name",
    }));
    const sanitized = sanitizeOpponentMatchPlan({
      fixtureId: "wrong-fixture",
      source: "ai",
      instructions: [
        {
          ...defaultOpponentPlayerPlan(first),
          targetPlayerName: "Spoofed target",
          markerPlayerId: marker.id,
          markerPlayerName: "Spoofed marker",
          pressing: "standOff",
          showOnto: "weakFoot",
          doubleTeam: true,
        },
        // Duplicate target: the final valid entry wins deterministically.
        { ...defaultOpponentPlayerPlan(first), tightMarking: true, markerPlayerId: marker.id },
        // The marker is already occupied, so this remains a zonal instruction.
        { ...defaultOpponentPlayerPlan(second), markerPlayerId: marker.id, preventCrosses: true },
        // Goalkeepers are valid targets but cannot be assigned an outfield marking job.
        { ...defaultOpponentPlayerPlan(opponents[17]), markerPlayerId: own[0].id, preventCrosses: true },
        // Runtime-invalid values and identities are rejected rather than trusted.
        {
          ...defaultOpponentPlayerPlan(opponents[15]),
          targetPlayerId: "unknown-target",
          markerPlayerId: "unknown-marker",
          pressing: "always" as OpponentPlayerPlan["pressing"],
          showOnto: "left" as OpponentPlayerPlan["showOnto"],
          attackApproach: "magic" as OpponentPlayerPlan["attackApproach"],
          tightMarking: true,
        },
        // Empty rows do not persist.
        defaultOpponentPlayerPlan(opponents[16]),
        ...active,
      ],
    }, "fixture-42", own, opponents, "user");

    expect(sanitized.fixtureId).toBe("fixture-42");
    expect(sanitized.source).toBe("user");
    expect(sanitized.instructions).toHaveLength(8);
    expect(sanitized.instructions.every((entry) => opponents.some((player) => player.id === entry.targetPlayerId))).toBe(true);
    expect(sanitized.instructions.some((entry) => entry.targetPlayerId === "unknown-target")).toBe(false);

    const firstPlan = sanitized.instructions.find((entry) => entry.targetPlayerId === first.id)!;
    expect(firstPlan.targetPlayerName).toBe(`${first.firstName} ${first.lastName}`);
    expect(firstPlan.markerPlayerName).toBe(`${marker.firstName} ${marker.lastName}`);
    expect(firstPlan.tightMarking).toBe(true);

    const secondPlan = sanitized.instructions.find((entry) => entry.targetPlayerId === second.id)!;
    expect(secondPlan.markerPlayerId).toBeUndefined();
    expect(secondPlan.preventCrosses).toBe(true);
    expect(sanitized.instructions.find((entry) => entry.targetPlayerId === opponents[17].id)?.markerPlayerId).toBeUndefined();
    const markers = sanitized.instructions.flatMap((entry) => entry.markerPlayerId ? [entry.markerPlayerId] : []);
    expect(new Set(markers).size).toBe(markers.length);
  });

  it("resolves stand-off and double-team as mutually exclusive", () => {
    const { own, opponents } = squads();
    const target = opponents[3];
    const plan = sanitizeOpponentMatchPlan({
      fixtureId: "fixture",
      source: "user",
      instructions: [{
        ...defaultOpponentPlayerPlan(target),
        pressing: "standOff",
        doubleTeam: true,
      }],
    }, "fixture", own, opponents);
    expect(plan.instructions[0]).toMatchObject({ pressing: "standOff", doubleTeam: false });
  });

  it("scales AI sophistication through the same validated plan mechanism without mutating players", () => {
    const { own, opponents } = squads();
    const roles = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "LW", "ST"];
    const ownXI = own.slice(0, 11).map((player, index) => ({ player, role: roles[index] }));
    const opponentXI = opponents.slice(0, 11).map((player, index) => ({ player, role: roles[index] }));
    const before = JSON.stringify({ own, opponents });

    const beginner = buildAIOpponentMatchPlan("fixture", ownXI, opponentXI, Difficulty.Beginner);
    const amateur = buildAIOpponentMatchPlan("fixture", ownXI, opponentXI, Difficulty.Amateur);
    const professional = buildAIOpponentMatchPlan("fixture", ownXI, opponentXI, Difficulty.Professional);
    const ultimate = buildAIOpponentMatchPlan("fixture", ownXI, opponentXI, Difficulty.Ultimate);

    expect(beginner.instructions).toHaveLength(0);
    expect(amateur.instructions).toHaveLength(1);
    expect(amateur.instructions[0].pressing).toBe("pressOnReceive");
    expect(professional.instructions[0]).toMatchObject({
      tightMarking: true,
      pressing: "pressOnReceive",
      showOnto: "weakFoot",
    });
    expect(professional.instructions[0].markerPlayerId).toBeTruthy();
    expect(ultimate.instructions.length).toBeGreaterThan(professional.instructions.length);
    expect(ultimate.instructions.some((entry) => entry.doubleTeam)).toBe(true);
    expect(ultimate.instructions.some((entry) => entry.attackApproach !== "none")).toBe(true);
    expect(JSON.stringify({ own, opponents })).toBe(before);
    expect("overall" in ultimate).toBe(false);
  });
});
