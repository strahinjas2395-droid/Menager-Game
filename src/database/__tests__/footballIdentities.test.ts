import { beforeAll, describe, expect, it } from "vitest";
import {
  ICONIC_PLAYER_ALIASES,
  RECOGNISABLE_CLUBS,
  type IconicPlayerAlias,
} from "@/database/footballIdentities";
import { generateAllLeagues, LEAGUES_DATA, type GeneratedWorld } from "@/database/leagueGenerator";
import { getIconicPrimeProfileByAlias } from "@/engine/iconicPrimeProfiles";
import type { Player } from "@/types";

const WORLD_SEED = 24_061_995;

function fullName(player: Pick<Player, "firstName" | "lastName">): string {
  return `${player.firstName} ${player.lastName}`;
}

function aliasName(alias: IconicPlayerAlias): string {
  return `${alias.firstName} ${alias.lastName}`;
}

describe("recognisable fictional football identities", () => {
  let world: GeneratedWorld;

  beforeAll(() => {
    world = generateAllLeagues(WORLD_SEED);
  });

  it("provides exactly 400 unique fictional club identities across all divisions", () => {
    const identitySets = Object.values(RECOGNISABLE_CLUBS);
    const names = identitySets.flat();

    expect(identitySets).toHaveLength(20);
    expect(identitySets.every((set) => set.length === 20)).toBe(true);
    expect(names).toHaveLength(400);
    expect(new Set(names).size).toBe(400);
    expect(LEAGUES_DATA.flatMap((league) => league.clubs)).toEqual(names);
    expect(world.clubs.map((club) => club.name)).toEqual(names);
    for (const exactClubIdentity of ["Manchester City", "Real Madrid", "Bayern Munich", "Lyn Oslo", "Finn Harps", "Athlone Town"]) {
      expect(names).not.toContain(exactClubIdentity);
    }
  });

  it("assigns all iconic aliases once, to the intended club and a compatible position", () => {
    const aliases = Object.values(ICONIC_PLAYER_ALIASES).flat();
    const aliasNames = aliases.map(aliasName);

    expect(aliases).toHaveLength(109);
    expect(new Set(aliasNames).size).toBe(109);

    for (const [clubName, clubAliases] of Object.entries(ICONIC_PLAYER_ALIASES)) {
      const club = world.clubs.find((candidate) => candidate.name === clubName);
      expect(club, `missing identity club ${clubName}`).toBeDefined();
      const squad = world.players.filter((player) => player.contract.clubId === club?.id);

      for (const alias of clubAliases) {
        const matches = squad.filter((player) => fullName(player) === aliasName(alias));
        expect(matches, `alias ${aliasName(alias)} at ${clubName}`).toHaveLength(1);
        const player = matches[0];
        expect(
          player.primaryPosition === alias.position || player.secondaryPositions.includes(alias.position),
          `${aliasName(alias)} was assigned to ${player.primaryPosition}`,
        ).toBe(true);
        const profile = getIconicPrimeProfileByAlias(aliasName(alias));
        expect(profile, `prime profile ${aliasName(alias)}`).toBeDefined();
        expect(player.iconicPrimeProfileId).toBe(profile?.id);
        expect(player.age).toBe(profile?.primeAge);
        expect(player.height).toBe(profile?.height);
        expect(player.weight).toBe(profile?.weight);
      }
    }

    const assigned = world.players.filter((player) => new Set(aliasNames).has(fullName(player)));
    expect(assigned).toHaveLength(109);
  });

  it("keeps generated identity, contract and squad invariants intact", () => {
    expect(new Set(world.clubs.map((club) => club.id)).size).toBe(world.clubs.length);
    expect(new Set(world.players.map((player) => player.id)).size).toBe(world.players.length);

    for (const club of world.clubs) {
      const squad = world.players.filter((player) => player.contract.clubId === club.id);
      expect(squad.map((player) => player.id)).toEqual(club.playerIds);
      expect(squad.every((player) => !("overall" in player))).toBe(true);
    }
  });

  it("is deterministic for the same world seed", () => {
    const replay = generateAllLeagues(WORLD_SEED);
    const snapshot = (candidate: GeneratedWorld) => ({
      clubs: candidate.clubs.map(({ id, name, playerIds }) => ({ id, name, playerIds })),
      players: candidate.players.map((player) => ({
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        primaryPosition: player.primaryPosition,
        secondaryPositions: player.secondaryPositions,
        iconicPrimeProfileId: player.iconicPrimeProfileId,
        clubId: player.contract.clubId,
      })),
    });

    expect(snapshot(replay)).toEqual(snapshot(world));
  });

  it("does not reuse a sample of exact famous player identities", () => {
    const generatedNames = new Set(world.players.map(fullName));
    for (const exactIdentity of [
      "Lionel Messi",
      "Cristiano Ronaldo",
      "Diego Maradona",
      "Johan Cruyff",
      "Zinedine Zidane",
      "Thierry Henry",
      "Paolo Maldini",
      "Franz Beckenbauer",
    ]) {
      expect(generatedNames.has(exactIdentity)).toBe(false);
    }
  });
});
