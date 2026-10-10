import {
  PlayStyle,
  type PlayerDuty,
  type PlayerRoleAssignment,
  type TacticalDirectives,
  type TacticalPlayerRole,
} from "@/types";

export interface PlayerRoleDefinition {
  role: TacticalPlayerRole;
  label: string;
  shortLabel: string;
  positions: readonly string[];
  duties: readonly PlayerDuty[];
  description: string;
}

const D = "Defend" as const;
const S = "Support" as const;
const A = "Attack" as const;

export const PLAYER_ROLE_DEFINITIONS: readonly PlayerRoleDefinition[] = [
  { role: "Goalkeeper", label: "Goalkeeper", shortLabel: "GK", positions: ["GK"], duties: [D], description: "Protects the goal, claims crosses and distributes with low positional risk." },
  { role: "SweeperKeeper", label: "Sweeper Keeper", shortLabel: "SK", positions: ["GK"], duties: [D, S, A], description: "Starts higher, attacks space behind the line and takes more responsibility in build-up." },
  { role: "CentralDefender", label: "Central Defender", shortLabel: "CD", positions: ["CB"], duties: [D], description: "Protects the box, holds the defensive line and prioritises secure defending." },
  { role: "BallPlayingDefender", label: "Ball-Playing Defender", shortLabel: "BPD", positions: ["CB"], duties: [D, S], description: "Defends the line but looks for progressive and line-breaking distribution." },
  { role: "Stopper", label: "Stopper", shortLabel: "STP", positions: ["CB"], duties: [D], description: "Steps out early to engage forwards and contest passes into their feet." },
  { role: "CoverDefender", label: "Cover Defender", shortLabel: "COV", positions: ["CB"], duties: [D], description: "Drops behind the line to protect depth and recover against runs in behind." },
  { role: "WideCentreBack", label: "Wide Centre-Back", shortLabel: "WCB", positions: ["CB"], duties: [D, S, A], description: "Defends centrally but widens and can carry into the outside channel." },
  { role: "FullBack", label: "Full-Back", shortLabel: "FB", positions: ["RB", "LB", "RWB", "LWB"], duties: [D, S, A], description: "Balances flank protection with measured support outside the midfield." },
  { role: "WingBack", label: "Wing-Back", shortLabel: "WB", positions: ["RB", "LB", "RWB", "LWB"], duties: [D, S, A], description: "Provides touchline width, overlaps and delivers from advanced areas." },
  { role: "InvertedFullBack", label: "Inverted Full-Back", shortLabel: "IFB", positions: ["RB", "LB", "RWB", "LWB"], duties: [D, S], description: "Moves into central midfield to support circulation and protect transitions." },
  { role: "Anchor", label: "Anchor", shortLabel: "ANC", positions: ["CDM", "DM"], duties: [D], description: "Holds in front of the centre-backs and protects the central lane." },
  { role: "HalfBack", label: "Half-Back", shortLabel: "HB", positions: ["CDM", "DM"], duties: [D], description: "Drops toward the centre-backs in possession and screens counters." },
  { role: "BallWinningMidfielder", label: "Ball-Winning Midfielder", shortLabel: "BWM", positions: ["CDM", "DM", "CM"], duties: [D, S], description: "Leaves the line selectively to press, tackle and recover loose balls." },
  { role: "DeepLyingPlaymaker", label: "Deep-Lying Playmaker", shortLabel: "DLP", positions: ["CDM", "DM", "CM"], duties: [D, S], description: "Offers behind the ball and dictates progression from deeper areas." },
  { role: "CentralMidfielder", label: "Central Midfielder", shortLabel: "CM", positions: ["CDM", "DM", "CM"], duties: [D, S, A], description: "Connects the team with a duty-dependent balance of positioning and forward support." },
  { role: "BoxToBoxMidfielder", label: "Box-to-Box Midfielder", shortLabel: "BBM", positions: ["CM"], duties: [S], description: "Covers both boxes, supports attacks and joins defensive pressure." },
  { role: "Mezzala", label: "Mezzala", shortLabel: "MEZ", positions: ["CM"], duties: [S, A], description: "Drifts into a half-space to combine outside the central lane." },
  { role: "AdvancedPlaymaker", label: "Advanced Playmaker", shortLabel: "AP", positions: ["CM", "CAM", "AM"], duties: [S, A], description: "Finds pockets, receives between lines and attempts incisive passes." },
  { role: "AttackingMidfielder", label: "Attacking Midfielder", shortLabel: "AM", positions: ["CAM", "AM"], duties: [S, A], description: "Operates between midfield and attack, combining or arriving near the box." },
  { role: "ShadowStriker", label: "Shadow Striker", shortLabel: "SS", positions: ["CAM", "AM", "CF"], duties: [A], description: "Breaks beyond the striker and attacks scoring positions aggressively." },
  { role: "Winger", label: "Winger", shortLabel: "W", positions: ["RM", "LM", "RW", "LW"], duties: [S, A], description: "Holds the touchline, runs at defenders and looks to cross." },
  { role: "InsideForward", label: "Inside Forward", shortLabel: "IF", positions: ["RM", "LM", "RW", "LW"], duties: [S, A], description: "Starts wide then drives inside to dribble, combine and shoot." },
  { role: "InvertedWinger", label: "Inverted Winger", shortLabel: "IW", positions: ["RM", "LM", "RW", "LW"], duties: [S, A], description: "Moves into the half-space while still creating for teammates." },
  { role: "WidePlaymaker", label: "Wide Playmaker", shortLabel: "WP", positions: ["RM", "LM", "RW", "LW"], duties: [S, A], description: "Finds creative angles from a flank and switches or threads play." },
  { role: "AdvancedForward", label: "Advanced Forward", shortLabel: "AF", positions: ["ST", "CF"], duties: [A], description: "Threatens the last line, runs behind and carries toward goal." },
  { role: "PressingForward", label: "Pressing Forward", shortLabel: "PF", positions: ["ST", "CF"], duties: [D, S, A], description: "Leads pressure on defenders before offering duty-dependent attacking runs." },
  { role: "TargetForward", label: "Target Forward", shortLabel: "TF", positions: ["ST", "CF"], duties: [S, A], description: "Provides a physical outlet, protects the ball and brings runners into play." },
  { role: "Poacher", label: "Poacher", shortLabel: "P", positions: ["ST", "CF"], duties: [A], description: "Stays high and central, prioritising movement and finishes inside the box." },
  { role: "FalseNine", label: "False Nine", shortLabel: "F9", positions: ["ST", "CF"], duties: [S], description: "Drops away from the centre-backs to link play and create space beyond." },
  { role: "CompleteForward", label: "Complete Forward", shortLabel: "CF", positions: ["ST", "CF"], duties: [S, A], description: "Roams across the attack, combining creation, carrying and penetration." },
  { role: "DeepLyingForward", label: "Deep-Lying Forward", shortLabel: "DLF", positions: ["ST", "CF"], duties: [S, A], description: "Drops toward midfield, holds up possession and links runners around them." },
] as const;

