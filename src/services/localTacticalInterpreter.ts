"use client";

/**
 * Small no-account semantic interpreter.
 *
 * A quantized sentence-embedding model is downloaded on first use, cached by
 * the browser, and then runs through WASM on the user's device. It classifies
 * meaning against the finite set of movements the match engine can genuinely
 * execute; it is not a phrase dictionary and it never invents engine fields.
 */
import type {
  TacticalDirectives,
  TacticalInstructionInterpretation,
  TacticalPlayerAssignment,
} from "@/types";
import {
  instructionContextFingerprint,
  normalizeInstructionText,
  sanitizeDirectives,
  summarizeDirectives,
  type InstructionRosterPlayer,
} from "@/engine/directives";
import {
  BOOLEAN_INSTRUCTIONS,
  CHOICE_INSTRUCTIONS,
  type BooleanDirectiveKey,
  type ChoiceDirectiveKey,
} from "@/engine/instructionCatalog";

export const LOCAL_TACTICAL_MODEL = "Xenova/all-MiniLM-L6-v2";
export const LOCAL_TACTICAL_MODEL_REVISION = "5f8986ea538762fd82a43a768d583a5a9d71d1ec";
export const LOCAL_TACTICAL_MODEL_LABEL = "MiniLM-L6 local semantic AI";
const TRANSFORMERS_RUNTIME = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js";
const TRANSFORMERS_WASM = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/";

export interface LocalTacticalRequest {
  key: string;
  text: string;
  scope: "team" | "player";
  subjectPlayerId?: string;
}

export interface LocalTacticalBatch {
  interpretations: Record<string, TacticalInstructionInterpretation>;
}

export interface SentenceEmbedder {
  embed(texts: string[]): Promise<number[][]>;
}

export type { BooleanDirectiveKey } from "@/engine/instructionCatalog";

export type SemanticIntent =
  | BooleanDirectiveKey
  | `choice:${ChoiceDirectiveKey}:${string}`
  | "targetGround"
  | "targetAerial"
  | "targetMixed";

export interface SemanticLabel {
  intent: SemanticIntent;
  /** Mutually exclusive labels share a group, so only the strongest survives. */
  group: string;
  value: boolean;
  description: string;
}

export interface SemanticDecision {
  clauseIndex: number;
  intent: SemanticIntent;
  group: string;
  value: boolean;
  confidence: number;
}

/** Descriptions define executable capabilities, not phrases a manager must
 * memorise. Sentence embeddings map novel language to this finite contract. */
export const LOCAL_SEMANTIC_LABELS: readonly SemanticLabel[] = [
  ...BOOLEAN_INSTRUCTIONS.flatMap((entry) => [
    { intent: entry.key, group: entry.key, value: true, description: entry.onDescription },
    { intent: entry.key, group: entry.key, value: false, description: entry.offDescription },
  ] satisfies SemanticLabel[]),
  ...CHOICE_INSTRUCTIONS.flatMap((entry) => entry.options.map((entryOption) => ({
    intent: `choice:${entry.key}:${entryOption.value}` as SemanticIntent,
    group: entry.key,
    value: true,
    description: `${entry.label}. ${entryOption.description}`,
  }))),
  { intent: "targetGround", group: "preferredTarget", value: true, description: "Deliberately pass to the named teammate with the ball played along the ground to feet." },
  { intent: "targetAerial", group: "preferredTarget", value: true, description: "Deliberately seek the named teammate with long high aerial service." },
  { intent: "targetMixed", group: "preferredTarget", value: true, description: "Make the named teammate a preferred passing target using any suitable delivery." },
];

export const LOCAL_ENTITY_REFERENCE_LABELS = {
  specific: "This instruction explicitly identifies one particular footballer by name, shirt number, pitch position, or tactical role.",
  team: "This instruction addresses the whole team and does not identify any particular footballer.",
} as const;

const POSITION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  GK: "goalkeeper, keeper",
  CB: "central defender, centre-back",
  RB: "right-back, right-sided defender",
  LB: "left-back, left-sided defender",
  CDM: "defensive midfielder, holding midfielder",
  CM: "central midfielder",
  CAM: "attacking midfielder, number ten",
  RW: "right winger, right-sided attacker",
  LW: "left winger, left-sided attacker",
  ST: "striker, centre forward",
};

