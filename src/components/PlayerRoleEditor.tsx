"use client";

import {
  playerRoleDefinition,
  playerRolesForPosition,
} from "@/engine/playerRoles";
import type { PlayerDuty, PlayerRoleAssignment, TacticalPlayerRole } from "@/types";

interface PlayerRoleEditorProps {
  position: string;
  assignment: PlayerRoleAssignment;
  onChange: (assignment: PlayerRoleAssignment) => void;
  compact?: boolean;
}

export default function PlayerRoleEditor({
  position,
  assignment,
  onChange,
  compact = false,
}: PlayerRoleEditorProps) {
  const roles = playerRolesForPosition(position);
  const definition = playerRoleDefinition(assignment.role);
  const chooseRole = (role: TacticalPlayerRole) => {
    const next = playerRoleDefinition(role);
    onChange({
      role,
      duty: next.duties.includes(assignment.duty) ? assignment.duty : next.duties[0],
    });
  };

  return (
    <div className={`rounded-xl border border-gold/20 bg-navy/70 ${compact ? "p-2.5" : "p-3"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="stat-label text-gold">Role &amp; Duty</span>
        <span className="rounded bg-white/[0.06] px-1.5 py-1 text-[8px] font-bold text-white/45">POSITION {position}</span>
      </div>
      <label className="mt-2 block text-[9px] font-semibold uppercase tracking-wide text-white/40">
        Role
        <select
          value={assignment.role}
          onChange={(event) => chooseRole(event.target.value as TacticalPlayerRole)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-card px-2.5 py-2 text-[10px] font-bold normal-case tracking-normal text-white outline-none focus:border-gold"
        >
          {roles.map((role) => (
            <option key={role.role} value={role.role}>{role.label}</option>
          ))}
        </select>
      </label>
      <div className="mt-2">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-white/40">Duty</div>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          {(["Defend", "Support", "Attack"] as PlayerDuty[]).map((duty) => {
            const available = definition.duties.includes(duty);
            const active = assignment.duty === duty;
            return (
              <button
                key={duty}
                type="button"
                disabled={!available}
                onClick={() => onChange({ ...assignment, duty })}
                className={`rounded-lg border px-1.5 py-2 text-[9px] font-bold transition disabled:cursor-not-allowed disabled:opacity-20 ${
                  active ? "border-gold/50 bg-gold text-navy" : "border-white/10 bg-card text-white/50"
                }`}
              >
                {duty}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-white/40">{definition.description}</p>
    </div>
  );
}
