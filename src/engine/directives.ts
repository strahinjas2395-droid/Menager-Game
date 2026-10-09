/**
 * Tactical instruction contracts and the deterministic emergency fallback.
 *
 * Open-ended language is interpreted by services/tacticalInterpreter.ts using
 * a hosted language model. This engine module deliberately does not try to be
 * an English-language grammar: it validates the model's finite tactical plan,
 * exposes cached plans to the simulator, and keeps the old small phrase parser
 * only so a match remains playable while the AI service is offline.
 */
import type {
  Player,
  TacticalDirectives,
  TacticalInstructionCache,
  TacticalInstructionInterpretation,
} from "@/types";

export type PlayerDirectives = TacticalDirectives;

export interface InstructionRosterPlayer {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  squadNumber: number;
  tacticalNumber?: number;
  position: string;
  role?: string;
}

const BOOL_KEYS = [
  "holdPosition",
  "forwardRuns",
  "roam",
  "stayWide",
  "cutInside",
  "defensiveDuty",
  "shootFromDistance",
  "avoidShooting",
  "dribbleMore",
  "dribbleLess",
  "riskyPasses",
  "shortPassing",
  "directPassing",
  "targetMan",
  "earlyCross",
  "switchPlay",
  "clearImmediately",
  "tightMarking",
  "pressHard",
  "pressLess",
  "conserveEnergy",
] as const satisfies readonly (keyof TacticalDirectives)[];

/** Build the exact roster context shown to the language model. */
export function buildInstructionRoster(
  squad: Player[],
  starters: Player[] = [],
  roles: string[] = [],
  tacticalNumbers: number[] = [],
): InstructionRosterPlayer[] {
  const lineup = new Map(starters.map((player, i) => [
    player.id,
    { role: roles[i], tacticalNumber: tacticalNumbers[i] },
  ]));
  return squad.map((player) => {
    const slot = lineup.get(player.id);
    return {
      id: player.id,
      name: `${player.firstName} ${player.lastName}`,
      firstName: player.firstName,
      lastName: player.lastName,
      squadNumber: player.shirtNumber,
      tacticalNumber: slot?.tacticalNumber,
      position: player.primaryPosition,
      role: slot?.role,
    };
  });
}

/**
 * Cache entries are tied to the identities/numbers/roles the model saw. A
 * formation or squad change therefore cannot silently retarget an instruction.
 */
export function instructionContextFingerprint(roster: InstructionRosterPlayer[]): string {
  const source = [...roster]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => `${p.id}:${p.squadNumber}:${p.tacticalNumber ?? "-"}:${p.role ?? "-"}`)
    .join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `ctx-${(hash >>> 0).toString(36)}`;
}

export function normalizeInstructionText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Reject model inventions and coerce the small, public engine schema. */
export function sanitizeDirectives(
  value: unknown,
  validPlayerIds: ReadonlySet<string> = new Set<string>(),
): TacticalDirectives {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const out: TacticalDirectives = {};

  for (const key of BOOL_KEYS) {
    if (typeof input[key] === "boolean") out[key] = input[key];
  }

  if (typeof input.preferredTargetId === "string" && validPlayerIds.has(input.preferredTargetId)) {
    out.preferredTargetId = input.preferredTargetId;
    if (typeof input.preferredTargetName === "string") {
      out.preferredTargetName = input.preferredTargetName.trim().slice(0, 80);
    }
    const priority = Number(input.targetPriority);
    out.targetPriority = Number.isFinite(priority) ? Math.max(0, Math.min(1, priority)) : 0.85;
    if (input.targetDelivery === "ground" || input.targetDelivery === "aerial" || input.targetDelivery === "mixed") {
      out.targetDelivery = input.targetDelivery;
    } else {
      out.targetDelivery = "mixed";
    }
  }

  // Contradictory pairs can appear in malformed model output. Prefer the
  // safety/negative instruction rather than making the simulator oscillate.
  if (out.dribbleLess) out.dribbleMore = false;
  if (out.avoidShooting) out.shootFromDistance = false;
  if (out.pressLess) out.pressHard = false;
  if (out.defensiveDuty) out.forwardRuns = false;
  return out;
}

export function isInterpretationCurrent(
  interpretation: TacticalInstructionInterpretation | undefined,
  text: string,
  contextFingerprint: string,
  scope: "team" | "player",
  subjectPlayerId?: string,
): interpretation is TacticalInstructionInterpretation {
  if (!interpretation) return false;
  return interpretation.schemaVersion === 1 &&
    interpretation.scope === scope &&
    interpretation.contextFingerprint === contextFingerprint &&
    normalizeInstructionText(interpretation.input) === normalizeInstructionText(text) &&
    (scope === "team" || interpretation.subjectPlayerId === subjectPlayerId);
}

/** Merge team intent first, then let an individual's explicit values win. */
export function mergeDirectives(
  team: TacticalDirectives | undefined,
  individual: TacticalDirectives | undefined,
): TacticalDirectives {
  return { ...(team ?? {}), ...(individual ?? {}) };
}