const ROLE_BY_ID = new Map(PLAYER_ROLE_DEFINITIONS.map((definition) => [definition.role, definition]));

export function playerRolesForPosition(position: string): readonly PlayerRoleDefinition[] {
  return PLAYER_ROLE_DEFINITIONS.filter((definition) => definition.positions.includes(position));
}

export function playerRoleDefinition(role: TacticalPlayerRole): PlayerRoleDefinition {
  return ROLE_BY_ID.get(role) ?? PLAYER_ROLE_DEFINITIONS[0];
}

export function playerRoleLabel(assignment: PlayerRoleAssignment): string {
  return `${playerRoleDefinition(assignment.role).label} · ${assignment.duty}`;
}

function baseDefault(position: string): PlayerRoleAssignment {
  switch (position) {
    case "GK": return { role: "Goalkeeper", duty: D };
    case "CB": return { role: "CentralDefender", duty: D };
    case "RB":
    case "LB": return { role: "FullBack", duty: S };
    case "RWB":
    case "LWB": return { role: "WingBack", duty: S };
    case "CDM":
    case "DM": return { role: "Anchor", duty: D };
    case "CM": return { role: "CentralMidfielder", duty: S };
    case "CAM":
    case "AM": return { role: "AttackingMidfielder", duty: S };
    case "RM":
    case "LM": return { role: "Winger", duty: S };
    case "RW":
    case "LW": return { role: "Winger", duty: A };
    case "CF": return { role: "DeepLyingForward", duty: S };
    default: return { role: "AdvancedForward", duty: A };
  }
}

