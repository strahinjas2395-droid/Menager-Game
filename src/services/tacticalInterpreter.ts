"use client";

/**
 * Hosted semantic interpreter for natural-language tactical instructions.
 *
 * Puter supplies a small cloud model without a developer API key or a local
 * model download. The model never controls the simulation directly: it calls
 * one constrained tool, then every id/value is validated here before the
 * result can be persisted or posted to the match worker.
 */
import type { ChatMessage, ChatResponse, Tool } from "@heyputer/puter.js";
import type {
  TacticalDirectives,
  TacticalInstructionInterpretation,
  TacticalPlayerAssignment,
} from "@/types";
import {
  createOfflineInterpretation,
  instructionContextFingerprint,
  normalizeInstructionText,
  sanitizeDirectives,
  summarizeDirectives,
  type InstructionRosterPlayer,
} from "@/engine/directives";

export const TACTICAL_AI_MODEL = "gpt-5.4-nano";

export interface TacticalInstructionRequest {
  key: string;
  text: string;
  scope: "team" | "player";
  subjectPlayerId?: string;
}

export interface TacticalInterpretationBatch {
  interpretations: Record<string, TacticalInstructionInterpretation>;
  /** Present when at least one entry had to use the basic offline fallback. */
  warning?: string;
}

export interface TacticalAIProvider {
  complete(messages: ChatMessage[], tool: Tool): Promise<unknown>;
  model: string;
}

const DIRECTIVE_PROPERTIES: Record<string, unknown> = {
  holdPosition: { type: "boolean", description: "Keep the current structural position; suppress roaming and attacking movement." },
  forwardRuns: { type: "boolean", description: "Make proactive attacking runs, overlaps, or runs beyond the ball." },
  roam: { type: "boolean", description: "Leave the normal positional lane to find space." },
  stayWide: { type: "boolean", description: "Maintain width near the touchline." },
  cutInside: { type: "boolean", description: "Move from a wide lane into central or half-space positions." },
  defensiveDuty: { type: "boolean", description: "Adopt a substantially deeper defensive role, track opponents and defend even if nominally a forward." },
  shootFromDistance: { type: "boolean", description: "Increase sensible shooting attempts from outside the penalty area, never from absurd range." },
  avoidShooting: { type: "boolean", description: "Look to pass rather than shoot." },
  dribbleMore: { type: "boolean", description: "Try to beat opponents with the ball more often." },
  dribbleLess: { type: "boolean", description: "Release the ball early and avoid carrying it into challenges." },
  riskyPasses: { type: "boolean", description: "Attempt more incisive through balls and difficult progressive passes." },
  shortPassing: { type: "boolean", description: "Prefer short combinations and passes to feet." },
  directPassing: { type: "boolean", description: "Prefer longer, vertical service that bypasses lines." },
  targetMan: { type: "boolean", description: "Receive with back to goal, protect the ball and bring teammates into play." },
  earlyCross: { type: "boolean", description: "Cross earlier or more often from wide positions." },
  switchPlay: { type: "boolean", description: "Look for large diagonal switches to the opposite flank." },
  clearImmediately: { type: "boolean", description: "In the defensive third or under dangerous pressure, clear immediately instead of retaining possession." },
  tightMarking: { type: "boolean", description: "Stay goal-side and close to an opponent." },
  pressHard: { type: "boolean", description: "Close down the ball with high effort and urgency." },
  pressLess: { type: "boolean", description: "Protect shape and avoid closing down the ball." },
  conserveEnergy: { type: "boolean", description: "Reduce sprinting and choose moments to engage." },
  preferredTargetId: { type: "string", description: "Exact id from ROSTER of a deliberately preferred pass recipient. Omit when unresolved or not requested." },
  preferredTargetName: { type: "string", description: "Exact display name of preferredTargetId from ROSTER." },
  targetPriority: { type: "number", minimum: 0, maximum: 1, description: "How strongly to seek the recipient; 1 means first option whenever a plausible lane exists." },
  targetDelivery: { type: "string", enum: ["ground", "aerial", "mixed"], description: "Requested service type to the preferred recipient." },
};

const DIRECTIVES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: DIRECTIVE_PROPERTIES,
};

const INTERPRET_TOOL: Tool = {
  type: "function",
  function: {
    name: "submit_tactical_interpretations",
    description: "Return validated football tactical meanings for every supplied manager note.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["interpretations"],
      properties: {
        interpretations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "directives", "unsupported"],
            properties: {
              key: { type: "string" },
              directives: DIRECTIVES_SCHEMA,
              assignments: {
                type: "array",
                description: "Only for a team note that addresses particular roster players or roles.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["playerId", "directives"],
                  properties: {
                    playerId: { type: "string", description: "Exact actor id from ROSTER." },
                    directives: DIRECTIVES_SCHEMA,
                  },
                },
              },
              unsupported: {
                type: "array",
                items: { type: "string" },
                description: "Any requested meaning that cannot be represented, is ambiguous, or names no roster player.",
              },
            },
          },
        },
      },
    },
  },
};

