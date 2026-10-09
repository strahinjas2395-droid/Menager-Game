import { describe, expect, it } from "vitest";
import { NAME_POOLS, NATIONALITIES, generateName } from "@/database/nameGenerator";
import { SeededRNG } from "@/database/rng";

describe("nameGenerator", () => {
  it("has 15 nationalities with 60+ first and last names each", () => {
    expect(NATIONALITIES).toHaveLength(15);
    for (const nat of NATIONALITIES) {
      const pool = NAME_POOLS[nat];
      expect(pool.firstNames.length, `${nat} firstNames`).toBeGreaterThanOrEqual(60);
      expect(pool.lastNames.length, `${nat} lastNames`).toBeGreaterThanOrEqual(60);
    }
  });

  it("has no duplicate names inside a pool", () => {
    for (const nat of NATIONALITIES) {
      const pool = NAME_POOLS[nat];
      expect(new Set(pool.firstNames).size).toBe(pool.firstNames.length);
      expect(new Set(pool.lastNames).size).toBe(pool.lastNames.length);
    }
  });

  it("generates names from the right pool deterministically with a seed", () => {
    const rng = new SeededRNG(42);
    const a = generateName("Valdoria", rng);
    const rng2 = new SeededRNG(42);
    const b = generateName("Valdoria", rng2);
    expect(a).toEqual(b);
    expect(NAME_POOLS.Valdoria.firstNames).toContain(a.firstName);
    expect(NAME_POOLS.Valdoria.lastNames).toContain(a.lastName);
  });

  it("falls back to Bretherland for unknown nationality", () => {
    const name = generateName("Atlantis");
    expect(NAME_POOLS.Bretherland.firstNames).toContain(name.firstName);
  });
});
