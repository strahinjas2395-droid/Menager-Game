import { PressingIntensity } from "@/types";

/**
 * Physical team behaviours behind the pressing slider.
 * Distances use the match engine's pitch units (10 units is roughly one metre).
 */
export interface PressingBehavior {
  /** Players permitted to attack the carrier directly. Capped at two. */
  directPressers: 0 | 1 | 2;
  /** Additional players who move to deny nearby passing outlets. */
  outletMarkers: number;
  /** Maximum distance from which a direct presser begins the chase. */
  engagementRadius: number;
  /** How far the whole defensive block steps toward the opposition goal. */
  blockAdvance: number;
  /** Defensive block responsiveness to the ball on each axis. */
  ballShiftX: number;
  ballShiftY: number;
  /** Movement intensity for players squeezing with the block. */
  shapeIntensity: number;
  /** Movement intensity for outlet-denial runs. */
  outletIntensity: number;
  /** Baseline energy effort while defending without being the direct presser. */
  defensiveEffort: number;
  /** Pressing territory shown on the tactics board. */
  visualReach: number;
  description: string;
}

export const PRESSING_BEHAVIORS: Readonly<Record<PressingIntensity, PressingBehavior>> = {
  [PressingIntensity.None]: {
    directPressers: 0,
    outletMarkers: 0,
    engagementRadius: 0,
    blockAdvance: -46,
    ballShiftX: 0.1,
    ballShiftY: 0.22,
    shapeIntensity: 0.16,
    outletIntensity: 0.16,
    defensiveEffort: 0.42,
    visualReach: 0,
    description: "Hold a deeper shape, protect space and do not chase the ball.",
  },
  [PressingIntensity.Low]: {
    directPressers: 1,
    outletMarkers: 0,
    engagementRadius: 150,
    blockAdvance: -24,
    ballShiftX: 0.13,
    ballShiftY: 0.28,
    shapeIntensity: 0.21,
    outletIntensity: 0.38,
    defensiveEffort: 0.5,
    visualReach: 65,
    description: "The nearest player closes only inside roughly 15 metres while the block stays cautious.",
  },
  [PressingIntensity.Standard]: {
    directPressers: 1,
    outletMarkers: 1,
    engagementRadius: 230,
    blockAdvance: 0,
    ballShiftX: 0.17,
    ballShiftY: 0.34,
    shapeIntensity: 0.3,
    outletIntensity: 0.56,
    defensiveEffort: 0.58,
    visualReach: 140,
    description: "One player closes the carrier and one teammate screens the nearest passing lane.",
  },
  [PressingIntensity.High]: {
    directPressers: 2,
    outletMarkers: 2,
    engagementRadius: 320,
    blockAdvance: 42,
    ballShiftX: 0.23,
    ballShiftY: 0.43,
    shapeIntensity: 0.41,
    outletIntensity: 0.75,
    defensiveEffort: 0.74,
    visualReach: 240,
    description: "Two players close from different angles, two lock outlets and the whole block steps up.",
  },
  [PressingIntensity.Extreme]: {
    directPressers: 2,
    outletMarkers: 4,
    engagementRadius: 420,
    blockAdvance: 82,
    ballShiftX: 0.3,
    ballShiftY: 0.52,
    shapeIntensity: 0.54,
    outletIntensity: 0.9,
    defensiveEffort: 0.94,
    visualReach: 360,
    description: "Relentless two-player pressure plus four outlet locks; the team squeezes high at a major stamina cost.",
  },
};

export function pressingBehavior(intensity: PressingIntensity | undefined): PressingBehavior {
  return PRESSING_BEHAVIORS[intensity ?? PressingIntensity.Standard];
}
