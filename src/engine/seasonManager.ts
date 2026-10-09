/**
 * Season manager — week-by-week calendar flow, competition scheduling,
 * AI fixture simulation and season-end processing (promotion/relegation,
 * development, contracts).
 */
import type {
  ContinentalState,
  CupState,
  Fixture,
  League,
  Club,
  Player,
  WorldDatabase,
} from "@/types";
import { Difficulty } from "@/types";
import { SeededRNG, clamp } from "@/database/rng";
import { generateFixtureList, simulateQuickMatch } from "@/engine/leagueEngine";
import { generateCupRound1, generateNextCupRound, cupChampion, CUP_ID } from "@/engine/cupEngine";
import {
  CONTINENTAL_ID,
  drawGroups,
  generateGroupFixtures,
  generateKnockoutRound,
  selectQualifiedClubs,
} from "@/engine/continentalEngine";
import { generateName } from "@/database/nameGenerator";
import { generatePlayer, estimateValue } from "@/database/playerGenerator";

export const TOTAL_WEEKS = 42;
export const LEAGUE_ROUNDS = 38;
/** nations with a second division (promotion/relegation pairs) */
export const TWO_TIER_NATIONS = ["Bretherland", "Valdoria", "Schwarzland", "Campoverde", "Hellenia"];
export const PROMOTION_SPOTS = 3;

export interface SeasonCompetitions {
  fixtures: Fixture[];
  cup: CupState;
  continental: ContinentalState;
}

/** Generate all season fixtures: leagues, domestic cup, continental groups. */
export function generateSeasonFixtures(
  world: WorldDatabase,
  userClubId: string,
  seed: number,
): SeasonCompetitions {
  const rng = new SeededRNG(seed ^ 0x5eed);
  const fixtures: Fixture[] = [];

  // --- Leagues: round r -> week r (weeks 1..38)
  for (const league of Object.values(world.leagues)) {
    const clubs = league.clubIds
      .map((id) => world.clubs[id])
      .filter((c): c is Club => !!c);
    if (clubs.length !== 20) continue;
    fixtures.push(...generateFixtureList(clubs, league.id, (r) => r));
  }

  // --- Domestic cup: only the user's league (20 clubs)
  const userClub = world.clubs[userClubId];
  const userLeague = userClub ? world.leagues[userClub.leagueId] : null;
  const cup: CupState = { round: userLeague ? 1 : 0, championId: null };
  if (userLeague) {
    const clubs = userLeague.clubIds
      .map((id) => world.clubs[id])
      .filter((c): c is Club => !!c);
    fixtures.push(...generateCupRound1(clubs));
  }

  // --- Continental: 32 qualified clubs, 8 groups
  const leaguesArr = Object.values(world.leagues);
  const clubsArr = Object.values(world.clubs);
  const qualified = selectQualifiedClubs(leaguesArr, clubsArr);
  const groups = qualified.length === 32 ? drawGroups(qualified, rng) : [];
  const continental: ContinentalState = { groups, koRound: groups.length ? 1 : 5, championId: null };
  if (groups.length) {
    fixtures.push(...generateGroupFixtures(groups));
  }

  return { fixtures, cup, continental };
}

export function fixturesForWeek(fixtures: Fixture[], week: number): Fixture[] {
  return fixtures.filter((f) => f.week === week);
}

export function userFixturesForWeek(
  fixtures: Fixture[],
  week: number,
  userClubId: string,
): Fixture[] {
  return fixturesForWeek(fixtures, week).filter(
    (f) => f.homeClubId === userClubId || f.awayClubId === userClubId,
  );
}

/** Simulate every non-user fixture of the week (fast Poisson quick-sim). */
export function simulateWeekAI(
  fixtures: Fixture[],
  week: number,
  world: WorldDatabase,
  userClubId: string,
  rng: SeededRNG,
): void {
  const squadOf = (clubId: string): Player[] => {
    const club = world.clubs[clubId];
    if (!club) return [];
    return club.playerIds.map((pid) => world.players[pid]).filter((p): p is Player => !!p);
  };

  for (const f of fixturesForWeek(fixtures, week)) {
    if (f.played) continue;
    if (f.homeClubId === userClubId || f.awayClubId === userClubId) continue;
    const res = simulateQuickMatch(squadOf(f.homeClubId), squadOf(f.awayClubId), rng);
    f.homeGoals = res.homeGoals;
    f.awayGoals = res.awayGoals;
    f.played = true;
  }
}

