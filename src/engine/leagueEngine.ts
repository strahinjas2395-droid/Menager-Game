/**
 * League engine — fixture generation, standings, fast AI match simulation.
 * Quick AI matches are pure probabilistic score generation (<1ms each).
 */
import type { Club, Fixture, Player, Standing } from "@/types";
import { CompetitionType } from "@/types";
import { SeededRNG, clamp } from "@/database/rng";

/** Generic internal ability score (NOT shown to the user as an "overall"). */
export function playerStrength(p: Player): number {
  return (
    (p.ballControl + p.shortPassing + p.finishing + p.marking + p.tackling +
      p.pace + p.positioning + p.composure + p.anticipation) / 9
  );
}

/** Strength of the best XI available (starters by ability). */
export function teamStrength(squad: Player[]): number {
  if (squad.length === 0) return 8;
  const sorted = [...squad].sort((a, b) => playerStrength(b) - playerStrength(a));
  const xi = sorted.slice(0, 11);
  const sum = xi.reduce((s, p) => s + playerStrength(p), 0);
  return sum / xi.length;
}

/** Poisson sample with mean lambda. */
export function poisson(lambda: number, rng: SeededRNG): number {
  const L = Math.exp(-clamp(lambda, 0.05, 12));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L && k < 30);
  return k - 1;
}

export interface QuickResult {
  homeGoals: number;
  awayGoals: number;
}

/** Expected goals for both sides from strength comparison + home advantage. */
export function expectedGoals(
  homeSquad: Player[],
  awaySquad: Player[],
  homeAdvantage = 1.22,
): { home: number; away: number } {
  const hs = teamStrength(homeSquad);
  const as = teamStrength(awaySquad);
  const diff = hs - as;
  return {
    home: clamp(1.3 * Math.exp(diff / 13) * homeAdvantage, 0.15, 5),
    away: clamp(1.1 * Math.exp(-diff / 13), 0.1, 4.5),
  };
}

/**
 * Fast probabilistic match result based on team strength comparison,
 * formation modifier, home advantage and Poisson score generation.
 */
export function simulateQuickMatch(
  homeSquad: Player[],
  awaySquad: Player[],
  rng: SeededRNG,
  options?: { homeAdvantage?: number },
): QuickResult {
  const xg = expectedGoals(homeSquad, awaySquad, options?.homeAdvantage ?? 1.22);
  return {
    homeGoals: poisson(xg.home, rng),
    awayGoals: poisson(xg.away, rng),
  };
}

/**
 * Double round-robin fixture list (circle method).
 * Returns 2*(n-1) matchdays; each matchday has n/2 fixtures.
 * `weekForRound(round)` maps a matchday (1-based) to a season week.
 */
export function generateFixtureList(
  clubs: Club[],
  competitionId: string,
  weekForRound: (round: number) => number,
): Fixture[] {
  const ids = clubs.map((c) => c.id);
  const n = ids.length;
  if (n % 2 !== 0) throw new Error("Club count must be even");

  const fixtures: Fixture[] = [];
  const rotating = [...ids];
  const fixed = rotating.shift()!;
  const rounds = n - 1;

  for (let round = 1; round <= rounds; round++) {
    const pairs: [string, string][] = [[fixed, rotating[rotating.length - 1]]];
    for (let i = 0; i < (rotating.length - 1) / 2; i++) {
      pairs.push([rotating[i], rotating[rotating.length - 2 - i]]);
    }
    // rotate to keep variety
    rotating.unshift(rotating.pop()!);

    // home/away alternation
    pairs.forEach(([a, b], idx) => {
      const swap = (round + idx) % 2 === 0;
      const [home, away] = swap ? [a, b] : [b, a];
      const week = weekForRound(round);
      fixtures.push({
        id: `${competitionId}-r${round}-m${idx}`,
        competitionType: CompetitionType.League,
        competitionId,
        round,
        week,
        homeClubId: home,
        awayClubId: away,
        played: false,
        homeGoals: 0,
        awayGoals: 0,
      });
      // reverse fixture in second half of season
      fixtures.push({
        id: `${competitionId}-r${round + rounds}-m${idx}`,
        competitionType: CompetitionType.League,
        competitionId,
        round: round + rounds,
        week: weekForRound(round + rounds),
        homeClubId: away,
        awayClubId: home,
        played: false,
        homeGoals: 0,
        awayGoals: 0,
      });
    });
  }
  return fixtures;
}

/** Sort and compute league standings from played fixtures. */
export function calculateStandings(
  fixtures: Fixture[],
  leagueId: string,
  clubIds: string[],
): Standing[] {
  const table: Record<string, Standing> = {};
  for (const id of clubIds) {
    table[id] = {
      clubId: id, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    };
  }

  for (const f of fixtures) {
    if (f.competitionType !== CompetitionType.League) continue;
    if (f.competitionId !== leagueId) continue;
    if (!f.played) continue;
    const home = table[f.homeClubId];
    const away = table[f.awayClubId];
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += f.homeGoals;
    home.goalsAgainst += f.awayGoals;
    away.goalsFor += f.awayGoals;
    away.goalsAgainst += f.homeGoals;
    if (f.homeGoals > f.awayGoals) {
      home.won += 1; away.lost += 1; home.points += 3;
    } else if (f.homeGoals < f.awayGoals) {
      away.won += 1; home.lost += 1; away.points += 3;
    } else {
      home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1;
    }
  }

  const rows = Object.values(table);
  for (const r of rows) r.goalDifference = r.goalsFor - r.goalsAgainst;

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.clubId.localeCompare(b.clubId),
  );
  return rows;
}
