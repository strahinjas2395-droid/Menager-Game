import { describe, expect, it } from "vitest";
import {
  ALL_ATTRS,
  generatePlayer,
  generateSquad,
  positionWeights,
} from "@/database/playerGenerator";
import { SeededRNG } from "@/database/rng";
import { PrimaryPosition } from "@/types";

describe("playerGenerator", () => {
  it("is deterministic for a given seed", () => {
    const a = generatePlayer({ seed: 12345 });
    const b = generatePlayer({ seed: 12345 });
    expect(a).toEqual(b);
  });

  it("keeps every attribute within 1-20", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const p = generatePlayer({ seed });
      for (const attr of ALL_ATTRS) {
        const v = (p as unknown as Record<string, number>)[attr];
        expect(v, `${attr} seed=${seed}`).toBeGreaterThanOrEqual(1);
        expect(v, `${attr} seed=${seed}`).toBeLessThanOrEqual(20);
      }
      expect(p.age).toBeGreaterThanOrEqual(16);
      expect(p.age).toBeLessThanOrEqual(38);
      expect(p.potentialCeiling).toBeGreaterThanOrEqual(4);
      expect(p.potentialCeiling).toBeLessThanOrEqual(20);
      expect(p.playstyles.length).toBeGreaterThanOrEqual(1);
      expect(p.playstyles.length).toBeLessThanOrEqual(3);
      expect(p.shirtNumber).toBeGreaterThanOrEqual(1);
      expect(p.shirtNumber).toBeLessThanOrEqual(99);
    }
  });

  it("uses position weights (ST finishes better than it tackles)", () => {
    expect(positionWeights[PrimaryPosition.ST].finishing).toBeCloseTo(1.3, 5);
    expect(positionWeights[PrimaryPosition.ST].tackling).toBeCloseTo(0.3, 5);
    expect(positionWeights[PrimaryPosition.GK].reflexes).toBeCloseTo(1.5, 5);
    expect(positionWeights[PrimaryPosition.CM].shortPassing).toBeCloseTo(1.25, 5);
  });

  it("generates squads of 25-30 with realistic distribution", () => {
    const rng = new SeededRNG(999);
    const squad = generateSquad("club-x", 1, "Bretherland", rng, 999);
    expect(squad.length).toBeGreaterThanOrEqual(21);
    expect(squad.length).toBeLessThanOrEqual(25);

    const gk = squad.filter((p) => p.primaryPosition === PrimaryPosition.GK).length;
    const def = squad.filter((p) =>
      [PrimaryPosition.RB, PrimaryPosition.CB, PrimaryPosition.LB].includes(p.primaryPosition),
    ).length;
    const fwd = squad.filter((p) =>
      [PrimaryPosition.ST, PrimaryPosition.RW, PrimaryPosition.LW].includes(p.primaryPosition),
    ).length;
    expect(gk).toBeGreaterThanOrEqual(2);
    expect(gk).toBeLessThanOrEqual(3);
    expect(def).toBeGreaterThanOrEqual(7);
    expect(fwd).toBeGreaterThanOrEqual(5);
    expect(fwd).toBeLessThanOrEqual(6);

    // unique shirt numbers
    const numbers = new Set(squad.map((p) => p.shirtNumber));
    expect(numbers.size).toBe(squad.length);

    // all contracted to the club
    for (const p of squad) expect(p.contract.clubId).toBe("club-x");
  });

  it("gives stronger potential in stronger leagues", () => {
    const top = generateSquad("a", 1, "Bretherland", new SeededRNG(1), 1);
    const weak = generateSquad("b", 25, "Bretherland", new SeededRNG(1), 1);
    const avg = (s: typeof top) => s.reduce((sum, p) => sum + p.potentialCeiling, 0) / s.length;
    expect(avg(top)).toBeGreaterThan(avg(weak));
  });
});