/** Style-aware defaults give AI teams and old saves structured jobs immediately. */
export function defaultPlayerRole(position: string, style: PlayStyle = PlayStyle.Balanced): PlayerRoleAssignment {
  const wideDefender = ["RB", "LB", "RWB", "LWB"].includes(position);
  const wideAttacker = ["RM", "LM", "RW", "LW"].includes(position);
  const holdingMidfielder = ["CDM", "DM"].includes(position);
  const centralMidfielder = position === "CM";
  const forward = ["ST", "CF"].includes(position);

  if (style === PlayStyle.PossessionBased || style === PlayStyle.TikiTaka) {
    if (position === "GK") return { role: "SweeperKeeper", duty: S };
    if (position === "CB") return { role: "BallPlayingDefender", duty: D };
    if (wideDefender) return { role: "InvertedFullBack", duty: S };
    if (holdingMidfielder) return { role: "DeepLyingPlaymaker", duty: D };
    if (centralMidfielder) return { role: "AdvancedPlaymaker", duty: S };
    if (wideAttacker) return { role: "InvertedWinger", duty: S };
    if (forward) return { role: "FalseNine", duty: S };
  }
  if (style === PlayStyle.GegenpressingStyle) {
    if (position === "GK") return { role: "SweeperKeeper", duty: S };
    if (position === "CB") return { role: "BallPlayingDefender", duty: D };
    if (wideDefender) return { role: "WingBack", duty: A };
    if (holdingMidfielder || centralMidfielder) return { role: "BallWinningMidfielder", duty: S };
    if (wideAttacker) return { role: "InsideForward", duty: A };
    if (forward) return { role: "PressingForward", duty: A };
  }
  if (style === PlayStyle.LongBallDirect || style === PlayStyle.RouteOne) {
    if (wideDefender) return { role: "FullBack", duty: S };
    if (holdingMidfielder || centralMidfielder) return { role: "BallWinningMidfielder", duty: D };
    if (wideAttacker) return { role: "Winger", duty: A };
    if (forward) return { role: "TargetForward", duty: A };
  }
  if (style === PlayStyle.WingPlay) {
    if (wideDefender) return { role: "WingBack", duty: A };
    if (wideAttacker) return { role: "Winger", duty: A };
    if (forward) return { role: "TargetForward", duty: A };
  }
  if (style === PlayStyle.DirectCounterAttack) {
    if (position === "CB") return { role: "CoverDefender", duty: D };
    if (wideDefender) return { role: "FullBack", duty: S };
    if (holdingMidfielder || centralMidfielder) return { role: "BallWinningMidfielder", duty: D };
    if (wideAttacker) return { role: "Winger", duty: A };
    if (forward) return { role: "AdvancedForward", duty: A };
  }
  if (style === PlayStyle.ParkTheBus) {
    if (wideDefender) return { role: "FullBack", duty: D };
    if (holdingMidfielder) return { role: "Anchor", duty: D };
    if (centralMidfielder) return { role: "CentralMidfielder", duty: D };
    if (wideAttacker) return { role: "Winger", duty: S };
    if (forward) return { role: "TargetForward", duty: S };
  }
  if (style === PlayStyle.TotalFootball) {
    if (position === "GK") return { role: "SweeperKeeper", duty: A };
    if (position === "CB") return { role: "BallPlayingDefender", duty: S };
    if (wideDefender) return { role: "WingBack", duty: A };
    if (holdingMidfielder) return { role: "DeepLyingPlaymaker", duty: S };
    if (centralMidfielder) return { role: "Mezzala", duty: A };
    if (["CAM", "AM"].includes(position)) return { role: "AdvancedPlaymaker", duty: A };
    if (wideAttacker) return { role: "InsideForward", duty: A };
    if (forward) return { role: "CompleteForward", duty: A };
  }
  return baseDefault(position);
}

/** Validate persisted or worker-delivered assignments against the current slot. */
export function resolvePlayerRoleAssignment(
  value: PlayerRoleAssignment | undefined,
  position: string,
  style: PlayStyle = PlayStyle.Balanced,
): PlayerRoleAssignment {
  const fallback = defaultPlayerRole(position, style);
  if (!value || typeof value !== "object") return fallback;
  const definition = ROLE_BY_ID.get(value.role);
  if (!definition || !definition.positions.includes(position)) return fallback;
  const duty = definition.duties.includes(value.duty) ? value.duty : definition.duties[0];
  return { role: definition.role, duty };
}

export function sanitizePlayerRoleAssignments(
  value: Record<string, PlayerRoleAssignment> | undefined,
  lineup: readonly { playerId: string; position: string }[],
  style: PlayStyle = PlayStyle.Balanced,
): Record<string, PlayerRoleAssignment> {
  const result: Record<string, PlayerRoleAssignment> = {};
  for (const { playerId, position } of lineup) {
    const raw = value?.[playerId];
    if (!raw) continue;
    const resolved = resolvePlayerRoleAssignment(raw, position, style);
    const definition = ROLE_BY_ID.get(raw.role);
    if (definition?.positions.includes(position)) result[playerId] = resolved;
  }
  return result;
}

/**
 * Reconcile a formation change without turning player jobs into slot jobs:
 * inactive players keep their identity-bound assignment, active compatible
 * assignments survive, and only assignments invalid for a player's new slot
 * are removed so the style-aware default can take over.
 */
export function retainCompatiblePlayerRoleAssignments(
  value: Record<string, PlayerRoleAssignment> | undefined,
  lineup: readonly { playerId: string; position: string }[],
  style: PlayStyle = PlayStyle.Balanced,
): Record<string, PlayerRoleAssignment> {
  const activeIds = new Set(lineup.map(({ playerId }) => playerId));
  const inactive = Object.fromEntries(
    Object.entries(value ?? {}).filter(([playerId]) => !activeIds.has(playerId)),
  );
  return {
    ...inactive,
    ...sanitizePlayerRoleAssignments(value, lineup, style),
  };
}