function systemPrompt(): string {
  return [
    "You are the semantic tactical coach inside a football-management simulation.",
    "Understand the manager's intended meaning rather than matching phrases. Accept any language the manager uses and be robust to spelling mistakes, slang, omitted words, paraphrase, compound instructions, and negation.",
    "Convert only into the supplied tactical tool schema. Never invent a player id, name, number, role, or capability.",
    "A player can be referenced by first name, surname, squad number, tactical XI number, position, or formation role. Resolve that reference from ROSTER. A non-null tacticalNumber/role marks a player currently on the pitch; do not choose a bench or out-of-squad player as a pass recipient. If two players are genuinely ambiguous, report it in unsupported instead of guessing.",
    "For player scope, directives apply to SUBJECT; another player mentioned as a recipient belongs in preferredTargetId. For team scope, directives apply to everyone unless the wording addresses actors. Put actor-specific behavior in assignments, with one assignment for each clearly addressed roster player.",
    "Use preferredTargetId only for deliberate passes/service to that teammate. Set targetPriority according to emphasis and targetDelivery from the requested ball type. Long/lofted/high service is aerial; passes to feet/along the floor are ground.",
    "Use defensiveDuty when an attacker is asked to become part of the defensive shape, track back, or defend deeply; this is stronger than merely holdPosition. Use clearImmediately only for urgent safety-first disposal in dangerous defensive situations.",
    "Honor negatives. A false value may explicitly override a team instruction, but omit unrelated fields. Do not infer aggressive pressing merely from the generic word defend.",
    "unsupported must preserve any meaningful request the engine cannot enact. Call the tool exactly once and include every REQUEST key exactly once.",
  ].join(" ");
}

export function buildTacticalInterpreterMessages(
  roster: InstructionRosterPlayer[],
  requests: TacticalInstructionRequest[],
): ChatMessage[] {
  const rosterPayload = roster.map((player) => ({
    id: player.id,
    name: player.name,
    squadNumber: player.squadNumber,
    tacticalNumber: player.tacticalNumber ?? null,
    position: player.position,
    role: player.role ?? null,
  }));
  const requestPayload = requests.map((request) => ({
    key: request.key,
    scope: request.scope,
    subjectPlayerId: request.subjectPlayerId ?? null,
    text: normalizeInstructionText(request.text),
  }));
  return [
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content: `ROSTER\n${JSON.stringify(rosterPayload)}\n\nREQUESTS\n${JSON.stringify(requestPayload)}`,
    },
  ];
}

const puterProvider: TacticalAIProvider = {
  model: TACTICAL_AI_MODEL,
  async complete(messages, tool) {
    const { puter } = await import("@heyputer/puter.js");
    return puter.ai.chat(messages, {
      model: TACTICAL_AI_MODEL,
      temperature: 0,
      max_tokens: 2600,
      reasoning_effort: "minimal",
      verbosity: "low",
      normalize: true,
      tools: [tool],
    });
  },
};

function parseJsonObject(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI returned no tactical plan.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function providerPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") throw new Error("The AI returned an invalid response.");
  const response = value as ChatResponse;
  const toolCall = response.message?.tool_calls?.find(
    (call) => call.function?.name === INTERPRET_TOOL.function.name,
  );
  if (toolCall?.function?.arguments) return parseJsonObject(toolCall.function.arguments);
  const content = response.message?.content;
  if (typeof content === "string") return parseJsonObject(content);
  if (Array.isArray(content)) {
    const text = content.map((part) => typeof part === "string" ? part : "").join("");
    if (text) return parseJsonObject(text);
  }
  // Tests and alternative adapters may return the tool payload directly.
  if ("interpretations" in (value as Record<string, unknown>)) return value;
  throw new Error("The AI did not submit a tactical interpretation.");
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 180))
    .filter(Boolean)
    .slice(0, 10);
}

function validateAssignments(
  value: unknown,
  rosterById: ReadonlyMap<string, InstructionRosterPlayer>,
  validIds: ReadonlySet<string>,
): TacticalPlayerAssignment[] {
  if (!Array.isArray(value)) return [];
  const byPlayer = new Map<string, TacticalPlayerAssignment>();
  for (const raw of value.slice(0, rosterById.size)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.playerId !== "string") continue;
    const player = rosterById.get(item.playerId);
    if (!player) continue;
    const directives = sanitizeDirectives(item.directives, validIds);
    if (directives.preferredTargetId === player.id) {
      delete directives.preferredTargetId;
      delete directives.preferredTargetName;
      delete directives.targetPriority;
      delete directives.targetDelivery;
    } else if (directives.preferredTargetId) {
      directives.preferredTargetName = rosterById.get(directives.preferredTargetId)?.name;
    }
    if (!Object.keys(directives).length) continue;
    byPlayer.set(player.id, { playerId: player.id, playerName: player.name, directives });
  }
  return [...byPlayer.values()];
}

