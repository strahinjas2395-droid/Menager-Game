/**
 * Transfer engine — offers, contract negotiation, AI transfer activity.
 */
import type { Club, Player, TransferOffer, WorldDatabase } from "@/types";
import { SeededRNG, clamp, randomSeed } from "@/database/rng";

export interface OfferEvaluation {
  askingPrice: number;
  accepted: boolean;
  counterAmount?: number;
  reason: string;
}

/** How important is this player to their current club? (0 = squad player, 1 = key) */
export function playerImportance(player: Player, world: WorldDatabase): number {
  const club = world.clubs[player.contract.clubId];
  if (!club) return 0.3;
  const squad = club.playerIds
    .map((id) => world.players[id])
    .filter((p): p is Player => !!p);
  if (squad.length === 0) return 0.3;
  const rank = [...squad].sort((a, b) => b.reputation - a.reputation)
    .findIndex((p) => p.id === player.id);
  const pct = rank / Math.max(1, squad.length - 1); // 0 = best
  return clamp(1 - pct, 0, 1);
}

export function askingPriceFor(player: Player, world: WorldDatabase): number {
  const importance = playerImportance(player, world);
  const club = world.clubs[player.contract.clubId];
  // clubs demand a premium over market value
  const premium = 1.05 + importance * 0.55;
  const leagueTax = club ? 1.0 : 1.0;
  return Math.round(player.contract.transferValue * premium * leagueTax);
}

export function makeBid(
  player: Player,
  amount: number,
  world: WorldDatabase,
  userClubId: string,
): OfferEvaluation {
  const asking = askingPriceFor(player, world);
  const userClub = world.clubs[userClubId];
  if (!userClub) return { askingPrice: asking, accepted: false, reason: "No club" };
  if (amount > userClub.budget) {
    return { askingPrice: asking, accepted: false, reason: "Insufficient budget" };
  }
  if (amount >= asking) {
    return { askingPrice: asking, accepted: true, reason: "Bid accepted — negotiate contract" };
  }
  if (amount >= asking * 0.85) {
    return {
      askingPrice: asking,
      accepted: false,
      counterAmount: asking,
      reason: `Club counters at €${(asking / 1_000_000).toFixed(1)}M`,
    };
  }
  return { askingPrice: asking, accepted: false, reason: "Bid far below valuation" };
}

export interface WageEvaluation {
  wageDemand: number;
  accepted: boolean;
  reason: string;
}

/** Player-side contract evaluation. */
export function negotiateContract(
  player: Player,
  offeredWage: number,
  years: number,
  world: WorldDatabase,
  userClubId: string,
): WageEvaluation {
  const buyer = world.clubs[userClubId];
  const seller = world.clubs[player.contract.clubId];
  if (!buyer) return { wageDemand: player.contract.weeklyWage, accepted: false, reason: "No club" };

  // ambition: better clubs attract players; players want a raise
  const ambition = clamp((buyer.reputation - (seller?.reputation ?? 40)) / 60, -0.15, 0.6);
  const demand = Math.round(
    player.contract.weeklyWage * (1.18 + ambition) * (years >= 3 ? 1.05 : 1.0),
  );
  if (offeredWage >= demand) {
    return { wageDemand: demand, accepted: true, reason: "Contract agreed!" };
  }
  if (offeredWage >= demand * 0.9) {
    return { wageDemand: demand, accepted: false, reason: `Agent asks €${(demand / 1000).toFixed(1)}k/w` };
  }
  return { wageDemand: demand, accepted: false, reason: "Player not interested at that wage" };
}

/** Execute an agreed transfer: move player, swap budgets, record wages. */
export function completeTransfer(
  world: WorldDatabase,
  playerId: string,
  fee: number,
  wage: number,
  years: number,
  userClubId: string,
): { ok: boolean; error?: string } {
  const player = world.players[playerId];
  const buyer = world.clubs[userClubId];
  if (!player || !buyer) return { ok: false, error: "Missing data" };
  const seller = world.clubs[player.contract.clubId];

  if (buyer.budget < fee) return { ok: false, error: "Insufficient budget" };

  // remove from seller
  if (seller && seller.id !== userClubId) {
    seller.playerIds = seller.playerIds.filter((id) => id !== playerId);
    seller.budget += fee;
  }
  // add to buyer
  buyer.budget -= fee;
  buyer.playerIds.push(playerId);
  player.contract.clubId = userClubId;
  player.contract.weeklyWage = wage;
  player.contract.contractYearsRemaining = years;
  player.morale = clamp(player.morale + 8, 0, 100);
  return { ok: true };
}

