"use client";

import { Plus, Target, Trash2 } from "lucide-react";
import {
  defaultOpponentPlayerPlan,
  summarizeOpponentInstruction,
  upsertOpponentInstruction,
} from "@/engine/matchPlan";
import type { OpponentMatchPlan, OpponentPlayerPlan, Player } from "@/types";

export interface PlanEditorPlayer {
  player: Player;
  role?: string;
  shirtNumber?: number;
}

interface OpponentPlanEditorProps {
  plan: OpponentMatchPlan;
  ownPlayers: readonly PlanEditorPlayer[];
  opponents: readonly PlanEditorPlayer[];
  onChange: (plan: OpponentMatchPlan) => void;
  compact?: boolean;
  disabled?: boolean;
}

const selectClass = "w-full rounded-lg border border-white/10 bg-navy px-2 py-2 text-[10px] font-semibold text-white outline-none focus:border-gold";

export default function OpponentPlanEditor({
  plan,
  ownPlayers,
  opponents,
  onChange,
  compact = false,
  disabled = false,
}: OpponentPlanEditorProps) {
  const unusedTargets = opponents.filter(
    ({ player }) => !plan.instructions.some((instruction) => instruction.targetPlayerId === player.id),
  );

  const addTarget = (targetId: string) => {
    const target = opponents.find(({ player }) => player.id === targetId)?.player;
    if (!target || plan.instructions.length >= 8) return;
    // Start with one deliberate instruction so the validated plan does not
    // retain empty target rows.
    onChange(upsertOpponentInstruction(plan, {
      ...defaultOpponentPlayerPlan(target),
      tightMarking: true,
    }));
  };

  const update = (instruction: OpponentPlayerPlan) =>
    onChange(upsertOpponentInstruction(plan, instruction));

  const remove = (targetPlayerId: string) => onChange({
    ...plan,
    instructions: plan.instructions.filter((instruction) => instruction.targetPlayerId !== targetPlayerId),
  });

  return (
    <section className={`rounded-xl border border-gold/25 bg-card ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-gold">
            <Target size={15} />
            <h2 className="stat-label text-gold">Opponent Match Plan</h2>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-white/45">
            Assign exact opponents and markers. Instructions change positioning and decisions; they never guarantee an outcome.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-gold/10 px-2 py-1 text-[9px] font-bold text-gold">
          {plan.instructions.length}/8 targets
        </span>
      </div>

      {!disabled && unusedTargets.length > 0 && plan.instructions.length < 8 && (
        <label className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-white/15 bg-navy/60 p-2">
          <Plus size={14} className="shrink-0 text-gold" />
          <span className="sr-only">Add opponent target</span>
          <select
            value=""
            onChange={(event) => addTarget(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[10px] font-semibold text-white/65 outline-none"
          >
            <option value="" className="bg-navy">Add an exact opponent…</option>
            {unusedTargets.map((entry) => (
              <option key={entry.player.id} value={entry.player.id} className="bg-navy">
                {playerLabel(entry)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-3 space-y-3">
        {plan.instructions.map((instruction) => {
          const target = opponents.find(({ player }) => player.id === instruction.targetPlayerId);
          const summary = summarizeOpponentInstruction(instruction);
          return (
            <article key={instruction.targetPlayerId} className="rounded-xl border border-white/10 bg-navy/70 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-white">{target ? playerLabel(target) : instruction.targetPlayerName}</div>
                  <div className="mt-0.5 truncate text-[9px] text-gold/70">{summary.join(" · ") || "No active instruction"}</div>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => remove(instruction.targetPlayerId)}
                    className="rounded-lg p-1.5 text-white/35 hover:bg-red-500/10 hover:text-red-300"
                    aria-label={`Remove plan for ${instruction.targetPlayerName}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
                <PlanSelect label="Exact marker">
                  <select
                    disabled={disabled}
                    value={instruction.markerPlayerId ?? ""}
                    onChange={(event) => {
                      const marker = ownPlayers.find(({ player }) => player.id === event.target.value)?.player;
                      update({
                        ...instruction,
                        markerPlayerId: marker?.id,
                        markerPlayerName: marker ? `${marker.firstName} ${marker.lastName}` : undefined,
                      });
                    }}
                    className={selectClass}
                  >
                    <option value="">Zonal / nearest defender</option>
                    {instruction.markerPlayerId && !ownPlayers.some(({ player }) => player.id === instruction.markerPlayerId) && (
                      <option value={instruction.markerPlayerId} disabled>Unavailable · {instruction.markerPlayerName ?? "previous marker"}</option>
                    )}
                    {ownPlayers.filter((entry) => entry.role !== "GK" && entry.player.primaryPosition !== "GK").map((entry) => (
                      <option
                        key={entry.player.id}
                        value={entry.player.id}
                        disabled={plan.instructions.some((other) =>
                          other.targetPlayerId !== instruction.targetPlayerId && other.markerPlayerId === entry.player.id
                        )}
                      >
                        {playerLabel(entry)}
                      </option>
                    ))}
                  </select>
                </PlanSelect>

                <PlanSelect label="Pressure trigger">
                  <select
                    disabled={disabled}
                    value={instruction.pressing}
                    onChange={(event) => {
                      const pressing = event.target.value as OpponentPlayerPlan["pressing"];
                      update({ ...instruction, pressing, doubleTeam: pressing === "standOff" ? false : instruction.doubleTeam });
                    }}
                    className={selectClass}
                  >
                    <option value="normal">Team default</option>
                    <option value="pressOnReceive">Press on reception</option>
                    <option value="standOff">Stand off</option>
                  </select>
                </PlanSelect>

                <PlanSelect label="Show direction">
                  <select
                    disabled={disabled}
                    value={instruction.showOnto}
                    onChange={(event) => update({ ...instruction, showOnto: event.target.value as OpponentPlayerPlan["showOnto"] })}
                    className={selectClass}
                  >
                    <option value="normal">Natural / team shape</option>
                    <option value="inside">Show inside</option>
                    <option value="outside">Show outside</option>
                    <option value="weakFoot">Onto weak foot</option>
                  </select>
                </PlanSelect>

                <PlanSelect label="Attack their channel">
                  <select
                    disabled={disabled}
                    value={instruction.attackApproach}
                    onChange={(event) => update({ ...instruction, attackApproach: event.target.value as OpponentPlayerPlan["attackApproach"] })}
                    className={selectClass}
                  >
                    <option value="none">No special focus</option>
                    <option value="pace">Exploit with pace</option>
                    <option value="dribble">Run at them</option>
                    <option value="aerial">Attack aerially</option>
                  </select>
                </PlanSelect>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <PlanToggle
                  label="Tight mark"
                  active={instruction.tightMarking}
                  disabled={disabled}
                  onChange={(value) => update({ ...instruction, tightMarking: value })}
                />
                <PlanToggle
                  label="Double-team"
                  active={instruction.doubleTeam}
                  disabled={disabled}
                  onChange={(value) => update({
                    ...instruction,
                    doubleTeam: value,
                    pressing: value && instruction.pressing === "standOff" ? "normal" : instruction.pressing,
                  })}
                />
                <PlanToggle
                  label="Stop crosses"
                  active={instruction.preventCrosses}
                  disabled={disabled}
                  onChange={(value) => update({ ...instruction, preventCrosses: value })}
                />
              </div>
            </article>
          );
        })}

        {plan.instructions.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-[10px] text-white/35">
            No opponent-specific assignments yet. Team tactics remain in force.
          </div>
        )}
      </div>

      <p className="mt-3 text-[9px] leading-relaxed text-white/30">
        At most two players can press the ball at once. Double-team and press instructions share that physical cap.
      </p>
    </section>
  );
}

function PlanSelect({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-[9px] font-semibold uppercase tracking-wide text-white/40">
      {label}
      <span className="mt-1 block normal-case tracking-normal">{children}</span>
    </label>
  );
}

function PlanToggle({
  label,
  active,
  disabled,
  onChange,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onChange: (active: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!active)}
      className={`rounded-lg border px-2 py-2 text-[9px] font-bold transition disabled:opacity-50 ${
        active ? "border-gold/45 bg-gold/10 text-gold" : "border-white/10 bg-card text-white/45"
      }`}
    >
      {label}<span className="ml-1 text-[8px]">{active ? "ON" : "OFF"}</span>
    </button>
  );
}

function playerLabel({ player, role, shirtNumber }: PlanEditorPlayer): string {
  const number = shirtNumber ?? player.shirtNumber;
  return `#${number} ${player.firstName} ${player.lastName}${role ? ` · ${role}` : ""}`;
}