/**
 * Interpret one or many notes in one cloud request. If the service is blocked,
 * unauthenticated or temporarily unavailable, every item receives a visibly
 * labelled offline result rather than preventing the match from running.
 */
export async function interpretTacticalInstructions(
  roster: InstructionRosterPlayer[],
  requests: TacticalInstructionRequest[],
  provider: TacticalAIProvider = puterProvider,
): Promise<TacticalInterpretationBatch> {
  const active = requests.filter((request) => normalizeInstructionText(request.text));
  if (!active.length) return { interpretations: {} };

  const fingerprint = instructionContextFingerprint(roster);
  const validTargetIds = new Set(
    roster.filter((player) => player.tacticalNumber !== undefined && player.role !== undefined)
      .map((player) => player.id),
  );
  const rosterById = new Map(roster.map((player) => [player.id, player]));
  const requestByKey = new Map(active.map((request) => [request.key, request]));

  try {
    const response = await provider.complete(buildTacticalInterpreterMessages(roster, active), INTERPRET_TOOL);
    const payload = providerPayload(response);
    const rawItems = (payload as { interpretations?: unknown }).interpretations;
    if (!Array.isArray(rawItems)) throw new Error("The AI tactical plan was incomplete.");

    const interpretations: Record<string, TacticalInstructionInterpretation> = {};
    for (const raw of rawItems.slice(0, active.length * 2)) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      if (typeof item.key !== "string") continue;
      const request = requestByKey.get(item.key);
      if (!request || interpretations[request.key]) continue;

      const validationWarnings: string[] = [];
      const rawDirectives = item.directives && typeof item.directives === "object"
        ? item.directives as Record<string, unknown>
        : {};
      const directives = sanitizeDirectives(rawDirectives, validTargetIds);
      if (typeof rawDirectives.preferredTargetId === "string" && !directives.preferredTargetId) {
        validationWarnings.push("The proposed pass recipient is not currently on the pitch, so no target was applied.");
      }
      if (directives.preferredTargetId === request.subjectPlayerId) {
        delete directives.preferredTargetId;
        delete directives.preferredTargetName;
        delete directives.targetPriority;
        delete directives.targetDelivery;
        validationWarnings.push("A player cannot pass to himself, so that target was ignored.");
      } else if (directives.preferredTargetId) {
        directives.preferredTargetName = rosterById.get(directives.preferredTargetId)?.name;
      }
      const assignments = request.scope === "team"
        ? validateAssignments(item.assignments, rosterById, validTargetIds)
        : [];
      if (request.scope === "team" && Array.isArray(item.assignments) && item.assignments.length > assignments.length) {
        validationWarnings.push("At least one addressed player or role could not be resolved safely.");
      }
      // UI evidence is derived from the validated engine contract, never from
      // model prose that could overstate what the simulator will actually do.
      const semanticSummary = [
        ...summarizeDirectives(directives),
        ...assignments.flatMap((assignment) =>
          summarizeDirectives(assignment.directives).map((label) => `${assignment.playerName}: ${label}`),
        ),
      ];
      const unsupported = [...stringList(item.unsupported), ...validationWarnings];
      if (!semanticSummary.length && !unsupported.length) {
        unsupported.push("No supported match-engine behavior could be mapped from this instruction.");
      }

      interpretations[request.key] = {
        schemaVersion: 1,
        input: normalizeInstructionText(request.text),
        scope: request.scope,
        subjectPlayerId: request.subjectPlayerId,
        contextFingerprint: fingerprint,
        directives,
        assignments: assignments.length ? assignments : undefined,
        understood: semanticSummary.slice(0, 10),
        unsupported: unsupported.slice(0, 10),
        source: "ai",
        model: provider.model,
        createdAt: Date.now(),
      };
    }

    const missing = active.filter((request) => !interpretations[request.key]);
    if (missing.length) throw new Error("The AI omitted part of the tactical request.");
    return { interpretations };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "The AI interpreter is unavailable.";
    return {
      warning,
      interpretations: Object.fromEntries(active.map((request) => [
        request.key,
        createOfflineInterpretation(request.text, request.scope, fingerprint, request.subjectPlayerId),
      ])),
    };
  }
}
