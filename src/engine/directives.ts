/**
 * Individual instructions — free text in, structured directives out.
 *
 * The manager writes plain English per player ("don't overlap, whip early
 * crosses"); this module translates it into {@link PlayerDirectives} flags that
 * the match engine reads inside decision-making, passing and movement.
 */
import type { Player } from "@/types";

export interface PlayerDirectives {
  holdPosition?: boolean;
  forwardRuns?: boolean;
  roam?: boolean;
  shootFromDistance?: boolean;
  dribbleMore?: boolean;
  dribbleLess?: boolean;
  riskyPasses?: boolean;
  shortPassing?: boolean;
  directPassing?: boolean;
  stayWide?: boolean;
  cutInside?: boolean;
  tightMarking?: boolean;
  pressHard?: boolean;
  conserveEnergy?: boolean;
  targetMan?: boolean;
  earlyCross?: boolean;
  switchPlay?: boolean;
}

interface LexEntry {
  re: RegExp;
  key: keyof PlayerDirectives;
  /** regex already encodes a negative meaning — do not flip on negation */
  noFlip?: boolean;
}

const LEXICON: LexEntry[] = [
  // ---- positioning ----
  { re: /\b(hold (your )?position|stay (deep|back)|sit (deep|in)|drop (deep|off)|no roaming|don'?t (get )?(forward|roam|wander|overlap)|do not (get )?(forward|roam|overlap)|no (forward )?runs|don'?t push on)\b/i, key: "holdPosition", noFlip: true },
  { re: /\b(get forward|make runs?|run in behind|runs in behind|push on|overlap|advance up the pitch|exploit.*behind|get up the pitch)\b/i, key: "forwardRuns" },
  { re: /\b(roam|wander|free role|float around|find space between the lines)\b/i, key: "roam" },
  { re: /\b(stay wide|hold (your |the )?(touchline|width|wing)|hug (the )?(touchline|line|wing)|keep (your )?width|stick to the flank)\b/i, key: "stayWide" },
  { re: /\b(cut inside|come inside|invert|tuck in)\b/i, key: "cutInside" },
  // ---- on the ball ----
  { re: /\b(shoot (on sight|from distance|from range|more|more often)|take more shots?|more shots?|long shots?|let one (fly|rip)|have a pop|shoot when you see the sight)\b/i, key: "shootFromDistance" },
  { re: /\b(dribble more|take on|run at (them|defenders|players)|beat (the )?defenders|carry (it|the ball) forward)\b/i, key: "dribbleMore" },
  { re: /\b(dribble less|keep it simple|release (it|the ball) early|no dribbling|circulate (it|the ball)|don'?t dribble|do not dribble)\b/i, key: "dribbleLess", noFlip: true },
  { re: /\b(through balls?|through ball|killer balls?|riskier passes|risk the pass|split the (defense|defence)|thread (it|them|the ball|passes)|try (the )?impossible passes?)\b/i, key: "riskyPasses" },
  { re: /\b(short passes?|keep (it|passes|the ball) short|play (it )?short|short (passing )?(game|only)|one-two football)\b/i, key: "shortPassing" },
  { re: /\b(go direct|play long|long balls?|be direct|kick it long|hit diagonals?|diagonal balls?)\b/i, key: "directPassing" },
  { re: /\b(switch (the )?play|stretch them|switch the flanks|switch it out)\b/i, key: "switchPlay" },
  // ---- defending ----
  { re: /\b(man.?mark|mark (him|them|their|tightly|closely|tight)|stay touch tight|follow (him|them|everywhere)|stick to (him|them))\b/i, key: "tightMarking" },
  { re: /\b(press(?: hard| high| more| everything| aggressively| like that| [a-z' -]{1,28} hard)?|hunt (them|it|the ball|down)|chase (everything|every ball|those down)|work your socks off|close (them|it|everything) down)\b/i, key: "pressHard" },
  { re: /\b(save (your )?energy|conserve energy|pick your moments|don'?t burn out|contain them|patrol (your )?zone)\b/i, key: "conserveEnergy", noFlip: true },
  // ---- roles ----
  { re: /\b(target man|hold up (play|the ball)|back to goal|bring others into play|lay (it|the ball) off)\b/i, key: "targetMan", noFlip: true },
  { re: /\b(early crosses?|whip (it |them )?in|deliver (early|quick) crosses?|cross early|whipped crosses?)\b/i, key: "earlyCross" },
];

const NEG = /\b(don'?t|do not|never|no need to|avoid|stop|cease|without)\b/i;

/** Split free text into clauses on punctuation, commas and coordinating "and". */
function clauses(text: string): string[] {
  return text
    .split(/(?:[.;!?\n]+|\s+and\s+|,\s*)+/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Translate free-text individual instructions into engine directives.
 * Deterministic rule/phrase matching with negation handling — no network,
 * no randomness, so the same note always produces the same behaviour.
 */
export function parseInstructions(text: string): PlayerDirectives {
  const out: PlayerDirectives = {};
  if (!text || !text.trim()) return out;
  for (const clause of clauses(text)) {
    const negated = NEG.test(clause);
    for (const entry of LEXICON) {
      if (entry.re.test(clause)) {
        out[entry.key] = entry.noFlip ? true : !negated;
      }
    }
  }
  return out;
}

/** Build the per-player directive map for a squad (only players with notes). */
export function parseSquadInstructions(
  squad: Player[],
): Record<string, PlayerDirectives> {
  const map: Record<string, PlayerDirectives> = {};
  for (const p of squad) {
    if (!p.individualInstructions?.trim()) continue;
    const d = parseInstructions(p.individualInstructions);
    if (Object.keys(d).length > 0) map[p.id] = d;
  }
  return map;
}

const LABELS: Record<keyof PlayerDirectives, string> = {
  holdPosition: "Hold position",
  forwardRuns: "Forward runs",
  roam: "Roam freely",
  shootFromDistance: "Shoot on sight",
  dribbleMore: "Dribble at defence",
  dribbleLess: "Release early",
  riskyPasses: "Play through balls",
  shortPassing: "Keep it short",
  directPassing: "Go direct",
  stayWide: "Hug touchline",
  cutInside: "Cut inside",
  tightMarking: "Man-mark",
  pressHard: "Press aggressively",
  conserveEnergy: "Conserve energy",
  targetMan: "Hold up play",
  earlyCross: "Whip crosses early",
  switchPlay: "Switch play",
};

/** Friendly chips for the UI: what the tactical AI understood. */
export function summarizeDirectives(d: PlayerDirectives): string[] {
  return (Object.keys(LABELS) as (keyof PlayerDirectives)[])
    .filter((k) => d[k])
    .map((k) => LABELS[k]);
}
