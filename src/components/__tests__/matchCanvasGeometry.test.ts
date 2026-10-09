import { describe, expect, it } from "vitest";
import { MATCH_PITCH_VIEW } from "@/components/MatchCanvas";

describe("live match pitch geometry", () => {
  it("places both goal backs outside their respective goal lines", () => {
    expect(MATCH_PITCH_VIEW.leftGoalBack).toBeLessThan(MATCH_PITCH_VIEW.pitchLeft);
    expect(MATCH_PITCH_VIEW.rightGoalBack).toBeGreaterThan(MATCH_PITCH_VIEW.pitchRight);
    expect(MATCH_PITCH_VIEW.pitchLeft - MATCH_PITCH_VIEW.leftGoalBack)
      .toBe(MATCH_PITCH_VIEW.goalDepth);
    expect(MATCH_PITCH_VIEW.rightGoalBack - MATCH_PITCH_VIEW.pitchRight)
      .toBe(MATCH_PITCH_VIEW.goalDepth);
  });

  it("keeps both exterior nets inside the visible canvas", () => {
    expect(MATCH_PITCH_VIEW.leftGoalBack).toBeGreaterThanOrEqual(0);
    expect(MATCH_PITCH_VIEW.rightGoalBack).toBeLessThanOrEqual(MATCH_PITCH_VIEW.viewWidth);
  });
});