export function weekIsComplete(fixtures: Fixture[], week: number): boolean {
  return fixturesForWeek(fixtures, week).every((f) => f.played);
}

export function transferWindowOpen(week: number): boolean {
  return (week >= 1 && week <= 4) || (week >= 19 && week <= 22);
}

// ---------------------------------------------------------------------------
// Competition progression
// ---------------------------------------------------------------------------

/** Advance the cup when its current round finished. Returns new fixtures to add. */
export function advanceCup(
  fixtures: Fixture[],
  cup: CupState,
  world: WorldDatabase,
): { cup: CupState; added: Fixture[] } {
  if (cup.round === 0 || cup.championId) return { cup, added: [] };
  const league = Object.values(world.leagues).find(
    (l) =>
      l.clubIds.includes(
        fixtures.find((f) => f.competitionId === CUP_ID)?.homeClubId ??
          fixtures.find((f) => f.competitionId === CUP_ID)?.awayClubId ??
          "",
      ),
  );
  const clubs = (league?.clubIds ?? [])
    .map((id) => world.clubs[id])
    .filter((c): c is Club => !!c);
  if (clubs.length < 20) return { cup, added: [] };

  const next = generateNextCupRound(fixtures, cup.round, clubs);
  if (next) {
    return { cup: { ...cup, round: next.round }, added: next.next };
  }
  // round 5 (final) complete?
  const final = fixtures.find((f) => f.competitionId === CUP_ID && f.round === 5);
  if (final?.played) {
    return {
      cup: { round: 0, championId: cupChampion(fixtures) },
      added: [],
    };
  }
  return { cup, added: [] };
}

/** Advance continental competition. Returns new fixtures to add. */
export function advanceContinental(
  fixtures: Fixture[],
  continental: ContinentalState,
): { continental: ContinentalState; added: Fixture[] } {
  if (!continental.groups.length || continental.championId) {
    return { continental, added: [] };
  }

  const contFixtures = fixtures.filter((f) => f.competitionId === CONTINENTAL_ID);

  // Group stage done? -> generate R16
  const groupsStage = contFixtures.filter((f) => (f.round ?? 0) <= 6);
  const groupsDone = groupsStage.length > 0 && groupsStage.every((f) => f.played);

  if (continental.koRound === 1 && groupsDone) {
    const added = generateKnockoutRound(1, fixtures, continental.groups);
    if (added.length) return { continental: { ...continental, koRound: 1 }, added };
  }

  // KO rounds
  const koRound = continental.koRound;
  if (koRound >= 1 && koRound <= 4) {
    const roundFx = contFixtures.filter((f) => f.round === koRound + 10);
    if (roundFx.length > 0 && roundFx.every((f) => f.played)) {
      if (koRound === 4) {
        const final = roundFx[0];
        const champ =
          final.homeGoals + (final.homePens ?? 0) >= final.awayGoals + (final.awayPens ?? 0)
            ? final.homeClubId
            : final.awayClubId;
        return {
          continental: { ...continental, koRound: 5, championId: champ },
          added: [],
        };
      }
      const added = generateKnockoutRound(koRound + 1, fixtures, continental.groups);
      if (added.length) return { continental: { ...continental, koRound: koRound + 1 }, added };
      // no fixtures generated (not ready) -> keep state
      if (roundFx.every((f) => f.played)) {
        return { continental: { ...continental, koRound: koRound + 1 }, added: [] };
      }
    }
  }

  return { continental, added: [] };
}

// ---------------------------------------------------------------------------
// Season end
// ---------------------------------------------------------------------------