export interface AITransferActivityOptions {
  /** Human-controlled club: AI activity must never mutate this club or its players. */
  userClubId: string;
  rng?: SeededRNG;
  moves?: number;
}

/**
 * AI clubs make a handful of transfers during open windows.
 *
 * The user club is a required protected boundary rather than an optional
 * filter. This makes callers identify the human-controlled club explicitly and
 * ensures background simulation can never spend its budget or sell a player.
 * Returns completed AI-to-AI moves for news generation.
 */
export function aiTransferActivity(
  world: WorldDatabase,
  options: AITransferActivityOptions,
): { playerId: string; from: string; to: string; fee: number }[] {
  const { userClubId, rng = new SeededRNG(randomSeed()), moves = 4 } = options;
  const userClub = world.clubs[userClubId];
  // Fail closed if a corrupt/imported save points at a missing user club.
  if (!userClub) return [];

  const protectedPlayerIds = new Set(userClub.playerIds);
  const clubs = Object.values(world.clubs).filter((club) => club.id !== userClubId);
  const completed: { playerId: string; from: string; to: string; fee: number }[] = [];

  for (let i = 0; i < moves; i++) {
    const buyer = rng.pick(clubs.filter((c) => c.budget > 5_000_000));
    if (!buyer) continue;

    // buyer needs: weakest position in squad
    const squad = buyer.playerIds
      .map((id) => world.players[id])
      .filter((p): p is Player => !!p);
    if (squad.length < 15) continue;
    const posScore = new Map<string, number>();
    for (const p of squad) {
      posScore.set(p.primaryPosition, (posScore.get(p.primaryPosition) ?? 0) + p.reputation);
    }
    const needPos = [...posScore.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
    if (!needPos) continue;

    // candidate: good player in that position, affordable, willing to move
    const candidates = Object.values(world.players).filter(
      (p) =>
        p.primaryPosition === needPos &&
        p.contract.clubId !== buyer.id &&
        p.contract.clubId !== userClubId &&
        !protectedPlayerIds.has(p.id) &&
        p.reputation > (posScore.get(needPos) ?? 0) / Math.max(1, squad.length) + 4 &&
        p.contract.transferValue < buyer.budget * 0.5,
    );
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => b.reputation - a.reputation);
    const target = candidates[Math.floor(rng.next() * Math.min(8, candidates.length))];

    const fee = askingPriceFor(target, world);
    if (fee > buyer.budget * 0.45) continue;
    const seller = world.clubs[target.contract.clubId];
    // Re-check at the mutation boundary so even inconsistent roster/contract
    // data cannot make an AI transfer touch the protected user club.
    if (
      buyer.id === userClubId ||
      seller?.id === userClubId ||
      target.contract.clubId === userClubId ||
      protectedPlayerIds.has(target.id)
    ) continue;
    // seller accepts if fee is decent and player is not their best
    const importance = playerImportance(target, world);
    if (fee < target.contract.transferValue * (0.9 + importance * 0.4)) continue;
    if (rng.chance(importance * 0.5)) continue; // key players rarely leave

    // move
    if (seller) seller.playerIds = seller.playerIds.filter((id) => id !== target.id);
    buyer.playerIds.push(target.id);
    buyer.budget -= fee;
    if (seller) seller.budget += fee;
    target.contract.clubId = buyer.id;
    target.contract.weeklyWage = Math.round(
      target.contract.weeklyWage * 1.2,
    );
    target.contract.contractYearsRemaining = rng.int(2, 4);
    target.morale = clamp(target.morale + 6, 0, 100);

    completed.push({
      playerId: target.id,
      from: seller?.id ?? "",
      to: buyer.id,
      fee,
    });
  }
  return completed;
}

export function offerFrom(
  playerId: string,
  fromClubId: string,
  toClubId: string,
  amount: number,
  week: number,
): TransferOffer {
  return {
    id: `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    playerId,
    fromClubId,
    toClubId,
    amount,
    status: "pending",
    week,
  };
}

export type { Club };
