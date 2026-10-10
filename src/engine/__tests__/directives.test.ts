import { describe, expect, it } from "vitest";
import {
  compileInstructionPlans,
  instructionContextFingerprint,
  parseInstructions,
  parseSquadInstructions,
  sanitizeDirectives,
  summarizeDirectives,
  type InstructionRosterPlayer,
} from "@/engine/directives";
import { BOOLEAN_INSTRUCTIONS, CHOICE_INSTRUCTIONS } from "@/engine/instructionCatalog";
import type { Player, TacticalDirectives, TacticalInstructionCache } from "@/types";

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

  it("validates every finite catalogue capability and rejects invented values", () => {
    const complete: Record<string, unknown> = Object.fromEntries([
      ...BOOLEAN_INSTRUCTIONS.map((entry, index) => [entry.key, index % 2 === 0]),
      ...CHOICE_INSTRUCTIONS.map((entry) => [entry.key, entry.options.at(-1)!.value]),
    ]);
    complete.preferredTargetId = "nine";
    complete.preferredTargetName = "Number Nine";
    complete.targetPriority = 4;
    complete.targetDelivery = "aerial";
    complete.inventedSuperPower = true;

    const validated = sanitizeDirectives(complete, new Set(["nine"]));
    for (const entry of BOOLEAN_INSTRUCTIONS) expect(typeof validated[entry.key]).toBe("boolean");
    for (const entry of CHOICE_INSTRUCTIONS) {
      expect(validated[entry.key]).toBe(entry.options.at(-1)!.value);
    }
    expect(validated.targetPriority).toBe(1);
    expect((validated as Record<string, unknown>).inventedSuperPower).toBeUndefined();
    expect(sanitizeDirectives({ crossType: "teleport", pressTrigger: "sometimes-ish" }))
      .toEqual({});
  });

  it("merges prose then catalogue then player values with individual final authority", () => {
    const squad = [{ id: "nine", individualInstructions: "" }] as Player[];
    const roster: InstructionRosterPlayer[] = [{
      id: "nine", name: "Number Nine", firstName: "Number", lastName: "Nine",
      squadNumber: 9, tacticalNumber: 9, position: "ST", role: "ST",
    }];
    const fingerprint = instructionContextFingerprint(roster);
    const text = "press and run";
    const cache: TacticalInstructionCache = {
      players: {},
      team: {
        schemaVersion: 1,
        input: text,
        scope: "team",
        contextFingerprint: fingerprint,
        directives: { pressHard: true, supportRun: "runInBehind", passingRisk: "creative" },
        assignments: [{
          playerId: "nine",
          playerName: "Number Nine",
          directives: { shotSelection: "shootOnSight", pressHard: false },
        }],
        understood: [], unsupported: [], source: "local-ai", createdAt: 1,
      },
    };
    const teamOverrides: TacticalDirectives = {
      pressHard: false,
      supportRun: "comeShort",
      passingRisk: "safe",
    };
    const playerOverrides = {
      nine: { pressHard: true, supportRun: "moveIntoChannels", shotSelection: "workIntoBox" } as TacticalDirectives,
    };

    const plans = compileInstructionPlans(
      squad, text, cache, roster, teamOverrides, playerOverrides,
    );
    expect(plans.teamDirectives).toMatchObject({
      pressHard: false,
      supportRun: "comeShort",
      passingRisk: "safe",
    });
    expect(plans.playerDirectives.nine).toMatchObject({
      pressHard: true,
      supportRun: "moveIntoChannels",
      shotSelection: "workIntoBox",
    });
    expect(summarizeDirectives(plans.playerDirectives.nine)).toContain("Support movement: Move into channels");
  });
});
