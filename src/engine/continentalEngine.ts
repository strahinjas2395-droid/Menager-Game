/**
 * Continental Championship — 32 clubs from the top 8 leagues.
 * 8 groups of 4 (home & away, 6 matchdays), then knockout:
 * R16, QF, SF, Final (single-leg ties with extra time + penalties).
 */
import type { Club, ContinentalGroup, Fixture, League, Player, Standing } from "@/types";
import { CompetitionType } from "@/types";
import type { SeededRNG } from "@/database/rng";
import { resolveKnockoutMatch } from "@/engine/cupEngine";

export const CONTINENTAL_ID = "continental";

/** weeks for group matchdays 1..6 and the four KO rounds */
export const CONT_GROUP_WEEKS = [4, 8, 12, 16, 20, 24];
export const CONT_KO_WEEKS: Record<number, number> = { 1: 30, 2: 33, 3: 36, 4: 40 };
export const CONT_KO_NAMES: Record<number, string> = {
  1: "Round of 16", 2: "Quarter Final", 3: "Semi Final", 4: "Final",
};

/**
 * Top 4 clubs (by reputation) from the top 8 leagues = 32 clubs.
 */
export function selectQualifiedClubs(leagues: League[], clubs: Club[]): Club[] {
  const byId = new Map(clubs.map((c) => [c.id, c]));
  const top8 = [...leagues].sort((a, b) => b.reputation - a.reputation).slice(0, 8);
  const qualified: Club[] = [];
  for (const league of top8) {
    const leagueClubs = league.clubIds
      .map((id) => byId.get(id))
      .filter((c): c is Club => !!c)
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 4);
    qualified.push(...leagueClubs);
  }
  return qualified;
}

/**
 * Draw 8 groups of 4 from 32 clubs using 4 pots (pot r = r-th best of each
 * league). No two clubs from the same league can share a group.
 */
export function drawGroups(qualified: Club[], rng: SeededRNG): ContinentalGroup[] {
  const leagueOf = new Map(qualified.map((c) => [c.id, c.leagueId]));

  // Pots: group qualified by their league rank (best of each league -> pot 0)
  const byLeague = new Map<string, Club[]>();
  for (const c of qualified) {
    const arr = byLeague.get(c.leagueId) ?? [];
    arr.push(c);
    byLeague.set(c.leagueId, arr);
  }
  for (const arr of byLeague.values()) arr.sort((a, b) => b.reputation - a.reputation);

  const pots: Club[][] = [[], [], [], []];
  for (const arr of byLeague.values()) {
    arr.forEach((c, i) => pots[i]?.push(c));
  }
  for (const pot of pots) {
    const shuffled = rng.shuffle(pot);
    pot.length = 0;
    pot.push(...shuffled);
  }

  const groupNames = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const groups: ContinentalGroup[] = groupNames.map((name) => ({ name, clubIds: [] }));

  // Assign clubs pot by pot: no two clubs of the same league in one group.
  const ordered = pots.flat();
  const assignFrom = (i: number): boolean => {
    if (i >= ordered.length) return true;
    const club = ordered[i];
    const valid = groups.filter(
      (g) =>
        g.clubIds.length < 4 &&
        !g.clubIds.some((id) => leagueOf.get(id) === club.leagueId),
    );
    for (const group of rng.shuffle(valid)) {
      group.clubIds.push(club.id);
      if (assignFrom(i + 1)) return true;
      group.clubIds.pop();
    }
    return false;
  };

  if (!assignFrom(0)) {
    // Should be impossible with a 4x8 pot structure; fall back to naive fill.
    groups.forEach((g) => (g.clubIds = []));
    qualified.forEach((c, i) => groups[i % 8].clubIds.push(c.id));
  }
  return groups;
}

/** Double round-robin inside each group (6 matchdays each). */
export function generateGroupFixtures(groups: ContinentalGroup[]): Fixture[] {
  const fixtures: Fixture[] = [];
  for (const g of groups) {
    const [a, b, c, d] = g.clubIds;
    if (!a || !b || !c || !d) continue;
    // matchday pairings for 4 teams; second half reverses home/away
    const md: [string, string][][] = [
      [[a, b], [c, d]],
      [[a, c], [b, d]],
      [[a, d], [b, c]],
      [[b, a], [d, c]],
      [[c, a], [d, b]],
      [[d, a], [c, b]],
    ];

    md.forEach((pairs, roundIdx) => {
      pairs.forEach(([home, away], m) => {
        fixtures.push({
          id: `${CONTINENTAL_ID}-g${g.name}-r${roundIdx + 1}-m${m}`,
          competitionType: CompetitionType.Continental,
          competitionId: CONTINENTAL_ID,
          round: roundIdx + 1,
          week: CONT_GROUP_WEEKS[roundIdx],
          homeClubId: home,
          awayClubId: away,
          played: false,
          homeGoals: 0,
          awayGoals: 0,
          group: g.name,
        });
      });
    });
  }
  return fixtures;
}

