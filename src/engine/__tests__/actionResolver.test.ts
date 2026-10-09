import { describe, expect, it } from "vitest";
import {
  resolveDribble,
  resolveHeader,
  resolvePass,
  resolvePenalty,
  resolveShot,
  resolveTackle,
} from "@/engine/actionResolver";
import { SeededRNG } from "@/database/rng";
import type { Player } from "@/types";

/** Minimal stat carrier — actionResolver only reads named attributes. */
const P = (over: Partial<Record<string, number>>): Player =>
  ({
    shortPassing: 10,
    technique: 10,
    finishing: 10,
    composure: 10,
    reflexes: 10,
    shotStopping: 10,
    communication: 10,
    oneOnOnes: 10,
    dribbling: 10,
    agility: 10,
    pace: 10,
    tackling: 10,
    positioning: 10,
    anticipation: 10,
    aggression: 10,
    heading: 10,
    jumping: 10,
    offTheBall: 10,
    aerialDuels: 10,
    marking: 10,
    penaltyTaking: 10,
    ...over,
  }) as unknown as Player;

describe("actionResolver", () => {
  it("resolvePass favors stronger passers under pressure", () => {
    const goodRng = new SeededRNG(1);
    const badRng = new SeededRNG(1);
    let goodFails = 0;
    let badFails = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const good = resolvePass(P({ shortPassing: 18, technique: 18 }), P({}), 15, 1, 0, goodRng);
      if (!good.success) goodFails++;
      const bad = resolvePass(P({ shortPassing: 2, technique: 2 }), P({}), 15, 1, 0, badRng);
      if (!bad.success) badFails++;
    }
    expect(badFails / N).toBeGreaterThan(goodFails / N);
    expect(goodFails / N).toBeLessThan(0.1); // base > 97 clamped: nearly certain
    expect(badFails / N).toBeGreaterThan(0.3); // base ~56: fails often
    expect(badFails / N).toBeLessThan(0.6);
  });

  it("resolveShot: great striker scores, weak striker vs great keeper doesn't", () => {
    const rng = new SeededRNG(4);
    const strongGk = P({ reflexes: 18, shotStopping: 18, communication: 14, oneOnOnes: 16 });
    const weakGk = P({ reflexes: 4, shotStopping: 4, communication: 8, oneOnOnes: 4 });

    let goodGoals = 0;
    let badGoals = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const r = resolveShot(P({ finishing: 18, composure: 18 }), weakGk, 10, 0.3, 0, rng);
      expect([r.goal, r.saved, r.blocked, r.wide].filter(Boolean)).toHaveLength(1);
      if (r.goal) goodGoals++;
      const r2 = resolveShot(P({ finishing: 4, composure: 4 }), strongGk, 10, 0.3, 0, rng);
      expect([r2.goal, r2.saved, r2.blocked, r2.wide].filter(Boolean)).toHaveLength(1);
      if (r2.goal) badGoals++;
    }
    expect(goodGoals / N).toBeGreaterThan(0.6);
    expect(badGoals / N).toBeLessThan(0.06);
  });

  it("resolvePenalty respects taker and keeper quality (single roll)", () => {
    const rng = new SeededRNG(9);
    const goodGk = P({ reflexes: 18, oneOnOnes: 18 });
    const badGk = P({ reflexes: 4, oneOnOnes: 4 });
    const N = 4000;
    let greatTaker = 0;
    let poorTaker = 0;
    for (let i = 0; i < N; i++) {
      const r = resolvePenalty(P({ penaltyTaking: 18 }), badGk, rng);
      expect(r.goal).toBe(!r.saved);
      if (r.goal) greatTaker++;
    }
    for (let i = 0; i < N; i++) {
      if (resolvePenalty(P({ penaltyTaking: 4 }), goodGk, rng).goal) poorTaker++;
    }
    expect(greatTaker / N).toBeGreaterThan(0.85); // 78+18-2-2 = 92
    expect(poorTaker / N).toBeGreaterThan(0.55); // 78+4-9-9 = 64
    expect(poorTaker / N).toBeLessThan(0.72);
    expect(greatTaker).toBeGreaterThan(poorTaker);
  });

  it("resolveTackle: aggressive defenders foul and get carded more", () => {
    const rng = new SeededRNG(5);
    const attacker = P({ dribbling: 10, agility: 10 });
    const angry = P({ tackling: 18, anticipation: 18, aggression: 19 });
    const calm = P({ tackling: 18, anticipation: 18, aggression: 3 });
    const N = 4000;
    let angryCards = 0;
    let calmCards = 0;
    for (let i = 0; i < N; i++) {
      const r = resolveTackle(angry, attacker, rng);
      expect(r.won && r.foul).toBe(false); // never both
      if (r.card !== "none") {
        expect(r.foul).toBe(true); // cards only come from fouls
        angryCards++;
      }
      const c = resolveTackle(calm, attacker, rng);
      if (c.card !== "none") calmCards++;
    }
    expect(angryCards).toBeGreaterThan(calmCards * 2);
    expect(angryCards / N).toBeLessThan(0.5);
  });

  it("resolveDribble: equal stats ≈ coin flip, outcomes exclusive", () => {
    const rng = new SeededRNG(11);
    const att = P({ dribbling: 10, agility: 10, pace: 10 });
    const def = P({ tackling: 10, positioning: 10, pace: 10 });
    const N = 3000;
    let beats = 0;
    for (let i = 0; i < N; i++) {
      const r = resolveDribble(att, def, rng);
      expect([r.beat, r.foul, r.lost].filter(Boolean)).toHaveLength(1);
      if (r.beat) beats++;
    }
    expect(beats / N).toBeGreaterThan(0.4);
    expect(beats / N).toBeLessThan(0.6);
  });

  it("resolveHeader: attacker wins more with better aerial stats", () => {
    const rng = new SeededRNG(13);
    const gk = P({ reflexes: 12, oneOnOnes: 12 });
    const N = 3000;
    let strongWins = 0;
    let weakWins = 0;
    const strongAtt = P({ heading: 16, jumping: 16, offTheBall: 14, composure: 14 });
    const weakAtt = P({ heading: 6, jumping: 6, offTheBall: 6, composure: 6 });
    const defender = P({ aerialDuels: 12, positioning: 12, marking: 12 });
    for (let i = 0; i < N; i++) {
      const r = resolveHeader(strongAtt, defender, gk, 0.5, rng);
      expect([r.goal, r.saved, r.cleared, r.wide].filter(Boolean)).toHaveLength(1);
      if (r.goal || r.saved || r.wide) expect(r.cleared).toBe(false);
      if (!r.cleared) strongWins++;
      const w = resolveHeader(weakAtt, defender, gk, 0.5, rng);
      if (!w.cleared) weakWins++;
    }
    expect(strongWins / N).toBeGreaterThan(weakWins / N);
    expect(strongWins / N).toBeGreaterThan(0.55);
  });
});