function readableRole(role: string | undefined): string | undefined {
  return role?.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
}

/** A semantic roster identity lets the model connect novel role wording to a
 * constrained player id without sending squad data to a server. */
export function localRosterPlayerDescription(player: InstructionRosterPlayer): string {
  const position = POSITION_DESCRIPTIONS[player.position] ?? readableRole(player.position) ?? player.position;
  const formationRole = POSITION_DESCRIPTIONS[player.role ?? ""] ?? readableRole(player.role);
  const parts = [
    `${player.name}.`,
    `Squad shirt number ${player.squadNumber}.`,
    player.tacticalNumber !== undefined ? `Lineup number ${player.tacticalNumber}.` : undefined,
    `Football position: ${position} (${player.position}).`,
    formationRole ? `Formation role: ${formationRole} (${player.role}).` : undefined,
    player.tacticalRole ? `Tactical role: ${readableRole(player.tacticalRole)}.` : undefined,
    player.duty ? `Duty: ${player.duty}.` : undefined,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" ");
}

interface TransformersTensor {
  tolist(): number[][];
}

interface FeatureExtractor {
  (texts: string[], options: { pooling: "mean"; normalize: true }): Promise<TransformersTensor>;
}

interface TransformersModule {
  env: {
    allowLocalModels: boolean;
    allowRemoteModels: boolean;
    useBrowserCache: boolean;
    backends?: { onnx?: { wasm?: { wasmPaths?: string; numThreads?: number } } };
  };
  pipeline(
    task: "feature-extraction",
    model: string,
    options: { quantized: true; revision: string },
  ): Promise<FeatureExtractor>;
}

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function loadFeatureExtractor(): Promise<FeatureExtractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const transformers = await import(/* webpackIgnore: true */ TRANSFORMERS_RUNTIME) as unknown as TransformersModule;
      transformers.env.allowLocalModels = false;
      transformers.env.allowRemoteModels = true;
      transformers.env.useBrowserCache = true;
      const wasm = transformers.env.backends?.onnx?.wasm;
      if (wasm) {
        wasm.wasmPaths = TRANSFORMERS_WASM;
        wasm.numThreads = 1;
      }
      return transformers.pipeline("feature-extraction", LOCAL_TACTICAL_MODEL, {
        quantized: true,
        revision: LOCAL_TACTICAL_MODEL_REVISION,
      });
    })().catch((error) => {
      extractorPromise = null;
      throw error;
    });
  }
  return extractorPromise;
}

export const browserSentenceEmbedder: SentenceEmbedder = {
  async embed(texts) {
    const extractor = await loadFeatureExtractor();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    return output.tolist();
  },
};

// Capability descriptions never change during a session. Retaining their
// vectors avoids re-embedding the whole catalogue after each edited note.
const labelVectorCache = new WeakMap<SentenceEmbedder, number[][]>();

interface SemanticRosterVectors {
  referenceVectors: [number[], number[]];
  playerVectors: number[][];
}

const rosterVectorCache = new WeakMap<SentenceEmbedder, Map<string, SemanticRosterVectors>>();

function dot(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let value = 0;
  for (let i = 0; i < length; i++) value += a[i] * b[i];
  return value;
}

/** Pure decoding is exported so classification policy is testable without
 * downloading the browser model in Vitest. */
export function decodeSemanticDecisions(
  clauseVectors: number[][],
  labelVectors: number[][],
  minimumConfidence = 0.32,
): SemanticDecision[] {
  const bestByGroup = new Map<string, SemanticDecision>();
  clauseVectors.forEach((clause, clauseIndex) => {
    const ranked = labelVectors
      .map((label, labelIndex) => ({ labelIndex, confidence: dot(clause, label) }))
      .sort((a, b) => b.confidence - a.confidence || a.labelIndex - b.labelIndex);
    const best = ranked[0];
    const next = ranked[1];
    if (!best || best.confidence < minimumConfidence) return;
    // Close alternatives are ambiguous even when they are opposite values of
    // the same intent; guessing a negation would be tactically unsafe.
    if (next && best.confidence - next.confidence < 0.012) return;
    const semantic = LOCAL_SEMANTIC_LABELS[best.labelIndex];
    if (!semantic) return;
    const decision: SemanticDecision = {
      clauseIndex,
      intent: semantic.intent,
      group: semantic.group,
      value: semantic.value,
      confidence: best.confidence,
    };
    const previous = bestByGroup.get(semantic.group);
    if (!previous || decision.confidence > previous.confidence) bestByGroup.set(semantic.group, decision);
  });
  return [...bestByGroup.values()].sort((a, b) => a.clauseIndex - b.clauseIndex || b.confidence - a.confidence);
}

