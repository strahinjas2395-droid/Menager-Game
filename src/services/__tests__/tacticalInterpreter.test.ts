import { describe, expect, it } from "vitest";
import {
  buildTacticalInterpreterMessages,
  interpretTacticalInstructions,
  type TacticalAIProvider,
} from "@/services/tacticalInterpreter";
import type { InstructionRosterPlayer } from "@/engine/directives";

const roster: InstructionRosterPlayer[] = [
  {
    id: "left-back",
    name: "Luka Jovicic",
    firstName: "Luka",
    lastName: "Jovicic",
    squadNumber: 23,
    tacticalNumber: 3,
    position: "LB",
    role: "LB",
  },
  {
    id: "striker-15",
    name: "Milan Petrovic",
    firstName: "Milan",
    lastName: "Petrovic",
    squadNumber: 15,
    tacticalNumber: 9,
    position: "ST",
    role: "ST",
  },
];

function provider(payload: unknown, inspect?: (prompt: string) => void): TacticalAIProvider {
  return {
    model: "test-semantic-model",
    async complete(messages) {
      inspect?.(messages.map((message) => String(message.content)).join("\n"));
      return payload;
    },
  };
}

describe("hosted tactical language intelligence", () => {
  it("passes unmodified, misspelled natural language and roster context to the model", async () => {
    const text = "Lft bak, kep pingin it loong at fiveteen whenever hes free";
    let sentPrompt = "";
    const result = await interpretTacticalInstructions(
      roster,
      [{ key: "lb", text, scope: "player", subjectPlayerId: "left-back" }],
      provider({
        message: {
          tool_calls: [{
            id: "call-1",
            function: {
              name: "submit_tactical_interpretations",
              arguments: JSON.stringify({
                interpretations: [{
                  key: "lb",
                  directives: {
                    directPassing: true,
                    preferredTargetId: "striker-15",
                    preferredTargetName: "Milan Petrovic",
                    targetPriority: 0.96,
                    targetDelivery: "aerial",
                  },
                  unsupported: [],
                }],
              }),
            },
          }],
        },
      }, (prompt) => { sentPrompt = prompt; }),
    );

    expect(sentPrompt).toContain(text);
    expect(sentPrompt).toContain('"squadNumber":15');
    expect(sentPrompt).toContain('"tacticalNumber":9');
    expect(sentPrompt).toContain('"role":"ST"');
    expect(result.warning).toBeUndefined();
    expect(result.interpretations.lb.source).toBe("ai");
    expect(result.interpretations.lb.directives).toMatchObject({
      directPassing: true,
      preferredTargetId: "striker-15",
      preferredTargetName: "Milan Petrovic",
      targetPriority: 0.96,
      targetDelivery: "aerial",
    });
    expect(result.interpretations.lb.understood).toEqual([
      "Prefer direct passes",
      "Seek Milan Petrovic with aerial service",
    ]);
  });

  it("allows a team sentence to assign different behavior to a resolved actor", async () => {
    const result = await interpretTacticalInstructions(
      roster,
      [{ key: "team", text: "Our three should keep looking for Milan over the top", scope: "team" }],
      provider({
        interpretations: [{
          key: "team",
          directives: {},
          assignments: [{
            playerId: "left-back",
            directives: {
              directPassing: true,
              preferredTargetId: "striker-15",
              targetPriority: 0.9,
              targetDelivery: "aerial",
            },
          }],
          unsupported: [],
        }],
      }),
    );

    expect(result.interpretations.team.assignments).toEqual([{
      playerId: "left-back",
      playerName: "Luka Jovicic",
      directives: {
        directPassing: true,
        preferredTargetId: "striker-15",
        preferredTargetName: "Milan Petrovic",
        targetPriority: 0.9,
        targetDelivery: "aerial",
      },
    }]);
  });

  it("rejects hallucinated player ids even if a model returns one", async () => {
    const result = await interpretTacticalInstructions(
      roster,
      [{ key: "lb", text: "Find the striker", scope: "player", subjectPlayerId: "left-back" }],
      provider({
        interpretations: [{
          key: "lb",
          directives: { directPassing: true, preferredTargetId: "made-up-player", targetPriority: 1 },
          unsupported: [],
        }],
      }),
    );
    expect(result.interpretations.lb.directives.directPassing).toBe(true);
    expect(result.interpretations.lb.directives.preferredTargetId).toBeUndefined();
    expect(result.interpretations.lb.unsupported[0]).toContain("not currently on the pitch");
  });

  it("labels the deterministic fallback rather than pretending it understood arbitrary text", async () => {
    const result = await interpretTacticalInstructions(
      roster,
      [{ key: "lb", text: "plz unspool teh moon-string wenever vibes dip", scope: "player", subjectPlayerId: "left-back" }],
      {
        model: "offline",
        async complete() { throw new Error("network unavailable"); },
      },
    );
    expect(result.warning).toBe("network unavailable");
    expect(result.interpretations.lb.source).toBe("offline");
    expect(result.interpretations.lb.understood).toEqual([]);
    expect(result.interpretations.lb.unsupported[0]).toContain("AI is unavailable");
  });

  it("builds a semantic prompt, not a phrase dictionary", () => {
    const messages = buildTacticalInterpreterMessages(
      roster,
      [{ key: "team", text: "Whatever wording the manager invents", scope: "team" }],
    );
    const system = String(messages[0].content);
    expect(system).toContain("intended meaning rather than matching phrases");
    expect(system).toContain("spelling mistakes");
    expect(system).toContain("negation");
  });
});