function table(fixtures: Fixture[], clubIds: string[]): Standing[] {
  const rows: Record<string, Standing> = {};
  for (const id of clubIds) {
    rows[id] = {
      clubId: id, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    };
  }
  for (const f of fixtures) {
    if (f.competitionType !== CompetitionType.Continental || !f.group) continue;
    if (!f.played) continue;
    const h = rows[f.homeClubId];
    const a = rows[f.awayClubId];
    if (!h || !a) continue;
    h.played++; a.played++;
    h.goalsFor += f.homeGoals; h.goalsAgainst += f.awayGoals;
    a.goalsFor += f.awayGoals; a.goalsAgainst += f.homeGoals;
    if (f.homeGoals > f.awayGoals) { h.won++; a.lost++; h.points += 3; }
    else if (f.homeGoals < f.awayGoals) { a.won++; h.lost++; a.points += 3; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  const out = Object.values(rows);
  for (const r of out) r.goalDifference = r.goalsFor - r.goalsAgainst;
  out.sort(
    (x, y) =>
      y.points - x.points ||
      y.goalDifference - x.goalDifference ||
      y.goalsFor - x.goalsFor ||
      x.clubId.localeCompare(y.clubId),
  );
  return out;
}

export interface GroupResult {
  group: ContinentalGroup;
  standings: Standing[];
  qualified: [string, string]; // [winner, runner-up]
}

/** Compute all group standings once matchday 6 is complete. */
export function computeGroupResults(
  fixtures: Fixture[],
  groups: ContinentalGroup[],
): GroupResult[] {
  return groups.map((g) => {
    const st = table(fixtures.filter((f) => f.group === g.name), g.clubIds);
    return {
      group: g,
      standings: st,
      qualified: [st[0].clubId, st[1].clubId] as [string, string],
    };
  });
}

/** R16 fixtures: group winners vs runners-up (never same group). */
export function generateKnockoutRound(
  koRound: number,
  fixtures: Fixture[],
  groups: ContinentalGroup[],
): Fixture[] {
  if (koRound === 1) {
    const results = computeGroupResults(fixtures, groups);
    const winners = results.map((r) => r.qualified[0]);
    const runners = results.map((r) => r.qualified[1]);
    const paired = pairWinnersRunners(winners, runners);
    return paired.map(
      ([h, a], i) => makeKOFixture(1, i, h, a),
    );
  }
  // subsequent rounds: pair consecutive winners of previous round
  const prevRound = koRound - 1;
  const prev = fixtures.filter(
    (f) => f.competitionId === CONTINENTAL_ID && f.round === prevRound + 10, // KO rounds stored as 11..14
  );
  if (prev.length === 0 || prev.some((f) => !f.played)) return [];
  const winners = prev
    .sort((a, b) => tieIndex(a.id) - tieIndex(b.id))
    .map((f) => (f.homeGoals + (f.homePens ?? 0) >= f.awayGoals + (f.awayPens ?? 0) ? f.homeClubId : f.awayClubId));
  const out: Fixture[] = [];
  for (let i = 0; i < winners.length / 2; i++) {
    out.push(makeKOFixture(koRound, i, winners[i], winners[winners.length - 1 - i]));
  }
  return out;
}

function makeKOFixture(koRound: number, tie: number, home: string, away: string): Fixture {
  return {
    id: `${CONTINENTAL_ID}-ko${koRound}-t${tie}`,
    competitionType: CompetitionType.Continental,
    competitionId: CONTINENTAL_ID,
    round: koRound + 10,
    week: CONT_KO_WEEKS[koRound],
    homeClubId: home,
    awayClubId: away,
    played: false,
    homeGoals: 0,
    awayGoals: 0,
  };
}

function tieIndex(id: string): number {
  const m = id.match(/-t(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Avoid same-group clashes in R16 where possible. */
function pairWinnersRunners(winners: string[], runners: string[]): [string, string][] {
  const groupsOf = new Map<string, number>();
  // winner i belongs to group i, runner i belongs to group i (by construction order)
  winners.forEach((_, i) => groupsOf.set(winners[i], i));
  runners.forEach((_, i) => groupsOf.set(runners[i], i));

  const paired: [string, string][] = [];
  const used = new Set<number>();
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    let j = runners.findIndex((r, idx) => !used.has(idx) && groupsOf.get(r) !== i);
    if (j < 0) j = runners.findIndex((_, idx) => !used.has(idx));
    if (j < 0) break;
    used.add(j);
    paired.push([w, runners[j]]);
  }
  return paired;
}

/** Resolve all played-out continental KO fixtures via quick knockout sim. */
export function resolveContinentalTie(
  homeSquad: Player[],
  awaySquad: Player[],
  rng: SeededRNG,
): { homeGoals: number; awayGoals: number; homePens?: number; awayPens?: number } {
  return resolveKnockoutMatch(homeSquad, awaySquad, rng);
}

export { table as continentalGroupTable };