function clauses(text: string): string[] {
  const normalized = normalizeInstructionText(text);
  const parts = normalized
    .split(/(?:[;,.!?]+|\b(?:and|but|while|then|also)\b)/iu)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
  return parts.length ? parts : [normalized];
}

function normalizedIdentity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function tokenSimilar(token: string, candidate: string): boolean {
  if (token === candidate) return true;
  if (candidate.length < 4 || token.length < 3) return false;
  const allowed = candidate.length >= 8 ? 2 : 1;
  return Math.abs(token.length - candidate.length) <= allowed && editDistance(token, candidate) <= allowed;
}

function playerMatchPosition(text: string, player: InstructionRosterPlayer): number {
  const normalized = normalizedIdentity(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const names = [player.firstName, player.lastName, player.name]
    .map(normalizedIdentity)
    .filter(Boolean);
  const padded = ` ${normalized} `;
  const exact = names
    .map((name) => padded.indexOf(` ${name} `))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (exact !== undefined) return exact;

  for (const name of names.slice(0, 2)) {
    const index = words.findIndex((word) => tokenSimilar(word, name));
    if (index >= 0) return index * 10;
  }

  const numericText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const numberPatterns = [player.squadNumber, player.tacticalNumber]
    .filter((number): number is number => number !== undefined)
    .map((number) => new RegExp(`(?:#\\s*|number\\s+|no\\.?\\s*)${number}(?:\\b|$)`, "iu"));
  const numberIndex = numberPatterns
    .map((pattern) => numericText.search(pattern))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (numberIndex !== undefined) return numberIndex;

  const roleNames = [player.tacticalRole, player.role, player.position]
    .filter((role): role is string => Boolean(role))
    .map((role) => normalizedIdentity(role.replace(/([a-z])([A-Z])/g, "$1 $2")));
  for (const role of roleNames) {
    const roleIndex = role.includes(" ")
      ? padded.indexOf(` ${role} `)
      : words.indexOf(role);
    if (roleIndex >= 0) return roleIndex + 1000;
  }
  return -1;
}

export function resolveMentionedPlayers(
  text: string,
  roster: InstructionRosterPlayer[],
): InstructionRosterPlayer[] {
  const matches = roster
    .map((player) => ({ player, position: playerMatchPosition(text, player) }))
    .filter(({ position }) => position >= 0);
  const positionCounts = new Map<number, number>();
  for (const match of matches) {
    positionCounts.set(match.position, (positionCounts.get(match.position) ?? 0) + 1);
  }
  // A shared first name or role at the same textual location is ambiguous. Do
  // not turn array/id ordering into a tactical choice.
  return matches
    .filter(({ position }) => positionCounts.get(position) === 1)
    .sort((a, b) => a.position - b.position || a.player.id.localeCompare(b.player.id))
    .map(({ player }) => player);
}

function resolveSemanticPlayerReference(
  clauseVector: number[],
  activePlayers: InstructionRosterPlayer[],
  vectors: SemanticRosterVectors,
): InstructionRosterPlayer[] {
  const [specificVector, teamVector] = vectors.referenceVectors;
  const specificScore = dot(clauseVector, specificVector);
  const teamScore = dot(clauseVector, teamVector);
  if (specificScore < 0.32 || specificScore - teamScore < 0.025) return [];

  const ranked = vectors.playerVectors
    .map((vector, index) => ({ index, confidence: dot(clauseVector, vector) }))
    .sort((a, b) => b.confidence - a.confidence || a.index - b.index);
  const best = ranked[0];
  const runnerUp = ranked[1];
  if (!best || best.confidence < 0.28) return [];
  if (runnerUp && best.confidence - runnerUp.confidence < 0.025) return [];
  const player = activePlayers[best.index];
  return player ? [player] : [];
}

function targetDirective(
  intent: SemanticIntent,
  recipient: InstructionRosterPlayer,
  confidence: number,
): TacticalDirectives | null {
  if (intent !== "targetGround" && intent !== "targetAerial" && intent !== "targetMixed") return null;
  return {
    preferredTargetId: recipient.id,
    preferredTargetName: recipient.name,
    targetPriority: Math.max(0.65, Math.min(1, 0.55 + confidence * 0.55)),
    targetDelivery: intent === "targetGround" ? "ground" : intent === "targetAerial" ? "aerial" : "mixed",
    directPassing: intent === "targetAerial" ? true : undefined,
  };
}

function semanticDirective(intent: SemanticIntent, value: boolean): TacticalDirectives {
  if (intent.startsWith("choice:")) {
    const [, rawKey, ...rawValue] = intent.split(":");
    const definition = CHOICE_INSTRUCTIONS.find((entry) => entry.key === rawKey);
    const choice = rawValue.join(":");
    if (definition?.options.some((entry) => entry.value === choice)) {
      return { [rawKey]: choice } as TacticalDirectives;
    }
    return {};
  }
  if (intent === "targetGround" || intent === "targetAerial" || intent === "targetMixed") return {};
  return { [intent]: value } as TacticalDirectives;
}

function mergeInto(target: TacticalDirectives, patch: TacticalDirectives): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  }
}

