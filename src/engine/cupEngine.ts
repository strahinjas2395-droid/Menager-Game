/**
 * Cup engine — domestic single-elimination knockout for the user's league
 * (20 teams: round 1 has 4 matches + 12 byes), with extra time and
 * penalty shootouts for drawn ties.
 */
import type { Club, Fixture, Player } from "@/types";
import { CompetitionType } from "@/types";
import { SeededRNG, clamp } from "@/database/rng";
import { expectedGoals, teamStrength } from "@/engine/leagueEngine";

export const CUP_ID = "cup";
/** season week for each cup round (1..5) */
export const CUP_ROUND_WEEKS: Record<number, number> = { 1: 7, 2: 14, 3: 21, 4: 28, 5: 35 };
export const CUP_ROUND_NAMES: Record<number, string> = {
  1: "Round 1", 2: "Round 2", 3: "Quarter Final", 4: "Semi Final", 5: "Final",
};

export interface KnockoutResult {
  homeGoals: number;
  awayGoals: number;
  homePens?: number;
  awayPens?: number;
}

/** Extra time + penalties if the tie is drawn after 90 minutes. */
export function resolveKnockoutMatch(
  homeSquad: Player[],
  awaySquad: Player[],
  rng: SeededRNG,
): KnockoutResult {
  const xg = expectedGoals(homeSquad, awaySquad, 1.15);
  let hg = poissonSample(xg.home, rng);
  let ag = poissonSample(xg.away, rng);

  if (hg === ag) {
    // extra time (30 minutes => 1/3 of 90' xg)
    hg += poissonSample(xg.home / 3, rng);
    ag += poissonSample(xg.away / 3, rng);
  }
  if (hg === ag) {
    const pens = penaltyShootout(homeSquad, awaySquad, rng);
    return { homeGoals: hg, awayGoals: ag, homePens: pens.home, awayPens: pens.away };
  }
  return { homeGoals: hg, awayGoals: ag };
}

function poissonSample(lambda: number, rng: SeededRNG): number {
  const L = Math.exp(-clamp(lambda, 0.05, 12));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L && k < 30);
  return k - 1;
}

/** 5 kicks each, then sudden death. */
export function penaltyShootout(
  homeSquad: Player[],
  awaySquad: Player[],
  rng: SeededRNG,
): { home: number; away: number } {
  const takers = (squad: Player[]) =>
    [...squad]
      .sort((a, b) => b.penaltyTaking + b.composure * 0.5 - (a.penaltyTaking + a.composure * 0.5))
      .slice(0, 5);
  const pickGk = (squad: Player[]) =>
    [...squad].sort((a, b) => b.reflexes + b.oneOnOnes - (a.reflexes + a.oneOnOnes))[0];

  const hgk = pickGk(homeSquad);
  const agk = pickGk(awaySquad);
  const ht = takers(homeSquad);
  const at = takers(awaySquad);

  const kick = (taker: Player, gk: Player): boolean => {
    const p = clamp(
      0.74 + taker.penaltyTaking * 0.008 - gk.oneOnOnes * 0.008 - gk.reflexes * 0.006,
      0.35,
      0.95,
    );
    return rng.chance(p);
  };

  let home = 0;
  let away = 0;
  for (let i = 0; i < 5; i++) {
    if (kick(ht[i], agk)) home++;
    if (kick(at[i], hgk)) away++;
  }
  // sudden death
  let round = 5;
  while (home === away) {
    if (kick(ht[round % ht.length], agk)) home++;
    if (kick(at[round % at.length], hgk)) away++;
    round++;
    if (round > 30) break; // safety
  }
  return { home, away };
}

/**
 * Round 1 fixtures: bottom 8 seeds play, top 12 get byes.
 * Seeds = clubs of the league ordered by reputation (1 = best).
 */
export function generateCupRound1(clubs: Club[]): Fixture[] {
  const seeded = [...clubs].sort((a, b) => b.reputation - a.reputation);
  // seeds 13..20 -> pairs (13,20),(14,19),(15,18),(16,17)
  const fixtures: Fixture[] = [];
  for (let i = 0; i < 4; i++) {
    const home = seeded[12 + i]; // seed 13..16
    const away = seeded[19 - i]; // seed 20..17
    fixtures.push(makeCupFixture(1, i, home.id, away.id));
  }
  return fixtures;
}

function makeCupFixture(round: number, tie: number, homeClubId: string, awayClubId: string): Fixture {
  return {
    id: `${CUP_ID}-r${round}-t${tie}`,
    competitionType: CompetitionType.Cup,
    competitionId: CUP_ID,
    round,
    week: CUP_ROUND_WEEKS[round],
    homeClubId,
    awayClubId,
    played: false,
    homeGoals: 0,
    awayGoals: 0,
  };
}

/**
 * Build the fixtures for the next cup round from winners of `round`.
 * Returns null when the cup is finished (round 5 played).
 */
export function generateNextCupRound(
  fixtures: Fixture[],
  round: number,
  clubs: Club[],
): { next: Fixture[]; round: number } | null {
  if (round >= 5) {
    // find champion
    return null;
  }

  const roundFixtures = fixtures.filter((f) => f.competitionId === CUP_ID && f.round === round);
  if (!roundFixtures.some((f) => !f.played)) {
    const winners = roundFixtures
      .sort((a, b) => tieIndex(a.id) - tieIndex(b.id))
      .map((f) => (f.homeGoals + (f.homePens ?? 0) >= f.awayGoals + (f.awayPens ?? 0) ? f.homeClubId : f.awayClubId));
    const byes =
      round === 1
        ? [...clubs]
            .sort((a, b) => b.reputation - a.reputation)
            .slice(0, 12)
            .map((c) => c.id)
        : [];

    // byes (seeds 1..12) first, then round winners — order preserved by strength
    const participants = [...byes, ...winners];
    const nextRound = round + 1;
    const next: Fixture[] = [];
    const n = participants.length;
    for (let i = 0; i < n / 2; i++) {
      const home = participants[i];
      const away = participants[n - 1 - i];
      next.push(makeCupFixture(nextRound, i, home, away));
    }
    return { next, round: nextRound };
  }
  return null; // round still in progress
}

function tieIndex(id: string): number {
  const m = id.match(/-t(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Champion of a completed cup. */
export function cupChampion(fixtures: Fixture[]): string | null {
  const final = fixtures.find((f) => f.competitionId === CUP_ID && f.round === 5);
  if (!final || !final.played) return null;
  return final.homeGoals + (final.homePens ?? 0) >= final.awayGoals + (final.awayPens ?? 0)
    ? final.homeClubId
    : final.awayClubId;
}

export { teamStrength };
