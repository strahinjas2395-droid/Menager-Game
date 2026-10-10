import { describe, expect, it } from "vitest";
import { ICONIC_PLAYER_ALIASES } from "@/database/footballIdentities";
import { generatePlayer } from "@/database/playerGenerator";
import {
  ICONIC_PRIME_PROFILES,
  applyIconicPrimeProfile,
  getIconicPrimeProfile,
  getIconicPrimeProfileByAlias,
  iconicPrimeProfileId,
} from "@/engine/iconicPrimeProfiles";
import { iconicPassFlavorBias, shotTechniqueWeights } from "@/engine/matchSimulator";
import { PrimaryPosition } from "@/types";

function aliasNames(): string[] {
  return Object.values(ICONIC_PLAYER_ALIASES)
    .flat()
    .map((alias) => `${alias.firstName} ${alias.lastName}`);
}

function share(weights: Record<string, number>, key: string): number {
  return weights[key] / Object.values(weights).reduce((total, value) => total + value, 0);
}

describe("explicit iconic prime profiles", () => {
  it("has exactly one complete explicit profile for every transformed alias", () => {
    const expected = aliasNames();
    const profiles = Object.values(ICONIC_PRIME_PROFILES);

    expect(expected).toHaveLength(109);
    expect(profiles).toHaveLength(109);
    expect(new Set(profiles.map((profile) => profile.id)).size).toBe(109);
    expect(new Set(profiles.map((profile) => profile.alias))).toEqual(new Set(expected));
    const mechanicalFingerprints = profiles.map((profile) => JSON.stringify([
      profile.dribbling,
      profile.shooting,
      profile.passing,
      profile.receiving,
    ]));
    expect(new Set(mechanicalFingerprints).size).toBe(109);

    for (const profile of profiles) {
      expect(profile.id).toBe(iconicPrimeProfileId(profile.alias));
      expect(ICONIC_PRIME_PROFILES[profile.id]).toBe(profile);
      expect(getIconicPrimeProfileByAlias(profile.alias)).toBe(profile);
      expect(profile.summary.length).toBeGreaterThan(45);
      expect(profile.signatures.length).toBeGreaterThanOrEqual(3);
      expect(profile.peak).toMatch(/^\d{4}(?:-\d{2})?$/);
      expect(profile.primeAge).toBeGreaterThanOrEqual(19);
      expect(profile.primeAge).toBeLessThanOrEqual(36);
      expect(profile.height).toBeGreaterThanOrEqual(160);
      expect(profile.height).toBeLessThanOrEqual(200);
      expect(profile.weight).toBeGreaterThanOrEqual(58);
      expect(profile.weight).toBeLessThanOrEqual(100);

      for (const domain of [profile.dribbling, profile.shooting, profile.passing, profile.receiving]) {
        for (const tendency of Object.values(domain)) {
          expect(Number.isFinite(tendency)).toBe(true);
          expect(tendency).toBeGreaterThanOrEqual(0);
          expect(tendency).toBeLessThanOrEqual(1);
        }
      }
      for (const floor of Object.values(profile.attributeFloors)) {
        expect(floor).toBeGreaterThanOrEqual(1);
        expect(floor).toBeLessThanOrEqual(20);
      }
      expect("overall" in profile).toBe(false);
    }
  });

  it("applies prime identity deterministically without adding an overall rating", () => {
    const base = generatePlayer({ seed: 9191, position: PrimaryPosition.CAM, potentialCeiling: 13 });
    const profile = getIconicPrimeProfileByAlias("Lionel Messio")!;
    const first = structuredClone(base);
    const replay = structuredClone(base);

    applyIconicPrimeProfile(first, profile);
    applyIconicPrimeProfile(replay, profile);

    expect(first).toEqual(replay);
    expect(first.iconicPrimeProfileId).toBe(profile.id);
    expect(getIconicPrimeProfile(first)).toBe(profile);
    expect(getIconicPrimeProfile({ firstName: "Lionel", lastName: "Messio" })).toBe(profile);
    expect(first.age).toBe(27);
    expect(first.preferredFoot).toBe("Left");
    expect(first.ballControl).toBeGreaterThanOrEqual(20);
    expect(first.dribbling).toBeGreaterThanOrEqual(19);
    expect(first.reputation).toBeGreaterThanOrEqual(96);
    expect("overall" in first).toBe(false);
  });

  it("produces contrasting deterministic passing preferences and shot-technique distributions", () => {
    const base = generatePlayer({ seed: 442, position: PrimaryPosition.CAM, potentialCeiling: 16 });
    const controller = { ...base, iconicPrimeProfileId: iconicPrimeProfileId("Xavi Hernandes") };
    const channelFinisher = { ...base, iconicPrimeProfileId: iconicPrimeProfileId("Erling Haland") };
    const wideDistributor = { ...base, iconicPrimeProfileId: iconicPrimeProfileId("David Beckam") };
    const creator = { ...base, iconicPrimeProfileId: iconicPrimeProfileId("Kevan De Bruin") };

    expect(iconicPassFlavorBias(controller, "std"))
      .toBeGreaterThan(iconicPassFlavorBias(channelFinisher, "std") + 8);
    expect(iconicPassFlavorBias(wideDistributor, "switch"))
      .toBeGreaterThan(iconicPassFlavorBias(channelFinisher, "switch") + 6);
    expect(iconicPassFlavorBias(creator, "through", true))
      .toBeGreaterThan(iconicPassFlavorBias(channelFinisher, "through", true) + 8);


    const bergkamp = { ...base, iconicPrimeProfileId: iconicPrimeProfileId("Dennis Bergkam") };
    const gerrard = { ...base, iconicPrimeProfileId: iconicPrimeProfileId("Steven Gerrad") };

    const delicate = shotTechniqueWeights(bergkamp, 16, false, 0.18);
    const forceful = shotTechniqueWeights(gerrard, 16, false, 0.18);

    expect(share(delicate, "chip")).toBeGreaterThan(share(forceful, "chip") + 0.08);
    expect(share(forceful, "power")).toBeGreaterThan(share(delicate, "power"));
    expect(shotTechniqueWeights(bergkamp, 16, false, 0.18)).toEqual(delicate);
  });
});
