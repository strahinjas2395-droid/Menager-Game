import { describe, expect, it } from "vitest";
import {
  PLAYER_ROLE_DEFINITIONS,
  defaultPlayerRole,
  directivesForPlayerRole,
  playerRolesForPosition,
  resolvePlayerRoleAssignment,
  retainCompatiblePlayerRoleAssignments,
  sanitizePlayerRoleAssignments,
} from "@/engine/playerRoles";
import { PlayStyle, type PlayerRoleAssignment } from "@/types";

const FORMATION_POSITIONS = ["GK", "RB", "LB", "CB", "RWB", "LWB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "CF", "ST"];

describe("structured player roles and duties", () => {
  it("offers compatible roles and a valid default for every formation position", () => {
    for (const position of FORMATION_POSITIONS) {
      const options = playerRolesForPosition(position);
      const assignment = defaultPlayerRole(position, PlayStyle.Balanced);
      expect(options.length, position).toBeGreaterThan(0);
      const definition = options.find((option) => option.role === assignment.role);
      expect(definition, `${position}:${assignment.role}`).toBeDefined();
      expect(definition?.duties).toContain(assignment.duty);
    }
    expect(new Set(PLAYER_ROLE_DEFINITIONS.map((definition) => definition.role)).size)
      .toBe(PLAYER_ROLE_DEFINITIONS.length);
  });

  it("rejects incompatible or invented persisted roles and duties", () => {
    expect(resolvePlayerRoleAssignment(
      { role: "Poacher", duty: "Attack" },
      "CB",
      PlayStyle.Balanced,
    )).toEqual({ role: "CentralDefender", duty: "Defend" });

    const corrupted = {
      role: "MagicQuarterback",
      duty: "Destroy",
    } as unknown as PlayerRoleAssignment;
    expect(resolvePlayerRoleAssignment(corrupted, "CM", PlayStyle.Balanced))
      .toEqual({ role: "CentralMidfielder", duty: "Support" });

    // A valid role with an invalid duty is retained but coerced to its first
    // supported duty instead of reaching the simulation unchecked.
    expect(resolvePlayerRoleAssignment(
      { role: "FalseNine", duty: "Attack" },
      "ST",
      PlayStyle.Balanced,
    )).toEqual({ role: "FalseNine", duty: "Support" });
  });

  it("sanitizes assignments by exact player identity and current position", () => {
    const sanitized = sanitizePlayerRoleAssignments({
      striker: { role: "Poacher", duty: "Attack" },
      centreBack: { role: "AdvancedForward", duty: "Attack" },
      unknown: { role: "Winger", duty: "Attack" },
    }, [
      { playerId: "striker", position: "ST" },
      { playerId: "centreBack", position: "CB" },
    ]);
    expect(sanitized).toEqual({
      striker: { role: "Poacher", duty: "Attack" },
    });
  });

  it("retains identity-bound compatible roles across formation changes", () => {
    expect(retainCompatiblePlayerRoleAssignments({
      retainedStarter: { role: "WingBack", duty: "Attack" },
      incompatibleStarter: { role: "Poacher", duty: "Attack" },
      substitute: { role: "TargetForward", duty: "Support" },
    }, [
      { playerId: "retainedStarter", position: "RB" },
      { playerId: "incompatibleStarter", position: "CM" },
    ])).toEqual({
      retainedStarter: { role: "WingBack", duty: "Attack" },
      substitute: { role: "TargetForward", duty: "Support" },
    });
  });

  it("turns roles and duties into materially different movement and decision baselines", () => {
    const defend = directivesForPlayerRole({ role: "FullBack", duty: "Defend" }, "RB");
    const attack = directivesForPlayerRole({ role: "WingBack", duty: "Attack" }, "RB");
    expect(defend).toMatchObject({ holdPosition: true, forwardRuns: false, stayWide: true });
    expect(attack).toMatchObject({ forwardRuns: true, earlyCross: true, dribbleMore: true, stayWide: true });

    const falseNine = directivesForPlayerRole({ role: "FalseNine", duty: "Support" }, "ST");
    const poacher = directivesForPlayerRole({ role: "Poacher", duty: "Attack" }, "ST");
    expect(falseNine).toMatchObject({ roam: true, shortPassing: true, forwardRuns: false });
    expect(poacher).toMatchObject({ forwardRuns: true, roam: false, pressLess: true });
  });

  it("gives contrasting team identities different structured defaults", () => {
    expect(defaultPlayerRole("ST", PlayStyle.TikiTaka)).toEqual({ role: "FalseNine", duty: "Support" });
    expect(defaultPlayerRole("ST", PlayStyle.GegenpressingStyle)).toEqual({ role: "PressingForward", duty: "Attack" });
    expect(defaultPlayerRole("ST", PlayStyle.RouteOne)).toEqual({ role: "TargetForward", duty: "Attack" });
    expect(defaultPlayerRole("RB", PlayStyle.PossessionBased)).toEqual({ role: "InvertedFullBack", duty: "Support" });
    expect(defaultPlayerRole("RB", PlayStyle.WingPlay)).toEqual({ role: "WingBack", duty: "Attack" });
  });
});
