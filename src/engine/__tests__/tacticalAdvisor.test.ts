import { describe, expect, it } from "vitest";
import {
  applyTacticalAdvice,
  generateTacticalAdvice,
  type TacticalAdviceContext,
} from "@/engine/tacticalAdvisor";
import {
  DefensiveLine,
  MentalityLevel,
  PlayStyle,
  PressingIntensity,
  TempoSetting,
  TimeWasting,
  WidthSetting,
  type MatchStats,
  type TacticalSetup,
} from "@/types";

function tactics(): TacticalSetup {
  return {
    formation: "4-3-3",
    playStyle: PlayStyle.Balanced,
    tempo: TempoSetting.Normal,
    passingLength: TempoSetting.Normal,
    defensiveLine: DefensiveLine.Normal,
    pressing: PressingIntensity.Standard,
    width: WidthSetting.Normal,
    mentality: MentalityLevel.Balanced,
    timeWasting: TimeWasting.Late,
    offsideTrap: true,
    counterAttack: false,
    teamInstructions: "Keep our shape",
    instructionCache: { players: {} },
    playerRoles: {},
    positionOverrides: {},
    setPieces: {
      cornerLeftId: null,
      cornerRightId: null,
      freeKickId: null,
      penaltyId: null,
      captainId: null,
    },
  };
}

function stats(changes: Partial<MatchStats> = {}): MatchStats {
  return {
    possessionHome: 50,
    shotsHome: 5,
    shotsOnTargetHome: 2,
    passesAttemptedHome: 100,
    passesCompletedHome: 82,
    tacklesHome: 8,
    foulsHome: 5,
    cornersHome: 2,
    carriesHome: 20,
    throwInsHome: 8,
    crossesHome: 3,
    throughBallsHome: 1,
    dribblesAttemptedHome: 7,
    dribblesCompletedHome: 3,
    knockOnsHome: 2,
    possessionAway: 50,
    shotsAway: 5,
    shotsOnTargetAway: 2,
    passesAttemptedAway: 100,
    passesCompletedAway: 82,
    tacklesAway: 8,
    foulsAway: 5,
    cornersAway: 2,
    carriesAway: 20,
    throwInsAway: 8,
    crossesAway: 3,
    throughBallsAway: 1,
    dribblesAttemptedAway: 7,
    dribblesCompletedAway: 3,
    knockOnsAway: 2,
    ...changes,
  };
}

function context(changes: Partial<TacticalAdviceContext> = {}): TacticalAdviceContext {
  return {
    minute: 45,
    side: "home",
    scoreFor: 0,
    scoreAgainst: 0,
    stats: stats(),
    tactics: tactics(),
    ...changes,
  };
}

