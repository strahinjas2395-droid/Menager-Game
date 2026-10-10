import { describe, expect, it } from "vitest";
import {
  LOCAL_ENTITY_REFERENCE_LABELS,
  LOCAL_SEMANTIC_LABELS,
  LOCAL_TACTICAL_MODEL_REVISION,
  decodeSemanticDecisions,
  interpretTacticalInstructionsLocally,
  localRosterPlayerDescription,
  resolveMentionedPlayers,
  type LocalTacticalRequest,
  type SemanticIntent,
  type SentenceEmbedder,
} from "@/services/localTacticalInterpreter";
import type { InstructionRosterPlayer } from "@/engine/directives";

interface IntendedMeaning {
  intent: SemanticIntent;
  value?: boolean;
}

function embeddingFor(resolveClause: (text: string) => IntendedMeaning | undefined): SentenceEmbedder {
  return {
    async embed(texts) {
      return texts.map((text) => {
        const vector = new Array<number>(LOCAL_SEMANTIC_LABELS.length).fill(0);
        const labelIndex = LOCAL_SEMANTIC_LABELS.findIndex((label) => label.description === text);
        if (labelIndex >= 0) {
          vector[labelIndex] = 1;
          return vector;
        }

        const meaning = resolveClause(text);
        if (!meaning) return vector;
        const semanticIndex = LOCAL_SEMANTIC_LABELS.findIndex((label) =>
          label.intent === meaning.intent && (meaning.value === undefined || label.value === meaning.value));
        if (semanticIndex >= 0) vector[semanticIndex] = 1;
        return vector;
      });
    },
  };
}

const roster: InstructionRosterPlayer[] = [
  {
    id: "forward-9",
    name: "Milo Savic",
    firstName: "Milo",
    lastName: "Savic",
    squadNumber: 9,
    tacticalNumber: 9,
    position: "ST",
    role: "ST",
  },
  {
    id: "winger-11",
    name: "Luka Petrovic",
    firstName: "Luka",
    lastName: "Petrovic",
    squadNumber: 17,
    tacticalNumber: 11,
    position: "LW",
    role: "LW",
  },
  {
    id: "midfielder-8",
    name: "Nikola Jovic",
    firstName: "Nikola",
    lastName: "Jovic",
    squadNumber: 8,
    tacticalNumber: 8,
    position: "CM",
    role: "CM",
  },
];

async function interpret(request: Omit<LocalTacticalRequest, "key">, embedder: SentenceEmbedder) {
  const batch = await interpretTacticalInstructionsLocally(
    roster,
    [{ key: "test", ...request }],
    embedder,
  );
  return batch.interpretations.test;
}

