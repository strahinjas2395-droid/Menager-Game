/**
 * Action resolution — probability formulas for match actions.
 * Distances are in METERS (pitch game-units / 10 => 1000 units = 100m).
 * pressure: 0-1 (higher = more pressure). angle: 0-1 (0 = straight on, 1 = tight angle).
 * All functions take a SeededRNG for reproducibility.
 */
import type { Player } from "@/types";
import type { SeededRNG } from "@/database/rng";
import { clamp } from "@/database/rng";

export interface PassResult {
  success: boolean;
  intercepted: boolean;
}

export interface ShotResult {
  goal: boolean;
  saved: boolean;
  blocked: boolean;
  wide: boolean;
}

export interface DribbleResult {
  beat: boolean;
  foul: boolean;
  lost: boolean;
}

export interface TackleResult {
  won: boolean;
  foul: boolean;
  card: "none" | "yellow" | "red";
}

export interface HeaderResult {
  goal: boolean;
  saved: boolean;
  /** defender won the aerial / headed it away */
  cleared: boolean;
  /** attacker won the header but headed off target */
  wide: boolean;
}

export interface PenaltyResult {
  goal: boolean;
  saved: boolean;
}

/**
 * base 70% + ShortPassing*2 + Technique*1 - distance*0.3
 * - pressure*15 - nearest opponent Interceptions*1
 */
export type PassTechnique = "short" | "long" | "through" | "cross";

export function resolvePass(
  passer: Player,
  receiver: Player,
  distance: number,
  pressure: number,
  opponentInterceptions: number,
  rng: SeededRNG,
  technique: PassTechnique = "short",
): PassResult {
  const execution =
    technique === "cross"
      ? passer.crossing * 1.7 + passer.technique * 0.8
      : technique === "through"
        ? passer.creativity * 0.75 + passer.decisions * 0.65 + passer.shortPassing * 0.75 + passer.technique * 0.6
        : technique === "long"
          ? passer.longPassing * 1.65 + passer.technique * 0.8
          : passer.shortPassing * 2 + passer.technique;
  const receiverRead = (receiver.anticipation + receiver.offTheBall) * 0.14;
  const difficulty = technique === "through" ? 8 : technique === "cross" ? 5 : technique === "long" ? 3 : 0;
  const base =
    70 + execution + receiverRead - difficulty - distance * (technique === "short" ? 0.3 : 0.2) -
    pressure * 15 - opponentInterceptions;
  const p = clamp(base, 5, 97);
  const success = rng.chance(p / 100);
  const intercepted = !success && rng.chance(0.6);
  return { success, intercepted };
}

/**
 * Finishing*3 + Composure*2 - distance*2 - angle*3
 * - GK_Reflexes*2 - GK_ShotStopping*2 - pressure*10
 */
export function resolveShot(
  shooter: Player,
  gk: Player,
  distance: number,
  angle: number,
  pressure: number,
  rng: SeededRNG,
): ShotResult {
  const score =
    shooter.finishing * 3 +
    shooter.composure * 2 -
    distance * 2 -
    angle * 3 -
    gk.reflexes * 2 -
    gk.shotStopping * 2 -
    pressure * 10;

  const goalProb = clamp(21 + score * 0.8, 2, 70);
  if (rng.chance(goalProb / 100)) {
    return { goal: true, saved: false, blocked: false, wide: false };
  }

  // Split the misses: blocked if under pressure, wide if angle/distance poor
  const blockP = clamp(14 + pressure * 25 + (angle > 0.6 ? 6 : 0), 5, 45);
  const wideP = clamp(10 + angle * 30 + (distance > 25 ? 14 : 0) - gk.communication * 0.3, 5, 50);
  const r = rng.float(0, 100);
  if (r < blockP) return { goal: false, saved: false, blocked: true, wide: false };
  if (r < blockP + wideP) return { goal: false, saved: false, blocked: false, wide: true };
  return { goal: false, saved: true, blocked: false, wide: false };
}

/** Dribbling*3 + Agility*2 + Pace*1 vs Tackling*3 + Positioning*2 + Pace*1 */
export function resolveDribble(
  attacker: Player,
  defender: Player,
  rng: SeededRNG,
): DribbleResult {
  const att = attacker.dribbling * 3 + attacker.agility * 2 + attacker.pace * 1;
  const def = defender.tackling * 3 + defender.positioning * 2 + defender.pace * 1;
  const pBeat = clamp(50 + (att - def) * 1.2, 15, 88);

  if (rng.chance(pBeat / 100)) return { beat: true, foul: false, lost: false };
  // Sometimes the defender drags the attacker down instead
  const foulP = clamp(8 + defender.aggression * 0.8, 5, 25);
  if (rng.chance(foulP / 100)) return { beat: false, foul: true, lost: false };
  return { beat: false, foul: false, lost: true };
}

