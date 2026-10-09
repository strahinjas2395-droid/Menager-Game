import { describe, expect, it } from "vitest";
import { parseInstructions, parseSquadInstructions, summarizeDirectives } from "@/engine/directives";
import type { Player } from "@/types";

describe("individual-instruction tactical interpreter", () => {
  it("translates natural attacking instructions into structured decisions", () => {
    const d = parseInstructions(
      "Stay wide, take on defenders and whip early crosses. Make runs in behind and shoot from distance.",
    );
    expect(d).toMatchObject({
      stayWide: true,
      dribbleMore: true,
      earlyCross: true,
      forwardRuns: true,
      shootFromDistance: true,
    });
  });

  it("understands playmaker, target-man and defensive language", () => {
    const d = parseInstructions(
      "Roam freely and play killer through balls. Act as a target man and hold up the ball. Press aggressively and mark tightly.",
    );
    expect(d).toMatchObject({
      roam: true,
      riskyPasses: true,
      targetMan: true,
      pressHard: true,
      tightMarking: true,
    });
    expect(summarizeDirectives(d)).toContain("Hold up play");
  });

  it("honours explicit negatives instead of treating keywords as commands", () => {
    const d = parseInstructions("Don't overlap and don't roam. Do not press hard. Dribble less and keep it short.");
    expect(d.holdPosition).toBe(true);
    expect(d.forwardRuns).not.toBe(true);
    expect(d.roam).not.toBe(true);
    expect(d.pressHard).not.toBe(true);
    expect(d.dribbleLess).toBe(true);
    expect(d.shortPassing).toBe(true);
  });

  it("only emits squad entries that contain understood instructions", () => {
    const squad = [
      { id: "winger", individualInstructions: "Stay wide and cross early" },
      { id: "blank", individualInstructions: "" },
      { id: "unknown", individualInstructions: "Enjoy yourself out there" },
    ] as Player[];
    expect(parseSquadInstructions(squad)).toEqual({
      winger: { stayWide: true, earlyCross: true },
    });
  });
});
