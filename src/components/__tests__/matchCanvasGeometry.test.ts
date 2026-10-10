import { describe, expect, it } from "vitest";
import { MATCH_MARKER_GEOMETRY, MATCH_PITCH_VIEW } from "@/components/MatchCanvas";

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

  it("provides visible runoff beyond all four touch and goal lines", () => {
    expect(MATCH_PITCH_VIEW.pitchLeft).toBeGreaterThanOrEqual(44);
    expect(MATCH_PITCH_VIEW.viewWidth - MATCH_PITCH_VIEW.pitchRight).toBeGreaterThanOrEqual(44);
    expect(MATCH_PITCH_VIEW.pitchTop).toBeGreaterThanOrEqual(40);
    expect(MATCH_PITCH_VIEW.viewHeight - MATCH_PITCH_VIEW.pitchBottom).toBeGreaterThanOrEqual(40);
    expect(MATCH_PITCH_VIEW.horizontalRunoff).toBeGreaterThan(MATCH_PITCH_VIEW.goalDepth);
  });

  it("keeps markers small relative to the full-size pitch", () => {
    expect(MATCH_MARKER_GEOMETRY.playerDiameterMetres).toBeLessThanOrEqual(1.2);
    expect(MATCH_MARKER_GEOMETRY.playerRadius * 2).toBeLessThan(15);
    expect(MATCH_MARKER_GEOMETRY.ballRadius).toBeLessThan(MATCH_MARKER_GEOMETRY.playerRadius);
  });
});