/** Tackling*3 + Anticipation*2 vs Dribbling*2 + Agility*1 */
export function resolveTackle(
  defender: Player,
  attacker: Player,
  rng: SeededRNG,
): TackleResult {
  const def = defender.tackling * 3 + defender.anticipation * 2;
  const att = attacker.dribbling * 2 + attacker.agility * 1;
  const pWon = clamp(45 + (def - att) * 1.3, 15, 85);

  if (rng.chance(pWon / 100)) return { won: true, foul: false, card: "none" };

  // Failed tackle -> possible foul
  const foulP = clamp(0.15 + (defender.aggression * 2 + (20 - defender.tackling) * 1.5) / 100, 0.1, 0.6);
  if (rng.chance(foulP)) {
    let card: "none" | "yellow" | "red" = "none";
    if (defender.aggression > 15 && rng.chance(0.12)) card = "red";
    else if (defender.aggression > 10 && rng.chance(0.35)) card = "yellow";
    else if (rng.chance(0.12)) card = "yellow";
    return { won: false, foul: true, card };
  }
  return { won: false, foul: false, card: "none" };
}

/** Aerial duel + finishing header. danger: 0-1 proximity to goal. */
export function resolveHeader(
  attacker: Player,
  defender: Player,
  gk: Player,
  danger: number,
  rng: SeededRNG,
): HeaderResult {
  const att =
    attacker.heading * 2 + attacker.jumping * 1.5 + attacker.offTheBall +
    (attacker.strength ?? 10) * 0.35 + (attacker.bravery ?? 10) * 0.25 +
    clamp(((attacker.height ?? 180) - 175) / 4, -2, 5);
  const def =
    defender.aerialDuels * 2 + defender.positioning * 1.5 + defender.marking +
    (defender.strength ?? 10) * 0.4 + (defender.bravery ?? 10) * 0.25 +
    clamp(((defender.height ?? 180) - 175) / 4, -2, 5);
  const pWin = clamp(50 + (att - def) * 1.3, 15, 85);

  if (!rng.chance(pWin / 100)) {
    return { goal: false, saved: false, cleared: true, wide: false };
  }

  // Attacker wins the header on goal (only dangerous when close)
  const goalP = clamp(
    12 +
      danger * 30 +
      (attacker.heading + attacker.composure - gk.reflexes - gk.oneOnOnes) * 2.2,
    3,
    75,
  );
  if (rng.chance(goalP / 100)) {
    return { goal: true, saved: false, cleared: false, wide: false };
  }
  // won the header but no goal: either keeper saves or it sails wide/over
  const saved = rng.chance(0.5);
  return { goal: false, saved, cleared: false, wide: !saved };
}

/** base 78% + PenaltyTaking - GK_Reflexes*0.5 - GK_OneOnOnes*0.5 */
export function resolvePenalty(
  taker: Player,
  gk: Player,
  rng: SeededRNG,
): PenaltyResult {
  const p = clamp(
    78 + taker.penaltyTaking * 1 - gk.reflexes * 0.5 - gk.oneOnOnes * 0.5,
    40,
    96,
  );
  const goal = rng.chance(p / 100);
  return { goal, saved: !goal };
}

/**
 * Race for a loose ball — pace, acceleration, awareness (anticipation) and
 * strength decide who gets there first, plus a dash of uncertainty.
 */
export function resolveLooseBallDuel(
  a: Player,
  b: Player,
  rng: SeededRNG,
): "a" | "b" {
  const score = (p: Player) =>
    p.pace * 0.4 + p.acceleration * 0.2 + p.anticipation * 0.3 + p.strength * 0.1;
  const sa = score(a) + rng.float(0, 7);
  const sb = score(b) + rng.float(0, 7);
  return sa >= sb ? "a" : "b";
}

/**
 * Can the ball carrier brush the challenge aside? Strength, balance and ball
 * control vs the defender's strength, aggression and tackling.
 */
/** Aerial/shoulder duel for a dropping pass, independent from shooting. */
export function resolveAerialDuel(
  a: Player,
  b: Player,
  rng: SeededRNG,
): "a" | "b" {
  const aerial = (p: Player) =>
    p.jumping * 0.28 + p.heading * 0.18 + p.aerialDuels * 0.22 +
    p.strength * 0.12 + p.bravery * 0.1 + clamp((p.height - 170) / 5, -2, 5);
  return aerial(a) + rng.float(0, 5) >= aerial(b) + rng.float(0, 5) ? "a" : "b";
}

export function resolveHoldOff(
  attacker: Player,
  defender: Player,
  rng: SeededRNG,
): boolean {
  const atk = attacker.strength * 0.5 + attacker.balance * 0.3 + attacker.ballControl * 0.2;
  const def = defender.strength * 0.5 + defender.aggression * 0.25 + defender.tackling * 0.25;
  return rng.chance(clamp(0.5 + (atk - def) * 0.045, 0.18, 0.85));
}