/** Swap bottom 3 of each top division with top 3 of its second division. */
export function applyPromotionRelegation(
  leagues: Record<string, League>,
  clubs: Record<string, Club>,
  fixtures: Fixture[],
  calculateStandings: (fixtures: Fixture[], leagueId: string, clubIds: string[]) => { clubId: string }[],
): void {
  for (const nation of TWO_TIER_NATIONS) {
    const nationLeagues = Object.values(leagues)
      .filter((l) => l.nation === nation)
      .sort((a, b) => a.tier - b.tier);
    if (nationLeagues.length < 2) continue;
    const [top, bottom] = nationLeagues;

    const topTable = calculateStandings(fixtures, top.id, top.clubIds);
    const bottomTable = calculateStandings(fixtures, bottom.id, bottom.clubIds);

    const relegated = topTable.slice(-PROMOTION_SPOTS).map((s) => s.clubId);
    const promoted = bottomTable.slice(0, PROMOTION_SPOTS).map((s) => s.clubId);

    top.clubIds = top.clubIds.filter((id) => !relegated.includes(id)).concat(promoted);
    bottom.clubIds = bottom.clubIds.filter((id) => !promoted.includes(id)).concat(relegated);
    for (const id of relegated) if (clubs[id]) clubs[id].leagueId = bottom.id;
    for (const id of promoted) if (clubs[id]) clubs[id].leagueId = top.id;
  }
}

/** Off-season processing: age players up, development, contracts, youth intake. */
export function processSeasonEnd(
  world: WorldDatabase,
  rng: SeededRNG,
  seasonYear: number,
): void {
  for (const player of Object.values(world.players)) {
    player.age += 1;
    player.contract.contractYearsRemaining -= 1;

    // development for young players, decline for old physicals
    if (player.age <= 24 && player.potentialCeiling > currentAbility(player)) {
      const growth = Math.min(player.developmentRate * 0.9, player.potentialCeiling - currentAbility(player));
      bump(player, "technical", growth * 0.4);
      bump(player, "mental", growth * 0.3);
      bump(player, "physical", player.age <= 21 ? growth * 0.3 : 0);
    }
    if (player.age > 30) {
      bump(player, "physical", -0.6 - (player.age - 30) * 0.1);
    }
    player.reputation = clamp(Math.round(player.reputation + rng.int(-2, 3)), 5, 99);
    if (player.contract.contractYearsRemaining < 0) player.contract.contractYearsRemaining = 0;
    player.seasonStats = {
      appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, lastRating: 0,
    };
  }

  // Youth intake: each club adds 2 youth players
  for (const club of Object.values(world.clubs)) {
    for (let i = 0; i < 2; i++) {
      const nat = clubNameToNation(club, world);
      const youth = generatePlayer({
        age: rng.int(16, 18),
        nationality: nat,
        clubId: club.id,
        isYouth: true,
        seed: rng.int(1, 2 ** 30),
      });
      youth.contract.clubId = club.id;
      youth.id = `${youth.id}`;
      // ensure unique id
      let id = youth.id;
      let n = 2;
      while (world.players[id]) id = `${youth.id}-${n++}`;
      youth.id = id;
      world.players[id] = youth;
      club.playerIds.push(id);
    }
  }
}

function currentAbility(p: Player): number {
  const keys = ["ballControl", "finishing", "shortPassing", "marking", "tackling", "pace", "composure"] as const;
  let sum = 0;
  for (const k of keys) sum += (p as unknown as Record<string, number>)[k] ?? 10;
  return sum / keys.length;
}

function bump(p: Player, group: "technical" | "mental" | "physical", amount: number): void {
  const sets: Record<string, string[]> = {
    technical: ["ballControl", "dribbling", "shortPassing", "longPassing", "crossing", "finishing", "longShots", "heading", "technique"],
    mental: ["anticipation", "composure", "decisions", "creativity", "offTheBall", "positioning", "workRate"],
    physical: ["pace", "acceleration", "strength", "jumping", "agility", "naturalFitness"],
  };
  for (const key of sets[group]) {
    const cur = (p as unknown as Record<string, number>)[key] ?? 10;
    (p as unknown as Record<string, number>)[key] = clamp(Math.round((cur + amount) * 10) / 10, 1, 20);
  }
}

function clubNameToNation(club: Club, world: WorldDatabase): string {
  const league = world.leagues[club.leagueId];
  return league?.nation ?? "Bretherland";
}

export { generateName, estimateValue, Difficulty };