/** Structured role behavior is a baseline; team and free-text player instructions may override it. */
export function directivesForPlayerRole(
  assignment: PlayerRoleAssignment,
  position: string,
): TacticalDirectives {
  let directives: TacticalDirectives;
  switch (assignment.role) {
    case "Goalkeeper": directives = { conserveEnergy: true, riskyPasses: false }; break;
    case "SweeperKeeper": directives = { riskyPasses: assignment.duty !== D, directPassing: assignment.duty === A }; break;
    case "CentralDefender": directives = { holdPosition: true }; break;
    case "BallPlayingDefender": directives = { holdPosition: true, riskyPasses: true, directPassing: assignment.duty === S }; break;
    case "Stopper": directives = { pressHard: true, tightMarking: true }; break;
    case "CoverDefender": directives = { holdPosition: true, pressLess: true, riskyPasses: false }; break;
    case "WideCentreBack": directives = { stayWide: true, forwardRuns: assignment.duty === A, dribbleMore: assignment.duty === A }; break;
    case "FullBack": directives = { stayWide: true, holdPosition: assignment.duty === D, forwardRuns: assignment.duty === A, earlyCross: assignment.duty === A }; break;
    case "WingBack": directives = { stayWide: true, forwardRuns: assignment.duty !== D, earlyCross: true, dribbleMore: assignment.duty === A }; break;
    case "InvertedFullBack": directives = { cutInside: true, holdPosition: assignment.duty === D, shortPassing: true }; break;
    case "Anchor": directives = { holdPosition: true, defensiveDuty: true, pressLess: true, shortPassing: true }; break;
    case "HalfBack": directives = { holdPosition: true, defensiveDuty: true, shortPassing: true }; break;
    case "BallWinningMidfielder": directives = { pressHard: true, tightMarking: true, holdPosition: assignment.duty === D }; break;
    case "DeepLyingPlaymaker": directives = { holdPosition: assignment.duty === D, riskyPasses: true, shortPassing: true, switchPlay: true }; break;
    case "CentralMidfielder": directives = { holdPosition: assignment.duty === D, forwardRuns: assignment.duty === A }; break;
    case "BoxToBoxMidfielder": directives = { roam: true, forwardRuns: true, pressHard: true }; break;
    case "Mezzala": directives = { roam: true, forwardRuns: assignment.duty === A, riskyPasses: true }; break;
    case "AdvancedPlaymaker": directives = { roam: true, riskyPasses: true, shortPassing: true, avoidShooting: assignment.duty === S }; break;
    case "AttackingMidfielder": directives = { roam: assignment.duty === S, forwardRuns: assignment.duty === A, riskyPasses: true }; break;
    case "ShadowStriker": directives = { forwardRuns: true, dribbleMore: true, pressHard: true }; break;
    case "Winger": directives = { stayWide: true, dribbleMore: true, earlyCross: true, forwardRuns: assignment.duty === A }; break;
    case "InsideForward": directives = { cutInside: true, dribbleMore: true, forwardRuns: assignment.duty === A, shootFromDistance: assignment.duty === A }; break;
    case "InvertedWinger": directives = { cutInside: true, dribbleMore: assignment.duty === A, riskyPasses: true, shortPassing: assignment.duty === S }; break;
    case "WidePlaymaker": directives = { stayWide: true, roam: true, riskyPasses: true, switchPlay: true }; break;
    case "AdvancedForward": directives = { forwardRuns: true, dribbleMore: true }; break;
    case "PressingForward": directives = { pressHard: true, forwardRuns: assignment.duty === A, holdPosition: assignment.duty === D }; break;
    case "TargetForward": directives = { targetMan: true, directPassing: false, forwardRuns: assignment.duty === A }; break;
    case "Poacher": directives = { forwardRuns: true, roam: false, pressLess: true }; break;
    case "FalseNine": directives = { roam: true, shortPassing: true, riskyPasses: true, forwardRuns: false }; break;
    case "CompleteForward": directives = { roam: true, dribbleMore: true, riskyPasses: true, forwardRuns: assignment.duty === A }; break;
    case "DeepLyingForward": directives = { targetMan: true, roam: true, shortPassing: true, forwardRuns: assignment.duty === A }; break;
  }

  if (assignment.duty === D) {
    directives.forwardRuns = false;
    if (["CB", "RB", "LB", "RWB", "LWB", "CDM", "DM", "CM"].includes(position)) {
      directives.holdPosition = true;
    }
  } else if (assignment.duty === A && position !== "GK" && position !== "CB") {
    directives.forwardRuns = true;
    directives.holdPosition = false;
    directives.conserveEnergy = false;
  }
  return directives;
}
