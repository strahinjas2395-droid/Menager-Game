import { describe, expect, it } from "vitest";
import {
  resolveAerialDuel,
  resolveDribble,
  resolveHeader,
  resolveHoldOff,
  resolveLooseBallDuel,
  resolvePass,
  resolvePenalty,
  resolveShot,
  resolveTackle,
} from "@/engine/actionResolver";
import { SeededRNG } from "@/database/rng";
import { iconicPrimeProfileId } from "@/engine/iconicPrimeProfiles";
import { PlaystyleTag, type Player } from "@/types";

/** Minimal stat carrier — actionResolver only reads named attributes. */
const P = (over: Partial<Player>): Player =>
  ({
    shortPassing: 10,
    longPassing: 10,
    crossing: 10,
    creativity: 10,
    decisions: 10,
    technique: 10,
    finishing: 10,
    longShots: 10,
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
    ballControl: 10,
    strength: 10,
    balance: 10,
    bravery: 10,
    height: 180,
    penaltyTaking: 10,
    playstyles: [],
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
    // Even elite one-on-ones are not penalties: a clear 10 m chance should be
    // dangerous without becoming a 60–70% automatic goal.
    expect(goodGoals / N).toBeGreaterThan(0.3);
    expect(goodGoals / N).toBeLessThan(0.5);
    expect(badGoals / N).toBeLessThan(0.06);
  });

  it("never invents a defensive block when the shooter has no physical pressure", () => {
    const rng = new SeededRNG(41);
    const shooter = P({ finishing: 10, composure: 10, longShots: 10 });
    const keeper = P({ reflexes: 12, shotStopping: 12, communication: 12 });
    for (let i = 0; i < 2000; i++) {
      expect(resolveShot(shooter, keeper, 22, 0.45, 0, rng).blocked).toBe(false);
    }
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

  it("keeps iconic technique familiarity contextual while equal attributes still execute it", () => {
    const closeControlRng = new SeededRNG(111);
    const channelRng = new SeededRNG(111);
    const defender = P({ tackling: 12, positioning: 12, pace: 12 });
    const common = { dribbling: 12, agility: 12, pace: 12, flair: 12 };
    const closeController = P({
      ...common,
      iconicPrimeProfileId: iconicPrimeProfileId("Ronaldo Gaucho"),
    });
    const channelFinisher = P({
      ...common,
      iconicPrimeProfileId: iconicPrimeProfileId("Erling Haland"),
    });
    let controllerBeats = 0;
    let channelBeats = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      if (resolveDribble(closeController, defender, closeControlRng, "feint").beat) controllerBeats++;
      if (resolveDribble(channelFinisher, defender, channelRng, "feint").beat) channelBeats++;
    }

    expect(controllerBeats).toBeGreaterThan(channelBeats + 90);
    expect(controllerBeats / N).toBeLessThan(0.7);
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

  it("physical loose-ball races reward acceleration and anticipation", () => {
    const rng = new SeededRNG(71);
    const sharp = P({ pace: 18, acceleration: 18, anticipation: 18, strength: 12 });
    const slow = P({ pace: 5, acceleration: 5, anticipation: 5, strength: 12 });
    let sharpWins = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      if (resolveLooseBallDuel(sharp, slow, rng) === "a") sharpWins++;
    }
    expect(sharpWins / N).toBeGreaterThan(0.9);
  });

  it("strength and balance make shielding materially effective", () => {
    const strongRng = new SeededRNG(81);
    const weakRng = new SeededRNG(81);
    const defender = P({ strength: 13, aggression: 13, tackling: 13 });
    let strongHolds = 0;
    let weakHolds = 0;
    const N = 2500;
    for (let i = 0; i < N; i++) {
      if (resolveHoldOff(P({ strength: 19, balance: 18, ballControl: 16 }), defender, strongRng)) strongHolds++;
      if (resolveHoldOff(P({ strength: 4, balance: 5, ballControl: 8 }), defender, weakRng)) weakHolds++;
    }
    expect(strongHolds / N).toBeGreaterThan(weakHolds / N + 0.35);
  });

  it("height, jumping and aerial-duel skill decide dropping balls", () => {
    const rng = new SeededRNG(91);
    const dominant = P({ height: 195, jumping: 18, heading: 17, aerialDuels: 18, strength: 17, bravery: 16 });
    const small = P({ height: 168, jumping: 6, heading: 7, aerialDuels: 6, strength: 7, bravery: 8 });
    let wins = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) if (resolveAerialDuel(dominant, small, rng) === "a") wins++;
    expect(wins / N).toBeGreaterThan(0.92);
  });


  it("materially applies passing, dribbling and set-piece playstyles", () => {
    const plainPassRng = new SeededRNG(1201);
    const specialistPassRng = new SeededRNG(1201);
    const plainDribbleRng = new SeededRNG(1202);
    const specialistDribbleRng = new SeededRNG(1202);
    const plainPenaltyRng = new SeededRNG(1203);
    const specialistPenaltyRng = new SeededRNG(1203);
    let plainPasses = 0;
    let specialistPasses = 0;
    let plainDribbles = 0;
    let specialistDribbles = 0;
    let plainPenalties = 0;
    let specialistPenalties = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      if (resolvePass(P({}), P({}), 24, 0.35, 12, plainPassRng, "through").success) plainPasses++;
      if (resolvePass(
        P({ playstyles: [PlaystyleTag.ThroughBallSpecialist] }),
        P({ playstyles: [PlaystyleTag.SpaceInterpreter] }),
        24,
        0.35,
        12,
        specialistPassRng,
        "through",
      ).success) specialistPasses++;
      if (resolveDribble(P({}), P({}), plainDribbleRng).beat) plainDribbles++;
      if (resolveDribble(
        P({ playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.PressResistant] }),
        P({}),
        specialistDribbleRng,
      ).beat) specialistDribbles++;
      if (resolvePenalty(P({}), P({}), plainPenaltyRng).goal) plainPenalties++;
      if (resolvePenalty(
        P({ playstyles: [PlaystyleTag.SetPieceSpecialist] }),
        P({}),
        specialistPenaltyRng,
      ).goal) specialistPenalties++;
    }
    expect(specialistPasses).toBeGreaterThan(plainPasses + 150);
    expect(specialistDribbles).toBeGreaterThan(plainDribbles + 250);
    expect(specialistPenalties).toBeGreaterThan(plainPenalties + 100);
  });

  it("long-shot specialists score from range more often than poor shooters", () => {
    const goodRng = new SeededRNG(141);
    const badRng = new SeededRNG(141);
    const keeper = P({ reflexes: 12, shotStopping: 12, communication: 12 });
    const specialist = P({ longShots: 19, technique: 17, composure: 16, finishing: 12 });
    const poor = P({ longShots: 4, technique: 7, composure: 9, finishing: 9 });
    let goodGoals = 0;
    let poorGoals = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      if (resolveShot(specialist, keeper, 29, 0.2, 0.15, goodRng).goal) goodGoals++;
      if (resolveShot(poor, keeper, 29, 0.2, 0.15, badRng).goal) poorGoals++;
    }
    expect(goodGoals / N).toBeGreaterThan(0.07);
    expect(poorGoals / N).toBeLessThan(0.025);
    expect(goodGoals).toBeGreaterThan(poorGoals * 4);
  });

});