type BooleanDirectiveKey = (typeof BOOL_KEYS)[number];

interface LexEntry {
  re: RegExp;
  key: BooleanDirectiveKey;
  /** The expression itself describes a negative action. */
  noFlip?: boolean;
}

// Small compatibility fallback only. The hosted language model is the primary
// interpreter; do not grow this into another pretend natural-language system.
const OFFLINE_LEXICON: LexEntry[] = [
  { re: /\b(hold (your )?position|stay (deep|back)|sit (deep|in)|drop (deep|off)|no roaming|don'?t (get )?(forward|roam|wander|overlap)|do not (get )?(forward|roam|overlap)|no (forward )?runs|don'?t push on)\b/i, key: "holdPosition", noFlip: true },
  { re: /\b(get forward|make runs?|run in behind|runs in behind|push on|overlap|advance up the pitch|exploit.*behind|get up the pitch)\b/i, key: "forwardRuns" },
  { re: /\b(roam|wander|free role|float around|find space between the lines)\b/i, key: "roam" },
  { re: /\b(stay wide|hold (your |the )?(touchline|width|wing)|hug (the )?(touchline|line|wing)|keep (your )?width|stick to the flank)\b/i, key: "stayWide" },
  { re: /\b(cut inside|come inside|invert|tuck in)\b/i, key: "cutInside" },
  { re: /\b(shoot (on sight|from distance|from range|more|more often)|take more shots?|more shots?|long shots?|let one (fly|rip)|have a pop|shoot when you see the sight)\b/i, key: "shootFromDistance" },
  { re: /\b(dribble more|take on|run at (them|defenders|players)|beat (the )?defenders|carry (it|the ball) forward)\b/i, key: "dribbleMore" },
  { re: /\b(dribble less|keep it simple|release (it|the ball) early|no dribbling|circulate (it|the ball)|don'?t dribble|do not dribble)\b/i, key: "dribbleLess", noFlip: true },
  { re: /\b(through balls?|killer balls?|riskier passes|risk the pass|split the (defense|defence)|thread (it|them|the ball|passes)|try (the )?impossible passes?)\b/i, key: "riskyPasses" },
  { re: /\b(short passes?|keep (it|passes|the ball) short|play (it )?short|short (passing )?(game|only)|one-two football)\b/i, key: "shortPassing" },
  { re: /\b(go direct|play long|long balls?|be direct|kick it long|hit diagonals?|diagonal balls?)\b/i, key: "directPassing" },
  { re: /\b(switch (the )?play|stretch them|switch the flanks|switch it out)\b/i, key: "switchPlay" },
  { re: /\b(man.?mark|mark (him|them|their|tightly|closely|tight)|stay touch tight|follow (him|them|everywhere)|stick to (him|them))\b/i, key: "tightMarking" },
  { re: /\b(press(?: hard| high| more| everything| aggressively)?|hunt (them|it|the ball|down)|chase (everything|every ball)|close (them|it|everything) down)\b/i, key: "pressHard" },
  { re: /\b(save (your )?energy|conserve energy|pick your moments|don'?t burn out|contain them|patrol (your )?zone)\b/i, key: "conserveEnergy", noFlip: true },
  { re: /\b(target man|hold up (play|the ball)|back to goal|bring others into play|lay (it|the ball) off)\b/i, key: "targetMan", noFlip: true },
  { re: /\b(early crosses?|whip (it |them )?in|deliver (early|quick) crosses?|cross early|whipped crosses?)\b/i, key: "earlyCross" },
];

const NEG = /\b(don'?t|do not|never|no need to|avoid|stop|cease|without)\b/i;

function clauses(text: string): string[] {
  return text
    .split(/(?:[.;!?\n]+|\s+and\s+|,\s*)+/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

/**
 * Emergency deterministic interpretation used only when there is no current
 * AI plan. It intentionally supports the legacy basics, not arbitrary prose.
 */
export function parseInstructions(text: string): TacticalDirectives {
  const out: TacticalDirectives = {};
  if (!text.trim()) return out;
  for (const clause of clauses(text)) {
    const negated = NEG.test(clause);
    for (const entry of OFFLINE_LEXICON) {
      if (entry.re.test(clause)) out[entry.key] = entry.noFlip ? true : !negated;
    }
  }
  return out;
}

export function createOfflineInterpretation(
  text: string,
  scope: "team" | "player",
  contextFingerprint: string,
  subjectPlayerId?: string,
): TacticalInstructionInterpretation {
  const input = normalizeInstructionText(text);
  const directives = parseInstructions(input);
  const understood = summarizeDirectives(directives);
  return {
    schemaVersion: 1,
    input,
    scope,
    subjectPlayerId,
    contextFingerprint,
    directives,
    understood,
    unsupported: input && understood.length === 0
      ? ["AI is unavailable; this wording could not be interpreted by the basic offline fallback."]
      : [],
    source: "offline",
    createdAt: Date.now(),
  };
}

/** Build per-player plans, preferring current validated AI cache entries. */
export function parseSquadInstructions(
  squad: Player[],
  cache?: TacticalInstructionCache,
  contextFingerprint = "legacy",
): Record<string, TacticalDirectives> {
  const map: Record<string, TacticalDirectives> = {};
  const validIds = new Set(squad.map((player) => player.id));
  for (const player of squad) {
    const text = player.individualInstructions ?? "";
    if (!text.trim()) continue;
    const cached = cache?.players?.[player.id];
    const directives = isInterpretationCurrent(cached, text, contextFingerprint, "player", player.id)
      ? sanitizeDirectives(cached.directives, validIds)
      : parseInstructions(text);
    if (Object.keys(directives).length > 0) map[player.id] = directives;
  }
  return map;
}

export interface CompiledInstructionPlans {
  teamDirectives?: TacticalDirectives;
  playerDirectives: Record<string, TacticalDirectives>;
  contextFingerprint: string;
}

/** Compile cached AI meaning into the framework-free simulator contract. */
export function compileInstructionPlans(
  squad: Player[],
  teamText: string,
  cache: TacticalInstructionCache | undefined,
  roster: InstructionRosterPlayer[],
): CompiledInstructionPlans {
  const fingerprint = instructionContextFingerprint(roster);
  const validIds = new Set(roster.map((player) => player.id));
  const teamPlan = cache?.team;
  const currentTeam = isInterpretationCurrent(teamPlan, teamText, fingerprint, "team");
  const team = currentTeam
    ? sanitizeDirectives(teamPlan.directives, validIds)
    : parseInstructions(teamText);
  const playerDirectives = parseSquadInstructions(squad, cache, fingerprint);

  if (currentTeam) {
    for (const assignment of teamPlan.assignments ?? []) {
      if (!validIds.has(assignment.playerId)) continue;
      const assigned = sanitizeDirectives(assignment.directives, validIds);
      playerDirectives[assignment.playerId] = mergeDirectives(
        assigned,
        playerDirectives[assignment.playerId],
      );
    }
  }

  return {
    teamDirectives: Object.keys(team).length ? team : undefined,
    playerDirectives,
    contextFingerprint: fingerprint,
  };
}

const LABELS: Partial<Record<keyof TacticalDirectives, string>> = {
  holdPosition: "Hold position",
  forwardRuns: "Attack space",
  roam: "Roam freely",
  stayWide: "Hold width",
  cutInside: "Move inside",
  defensiveDuty: "Defend from a deeper position",
  shootFromDistance: "Look for sensible long shots",
  avoidShooting: "Shoot less",
  dribbleMore: "Take players on",
  dribbleLess: "Release the ball early",
  riskyPasses: "Attempt incisive passes",
  shortPassing: "Prefer short passes",
  directPassing: "Prefer direct passes",
  targetMan: "Hold up play",
  earlyCross: "Deliver early",
  switchPlay: "Switch play",
  clearImmediately: "Clear danger immediately",
  tightMarking: "Mark tightly",
  pressHard: "Press aggressively",
  pressLess: "Do not press",
  conserveEnergy: "Conserve energy",
};

const FALSE_LABELS: Partial<Record<keyof TacticalDirectives, string>> = {
  holdPosition: "Do not remain fixed in position",
  forwardRuns: "Do not make attacking runs",
  roam: "Keep positional discipline",
  stayWide: "Do not stay on the touchline",
  cutInside: "Do not move inside",
  shootFromDistance: "Do not shoot from distance",
  riskyPasses: "Avoid risky passes",
  shortPassing: "Do not restrict passing to short options",
  directPassing: "Do not force direct passes",
  earlyCross: "Do not cross early",
  switchPlay: "Do not force switches",
  clearImmediately: "Do not clear automatically",
  tightMarking: "Do not mark tightly",
  pressHard: "Do not join the aggressive press",
};

/** Friendly chips for either AI results or the basic fallback. */
export function summarizeDirectives(directives: TacticalDirectives): string[] {
  const labels = (Object.keys(LABELS) as (keyof TacticalDirectives)[])
    .filter((key) => directives[key] === true)
    .map((key) => LABELS[key])
    .filter((label): label is string => Boolean(label));
  labels.push(...(Object.keys(FALSE_LABELS) as (keyof TacticalDirectives)[])
    .filter((key) => directives[key] === false)
    .map((key) => FALSE_LABELS[key])
    .filter((label): label is string => Boolean(label)));
  if (directives.preferredTargetId) {
    const delivery = directives.targetDelivery === "aerial"
      ? "with aerial service"
      : directives.targetDelivery === "ground"
        ? "with passes to feet"
        : "when a passing lane opens";
    labels.push(`Seek ${directives.preferredTargetName ?? "the selected teammate"} ${delivery}`);
  }
  return labels;
}
