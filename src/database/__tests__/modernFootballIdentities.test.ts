import { beforeAll, describe, expect, it } from "vitest";
import { generateAllLeagues, type GeneratedWorld } from "@/database/leagueGenerator";
import {
  MODERN_PLAYER_ALIASES,
  modernPlayerIdentityId,
  type ModernPlayerIdentity,
} from "@/database/modernFootballIdentities";
import { getIconicPrimeProfile } from "@/engine/iconicPrimeProfiles";
import { GameMode, type Player } from "@/types";

const SEED = 20_261_010;

function identityName(identity: Pick<ModernPlayerIdentity, "firstName" | "lastName">): string {
  return `${identity.firstName} ${identity.lastName}`;
}

function playerName(player: Pick<Player, "firstName" | "lastName">): string {
  return `${player.firstName} ${player.lastName}`;
}

describe("selectable contemporary football database", () => {
  let modernWorld: GeneratedWorld;
  let iconicWorld: GeneratedWorld;

  beforeAll(() => {
    modernWorld = generateAllLeagues(SEED, GameMode.Modern);
    iconicWorld = generateAllLeagues(SEED, GameMode.Iconic);
  });

  it("provides a broad, unique active-player-inspired identity snapshot", () => {
    const identities = Object.values(MODERN_PLAYER_ALIASES).flat();
    const names = identities.map(identityName);
    const clubNames = new Set(modernWorld.clubs.map((club) => club.name));

    expect(identities).toHaveLength(134);
    expect(Object.keys(MODERN_PLAYER_ALIASES)).toHaveLength(60);
    expect(new Set(names).size).toBe(identities.length);
    expect(Object.keys(MODERN_PLAYER_ALIASES).every((club) => clubNames.has(club))).toBe(true);
    expect(new Set(identities.map(modernPlayerIdentityId)).size).toBe(identities.length);
    for (const exactIdentity of [
      "Erling Haaland",
      "Mohamed Salah",
      "Kylian Mbappe",
      "Lamine Yamal",
      "Jude Bellingham",
      "Scott McTominay",
      "Ousmane Dembele",
      "Victor Osimhen",
    ]) {
      expect(names).not.toContain(exactIdentity);
    }
  });

  it("assigns every modern identity once to a compatible current squad slot", () => {
    for (const [clubName, identities] of Object.entries(MODERN_PLAYER_ALIASES)) {
      const club = modernWorld.clubs.find((candidate) => candidate.name === clubName);
      expect(club, `missing contemporary club ${clubName}`).toBeDefined();
      const squad = modernWorld.players.filter((player) => player.contract.clubId === club?.id);

      for (const identity of identities) {
        const matches = squad.filter((player) => playerName(player) === identityName(identity));
        expect(matches, `${identityName(identity)} at ${clubName}`).toHaveLength(1);
        const assigned = matches[0];
        expect(assigned.modernPlayerIdentityId).toBe(modernPlayerIdentityId(identity));
        expect(assigned.iconicPrimeProfileId).toBeUndefined();
        expect(getIconicPrimeProfile(assigned)).toBeUndefined();
        expect(assigned.age).toBe(identity.age);
        expect(assigned.height).toBe(identity.height);
        expect(assigned.weight).toBe(identity.weight);
        expect(
          assigned.primaryPosition === identity.position || assigned.secondaryPositions.includes(identity.position),
        ).toBe(true);
        expect("overall" in assigned).toBe(false);
      }
    }
  });

  it("keeps modern and iconic identity layers mutually exclusive", () => {
    expect(modernWorld.players.filter((player) => player.modernPlayerIdentityId)).toHaveLength(
      Object.values(MODERN_PLAYER_ALIASES).flat().length,
    );
    expect(modernWorld.players.some((player) => player.iconicPrimeProfileId)).toBe(false);
    expect(iconicWorld.players.some((player) => player.modernPlayerIdentityId)).toBe(false);
    expect(iconicWorld.players.filter((player) => player.iconicPrimeProfileId)).toHaveLength(109);
    expect(modernWorld.clubs.map((club) => club.name)).toEqual(iconicWorld.clubs.map((club) => club.name));
  });

  it("is deterministic for a repeated current-era generation", () => {
    const replay = generateAllLeagues(SEED, GameMode.Modern);
    const snapshot = (world: GeneratedWorld) => world.players
      .filter((player) => player.modernPlayerIdentityId)
      .map((player) => ({
        id: player.id,
        name: playerName(player),
        identity: player.modernPlayerIdentityId,
        clubId: player.contract.clubId,
        age: player.age,
        playstyles: player.playstyles,
      }));
    expect(snapshot(replay)).toEqual(snapshot(modernWorld));
  });
});