describe("tacticalAdvisor", () => {
  it("waits for a meaningful live sample before offering advice", () => {
    const advice = generateTacticalAdvice(context({
      minute: 14,
      stats: stats({
        possessionHome: 20,
        possessionAway: 80,
        shotsHome: 0,
        throughBallsAway: 8,
        crossesAway: 12,
      }),
    }));
    expect(advice).toEqual([]);
  });

  it("offers an actionable late-game plan to protect a lead", () => {
    const current = tactics();
    current.tempo = TempoSetting.VeryFast;
    current.defensiveLine = DefensiveLine.VeryHigh;
    current.mentality = MentalityLevel.Attacking;
    current.timeWasting = TimeWasting.Never;

    const advice = generateTacticalAdvice(context({
      minute: 84,
      scoreFor: 2,
      scoreAgainst: 1,
      tactics: current,
    }));

    expect(advice[0]).toMatchObject({ id: "protect-lead", title: "Close the game down" });
    expect(advice[0].changes).toEqual([
      "Mentality: Attacking → Cautious",
      "Tempo: Very Fast → Slow",
      "Defensive line: Very High → Normal",
      "Time wasting: Never → Always",
    ]);

    const updated = applyTacticalAdvice(current, advice[0]);
    expect(updated).not.toBe(current);
    expect(updated).toMatchObject({
      mentality: MentalityLevel.Cautious,
      tempo: TempoSetting.Slow,
      defensiveLine: DefensiveLine.Normal,
      timeWasting: TimeWasting.Always,
    });
    expect(updated.teamInstructions).toBe("Keep our shape");
    expect(current.tempo).toBe(TempoSetting.VeryFast);
  });

  it("maps away-team telemetry correctly and recommends stopping wide supply", () => {
    const advice = generateTacticalAdvice(context({
      side: "away",
      stats: stats({
        crossesHome: 10,
        crossesAway: 1,
        shotsAway: 5,
      }),
    }));

    expect(advice.some((item) => item.id === "stop-wide-supply")).toBe(true);
    const wide = advice.find((item) => item.id === "stop-wide-supply")!;
    expect(wide.observation).toContain("10 crosses");
    expect(wide.patch).toMatchObject({
      width: WidthSetting.Wide,
      pressing: PressingIntensity.High,
    });
  });

  it("prioritises chasing the match and does not issue conflicting advice", () => {
    const advice = generateTacticalAdvice(context({
      minute: 76,
      side: "away",
      scoreFor: 0,
      scoreAgainst: 2,
      stats: stats({
        possessionAway: 34,
        possessionHome: 66,
        passesAttemptedAway: 100,
        passesCompletedAway: 60,
        passesAttemptedHome: 180,
        passesCompletedHome: 160,
        shotsAway: 1,
      }),
    }));

    expect(advice[0].id).toBe("chase-game");
    expect(advice[0].patch).toMatchObject({
      mentality: MentalityLevel.Attacking,
      tempo: TempoSetting.Fast,
      pressing: PressingIntensity.High,
      timeWasting: TimeWasting.Never,
    });
    const allKeys = advice.flatMap((item) => Object.keys(item.patch));
    expect(new Set(allKeys).size).toBe(allKeys.length);
    expect(advice.length).toBeLessThanOrEqual(2);
    expect(advice.find((item) => item.id === "secure-possession")?.patch.tempo).toBeUndefined();
  });

  it("reacts to poor passing without inventing an overall tactical score", () => {
    const advice = generateTacticalAdvice(context({
      minute: 35,
      stats: stats({
        passesAttemptedHome: 120,
        passesCompletedHome: 78,
        shotsHome: 5,
      }),
    }));

    const secure = advice.find((item) => item.id === "secure-possession");
    expect(secure).toBeDefined();
    expect(secure?.observation).toContain("65%");
    expect(secure?.patch).toMatchObject({ passingLength: TempoSetting.Slow });
    expect(Object.keys(secure ?? {})).not.toContain("overall");
  });

  it("removes a recommendation once its exact controls are already applied", () => {
    const risky = tactics();
    risky.defensiveLine = DefensiveLine.High;
    risky.offsideTrap = true;
    const first = generateTacticalAdvice(context({
      minute: 32,
      tactics: risky,
      stats: stats({ throughBallsAway: 5, shotsHome: 4 }),
    }));
    const protect = first.find((item) => item.id === "protect-space-behind")!;
    expect(protect).toBeDefined();

    const updated = applyTacticalAdvice(risky, protect);
    const second = generateTacticalAdvice(context({
      minute: 32,
      tactics: updated,
      stats: stats({ throughBallsAway: 5, shotsHome: 4 }),
    }));
    expect(second.some((item) => item.id === "protect-space-behind")).toBe(false);
  });

  it("is deterministic for identical match state", () => {
    const current = context({
      minute: 71,
      scoreFor: 1,
      scoreAgainst: 2,
      stats: stats({ throughBallsAway: 4, shotsHome: 2 }),
    });
    expect(generateTacticalAdvice(current)).toEqual(generateTacticalAdvice(current));
  });
});
