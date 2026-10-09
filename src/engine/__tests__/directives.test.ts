import { describe, expect, it } from "vitest";
import {
  compileInstructionPlans,
  instructionContextFingerprint,
  parseInstructions,
  parseSquadInstructions,
  summarizeDirectives,
  type InstructionRosterPlayer,
} from "@/engine/directives";
import type { Player, TacticalInstructionCache } from "@/types";

describe("individual-instruction tactical interpreter", () => {
  it("translates natural attacking instructions into structured decisions", () => {
    const d = parseInstructions(
      "Stay wide, take on defenders and whip early crosses. Make runs in behind and take more shots from outside the box.",
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

  it("compiles validated team-wide and role-specific AI plans into simulator directives", () => {
    const squad = [
      { id: "lb", individualInstructions: "" },
      { id: "striker", individualInstructions: "" },
    ] as Player[];
    const roster: InstructionRosterPlayer[] = [
      { id: "lb", name: "Left Back", firstName: "Left", lastName: "Back", squadNumber: 23, tacticalNumber: 3, position: "LB", role: "LB" },
      { id: "striker", name: "Target Forward", firstName: "Target", lastName: "Forward", squadNumber: 15, tacticalNumber: 9, position: "ST", role: "ST" },
    ];
    const fingerprint = instructionContextFingerprint(roster);
    const cache: TacticalInstructionCache = {
      players: {},
      team: {
        schemaVersion: 1,
        input: "Clear danger at once; our left-back should seek number fifteen over the top.",
        scope: "team",
        contextFingerprint: fingerprint,
        directives: { clearImmediately: true },
        assignments: [{
          playerId: "lb",
          playerName: "Left Back",
          directives: {
            directPassing: true,
            preferredTargetId: "striker",
            preferredTargetName: "Target Forward",
            targetPriority: 0.95,
            targetDelivery: "aerial",
          },
        }],
        understood: ["Clear danger immediately", "Left Back seeks Target Forward over the top"],
        unsupported: [],
        source: "ai",
        model: "test",
        createdAt: 1,
      },
    };
    const plans = compileInstructionPlans(squad, cache.team!.input, cache, roster);
    expect(plans.teamDirectives).toEqual({ clearImmediately: true });
    expect(plans.playerDirectives.lb).toMatchObject({
      directPassing: true,
      preferredTargetId: "striker",
      targetPriority: 0.95,
      targetDelivery: "aerial",
    });
  });

  it("invalidates cached entity resolution when tactical numbers or roles change", () => {
    const squad = [{ id: "lb", individualInstructions: "play naturally" }] as Player[];
    const original: InstructionRosterPlayer[] = [
      { id: "lb", name: "Left Back", firstName: "Left", lastName: "Back", squadNumber: 23, tacticalNumber: 3, position: "LB", role: "LB" },
    ];
    const changed = [{ ...original[0], tacticalNumber: 7, role: "RW" }];
    const cache: TacticalInstructionCache = {
      players: {
        lb: {
          schemaVersion: 1,
          input: "play naturally",
          scope: "player",
          subjectPlayerId: "lb",
          contextFingerprint: instructionContextFingerprint(original),
          directives: { defensiveDuty: true },
          understood: ["Defend deeply"],
          unsupported: [],
          source: "ai",
          createdAt: 1,
        },
      },
    };
    expect(compileInstructionPlans(squad, "", cache, original).playerDirectives.lb)
      .toEqual({ defensiveDuty: true, forwardRuns: false });
    expect(compileInstructionPlans(squad, "", cache, changed).playerDirectives.lb).toBeUndefined();
  });
});