function summaryFor(
  directives: TacticalDirectives,
  assignments: TacticalPlayerAssignment[],
): string[] {
  return [
    ...summarizeDirectives(directives),
    ...assignments.flatMap((assignment) =>
      summarizeDirectives(assignment.directives).map((label) => `${assignment.playerName}: ${label}`),
    ),
  ].slice(0, 10);
}

export async function interpretTacticalInstructionsLocally(
  roster: InstructionRosterPlayer[],
  requests: LocalTacticalRequest[],
  embedder: SentenceEmbedder = browserSentenceEmbedder,
): Promise<LocalTacticalBatch> {
  const active = requests.filter((request) => normalizeInstructionText(request.text));
  if (!active.length) return { interpretations: {} };

  const fingerprint = instructionContextFingerprint(roster);
  const activePlayers = roster.filter((player) =>
    player.tacticalNumber !== undefined && player.role !== undefined,
  );
  const validTargetIds = new Set(activePlayers.map((player) => player.id));
  const semanticRosterKey = `${fingerprint}|${activePlayers.map((player) => `${player.id}:${player.name}`).join("|")}`;
  let embedderRosterCache = rosterVectorCache.get(embedder);
  if (!embedderRosterCache) {
    embedderRosterCache = new Map();
    rosterVectorCache.set(embedder, embedderRosterCache);
  }

  const requestClauses = active.map((request) => clauses(request.text));
  const flatClauses = requestClauses.flat();
  let labelVectors = labelVectorCache.get(embedder);
  let semanticRosterVectors = embedderRosterCache.get(semanticRosterKey);
  const embeddingInput: string[] = [];
  if (!labelVectors) embeddingInput.push(...LOCAL_SEMANTIC_LABELS.map((label) => label.description));
  if (!semanticRosterVectors) {
    embeddingInput.push(
      LOCAL_ENTITY_REFERENCE_LABELS.specific,
      LOCAL_ENTITY_REFERENCE_LABELS.team,
      ...activePlayers.map(localRosterPlayerDescription),
    );
  }
  embeddingInput.push(...flatClauses);

  const vectors = await embedder.embed(embeddingInput);
  if (vectors.length !== embeddingInput.length) {
    throw new Error("The local semantic model returned an incomplete embedding batch.");
  }
  let embeddedOffset = 0;
  if (!labelVectors) {
    labelVectors = vectors.slice(embeddedOffset, embeddedOffset + LOCAL_SEMANTIC_LABELS.length);
    embeddedOffset += LOCAL_SEMANTIC_LABELS.length;
    labelVectorCache.set(embedder, labelVectors);
  }
  if (!semanticRosterVectors) {
    const referenceVectors = vectors.slice(embeddedOffset, embeddedOffset + 2);
    embeddedOffset += 2;
    semanticRosterVectors = {
      referenceVectors: [referenceVectors[0], referenceVectors[1]],
      playerVectors: vectors.slice(embeddedOffset, embeddedOffset + activePlayers.length),
    };
    embeddedOffset += activePlayers.length;
    embedderRosterCache.set(semanticRosterKey, semanticRosterVectors);
    // Formation edits create new contexts; keep this tiny in long sessions.
    if (embedderRosterCache.size > 12) {
      const oldest = embedderRosterCache.keys().next().value as string | undefined;
      if (oldest && oldest !== semanticRosterKey) embedderRosterCache.delete(oldest);
    }
  }
  const clauseVectors = vectors.slice(embeddedOffset);
  let vectorOffset = 0;
  const interpretations: Record<string, TacticalInstructionInterpretation> = {};

  active.forEach((request, requestIndex) => {
    const parts = requestClauses[requestIndex];
    const requestVectors = clauseVectors.slice(vectorOffset, vectorOffset + parts.length);
    vectorOffset += parts.length;
    const decisions = decodeSemanticDecisions(requestVectors, labelVectors);
    const directives: TacticalDirectives = {};
    const assignmentsById = new Map<string, TacticalPlayerAssignment>();
    const unsupported: string[] = [];
    const matchedClauses = new Set<number>();

    for (const decision of decisions) {
      const clause = parts[decision.clauseIndex] ?? normalizeInstructionText(request.text);
      const explicitPlayers = resolveMentionedPlayers(clause, activePlayers);
      const mentioned = explicitPlayers.length
        ? explicitPlayers
        : resolveSemanticPlayerReference(
          requestVectors[decision.clauseIndex] ?? [],
          activePlayers,
          semanticRosterVectors,
        );
      const otherPlayers = mentioned.filter((player) => player.id !== request.subjectPlayerId);
      const isTarget = decision.intent === "targetGround" || decision.intent === "targetAerial" || decision.intent === "targetMixed";
      let patch: TacticalDirectives;

      if (isTarget) {
        // A team instruction with one player names the recipient ("find Luka").
        // With two names, the first is the actor and the second is the target.
        const recipient = request.scope === "player"
          ? otherPlayers[0]
          : mentioned.length >= 2 ? mentioned[1] : mentioned[0];
        if (!recipient || !validTargetIds.has(recipient.id)) {
          unsupported.push(`A preferred recipient could not be resolved safely from: “${clause.slice(0, 100)}”.`);
          continue;
        }
        patch = targetDirective(decision.intent, recipient, decision.confidence) ?? {};
      } else {
        patch = semanticDirective(decision.intent, decision.value);
      }

      matchedClauses.add(decision.clauseIndex);
      const hasNamedActor = request.scope === "team" && mentioned.length > 0 && (!isTarget || mentioned.length >= 2);
      if (hasNamedActor) {
        const actor = mentioned[0];
        const previous = assignmentsById.get(actor.id) ?? {
          playerId: actor.id,
          playerName: actor.name,
          directives: {},
        };
        mergeInto(previous.directives, patch);
        assignmentsById.set(actor.id, previous);
      } else {
        mergeInto(directives, patch);
      }
    }

    parts.forEach((part, index) => {
      if (!matchedClauses.has(index)) unsupported.push(`Not confidently mapped by local AI: “${part.slice(0, 100)}”.`);
    });

    const validated = sanitizeDirectives(directives, validTargetIds);
    const assignments = [...assignmentsById.values()]
      .map((assignment) => ({
        ...assignment,
        directives: sanitizeDirectives(assignment.directives, validTargetIds),
      }))
      .filter((assignment) => Object.keys(assignment.directives).length > 0);
    const understood = summaryFor(validated, assignments);
    if (!understood.length && !unsupported.length) {
      unsupported.push("No supported match-engine behavior could be mapped from this instruction.");
    }

    interpretations[request.key] = {
      schemaVersion: 1,
      input: normalizeInstructionText(request.text),
      scope: request.scope,
      subjectPlayerId: request.subjectPlayerId,
      contextFingerprint: fingerprint,
      directives: validated,
      assignments: assignments.length ? assignments : undefined,
      understood,
      unsupported: unsupported.slice(0, 10),
      source: "local-ai",
      model: LOCAL_TACTICAL_MODEL_LABEL,
      createdAt: Date.now(),
    };
  });

  return { interpretations };
}