describe("browser-local tactical semantic interpreter", () => {
  it("pins the cached browser model to an immutable revision", () => {
    expect(LOCAL_TACTICAL_MODEL_REVISION).toMatch(/^[a-f0-9]{40}$/);
  });

  it("decodes the closest constrained capability rather than arbitrary model output", () => {
    const desired = LOCAL_SEMANTIC_LABELS.findIndex((label) =>
      label.intent === "riskyPasses" && label.value === true);
    const vector = new Array<number>(LOCAL_SEMANTIC_LABELS.length).fill(0);
    vector[desired] = 1;
    const labelVectors = LOCAL_SEMANTIC_LABELS.map((_, index) => {
      const labelVector = new Array<number>(LOCAL_SEMANTIC_LABELS.length).fill(0);
      labelVector[index] = 1;
      return labelVector;
    });

    expect(decodeSemanticDecisions([vector], labelVectors)).toEqual([
      expect.objectContaining({ clauseIndex: 0, intent: "riskyPasses", value: true, confidence: 1 }),
    ]);
  });

  it("understands paraphrased intent and resolves a misspelled on-pitch recipient", async () => {
    const embedder = embeddingFor((clause) => {
      if (clause.includes("Glide beyond challenges")) return { intent: "dribbleMore", value: true };
      if (clause.includes("float service")) return { intent: "targetAerial", value: true };
      return undefined;
    });

    const result = await interpret({
      text: "Glide beyond challenges; float service toward Petrovik",
      scope: "team",
    }, embedder);

    expect(result.source).toBe("local-ai");
    expect(result.directives).toMatchObject({
      dribbleMore: true,
      preferredTargetId: "winger-11",
      preferredTargetName: "Luka Petrovic",
      targetDelivery: "aerial",
    });
    expect(result.unsupported).toEqual([]);
  });

  it("semantically resolves an unanticipated positional reference to a constrained roster id", async () => {
    const dimensions = LOCAL_SEMANTIC_LABELS.length + 2 + roster.length;
    const pressIndex = LOCAL_SEMANTIC_LABELS.findIndex((label) =>
      label.intent === "pressHard" && label.value === true);
    const playerDescriptions = roster.map(localRosterPlayerDescription);
    const embedder: SentenceEmbedder = {
      async embed(texts) {
        return texts.map((text) => {
          const vector = new Array<number>(dimensions).fill(0);
          const tacticalIndex = LOCAL_SEMANTIC_LABELS.findIndex((label) => label.description === text);
          if (tacticalIndex >= 0) vector[tacticalIndex] = 1;
          if (text === LOCAL_ENTITY_REFERENCE_LABELS.specific) vector[LOCAL_SEMANTIC_LABELS.length] = 1;
          if (text === LOCAL_ENTITY_REFERENCE_LABELS.team) vector[LOCAL_SEMANTIC_LABELS.length + 1] = 1;
          const rosterIndex = playerDescriptions.indexOf(text);
          if (rosterIndex >= 0) vector[LOCAL_SEMANTIC_LABELS.length + 2 + rosterIndex] = 1;
          if (text.includes("operator drifting in from the left flank")) {
            vector[pressIndex] = 1;
            vector[LOCAL_SEMANTIC_LABELS.length] = 1;
            vector[LOCAL_SEMANTIC_LABELS.length + 2 + 1] = 1;
          }
          return vector;
        });
      },
    };

    const result = await interpret({
      text: "Have the operator drifting in from the left flank hunt every loose control",
      scope: "team",
    }, embedder);

    expect(result.assignments).toEqual([
      expect.objectContaining({ playerId: "winger-11", directives: { pressHard: true } }),
    ]);
    expect(result.directives.pressHard).toBeUndefined();
  });

  it("maps semantic negation, caches capabilities and keeps player-specific clauses in roster IDs", async () => {
    const baseEmbedder = embeddingFor((clause) => {
      if (clause.includes("hunt every first touch")) return { intent: "pressHard", value: true };
      if (clause.includes("don't charge")) return { intent: "pressHard", value: false };
      return undefined;
    });
    const embeddedBatchSizes: number[] = [];
    const embedder: SentenceEmbedder = {
      async embed(texts) {
        embeddedBatchSizes.push(texts.length);
        return baseEmbedder.embed(texts);
      },
    };

    const assignment = await interpret({
      text: "Milo Savik must hunt every first touch",
      scope: "team",
    }, embedder);
    expect(assignment.assignments).toEqual([
      expect.objectContaining({ playerId: "forward-9", directives: { pressHard: true } }),
    ]);
    expect(assignment.directives.pressHard).toBeUndefined();

    const negated = await interpret({
      text: "don't charge at every defender",
      scope: "player",
      subjectPlayerId: "forward-9",
    }, embedder);
    expect(negated.directives.pressHard).toBe(false);
    expect(negated.understood).toContain("Do not join the aggressive press");
    expect(negated.unsupported).toEqual([]);
    expect(embeddedBatchSizes[0]).toBeGreaterThan(LOCAL_SEMANTIC_LABELS.length + 1);
    expect(embeddedBatchSizes[1]).toBe(1);
  });

  it("rejects an ambiguous shared role instead of choosing by roster order", () => {
    const sameRole = roster.slice(0, 2).map((player) => ({ ...player, tacticalRole: "Winger" as const }));
    expect(resolveMentionedPlayers("the winger should press", sameRole)).toEqual([]);
  });

  it("does not confuse short position codes with ordinary word fragments", async () => {
    const result = await interpret({
      text: "stay structured",
      scope: "team",
    }, embeddingFor(() => ({ intent: "holdPosition", value: true })));

    expect(result.directives.holdPosition).toBe(true);
    expect(result.assignments).toBeUndefined();
  });

  it("rejects invented targets, self-targeting and low-confidence text", async () => {
    const targetEmbedder = embeddingFor((clause) =>
      clause.includes("toward") ? { intent: "targetGround", value: true } : undefined);

    const selfTarget = await interpret({
      text: "play everything toward Milo",
      scope: "player",
      subjectPlayerId: "forward-9",
    }, targetEmbedder);
    expect(selfTarget.directives.preferredTargetId).toBeUndefined();

    const unknown = await interpret({
      text: "paint the afternoon purple",
      scope: "team",
    }, embeddingFor(() => undefined));
    expect(unknown.directives).toEqual({});
    expect(unknown.understood).toEqual([]);
    expect(unknown.unsupported).toContain("Not confidently mapped by local AI: “paint the afternoon purple”.");
  });
});
