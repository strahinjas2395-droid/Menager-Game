import { describe, expect, it } from "vitest";
import {
  formatMatchClock,
  MATCH_SECONDS_PER_HALF,
  MATCH_TIME_SCALE,
  REAL_SECONDS_PER_HALF,
} from "@/engine/matchClock";

describe("fixed match clock", () => {
  it("maps one 45-minute half to exactly eight real minutes", () => {
    expect(REAL_SECONDS_PER_HALF).toBe(480);
    expect(MATCH_SECONDS_PER_HALF).toBe(2700);
    expect(MATCH_TIME_SCALE).toBeCloseTo(5.625, 8);
    expect(REAL_SECONDS_PER_HALF * MATCH_TIME_SCALE).toBe(MATCH_SECONDS_PER_HALF);
  });

  it("shows seconds throughout regulation and stoppage time", () => {
    expect(formatMatchClock(0)).toBe("0:00");
    expect(formatMatchClock(65.9)).toBe("1:05");
    expect(formatMatchClock(2699.9)).toBe("44:59");
    expect(formatMatchClock(2700)).toBe("45:00");
    expect(formatMatchClock(5400)).toBe("90:00");
    expect(formatMatchClock(5437)).toBe("90+0:37");
    expect(formatMatchClock(5525)).toBe("90+2:05");
  });
});
