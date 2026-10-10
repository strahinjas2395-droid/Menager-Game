"use client";

import { useMemo, useState } from "react";
import { X, ArrowUpDown, Activity, Dumbbell, HeartPulse } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import { useGameStore } from "@/store/gameStore";
import { NATIONALITY_FLAGS } from "@/database/nameGenerator";
import {
  DEFENSIVE_ATTRS, GK_ATTRS, MENTAL_ATTRS, PHYSICAL_ATTRS, TECHNICAL_ATTRS,
} from "@/database/playerGenerator";
import {
  PrimaryPosition,
  type Player,
  type TeamTrainingFocus,
  type TrainingDevelopmentFocus,
  type TrainingIntensity,
} from "@/types";
import { isPlayerAvailable, playerCondition, playerSharpness } from "@/engine/fitness";

type Filter = "ALL" | "GK" | "DEF" | "MID" | "FWD";
type SortKey = "number" | "position" | "age" | "name" | "condition";

const TRAINING_FOCUSES: TeamTrainingFocus[] = [
  "Balanced", "Recovery", "Attacking", "Defending", "Possession", "Physical", "SetPieces",
];
const INDIVIDUAL_FOCUSES: TrainingDevelopmentFocus[] = [
  "Attacking", "Defending", "Possession", "Physical", "SetPieces",
];

const POS_GROUP: Record<PrimaryPosition, Filter> = {
  [PrimaryPosition.GK]: "GK",
  [PrimaryPosition.RB]: "DEF",
  [PrimaryPosition.CB]: "DEF",
  [PrimaryPosition.LB]: "DEF",
  [PrimaryPosition.CDM]: "MID",
  [PrimaryPosition.CM]: "MID",
  [PrimaryPosition.CAM]: "MID",
  [PrimaryPosition.RW]: "FWD",
  [PrimaryPosition.LW]: "FWD",
  [PrimaryPosition.ST]: "FWD",
};

const BADGE: Record<Filter, string> = {
  GK: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  DEF: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  MID: "bg-green-500/20 text-green-300 border-green-500/40",
  FWD: "bg-red-500/20 text-red-300 border-red-500/40",
  ALL: "bg-white/10 text-white",
};

function valueClass(n: number): string {
  if (n <= 5) return "text-red-400";
  if (n <= 9) return "text-orange-400";
  if (n <= 13) return "text-yellow-300";
  if (n <= 16) return "text-lime-300";
  if (n <= 18) return "text-green-400";
  return "text-gold font-bold";
}

const POS_ORDER: Record<string, number> = {
  GK: 0, RB: 1, CB: 2, LB: 3, CDM: 4, CM: 5, CAM: 6, RW: 7, LW: 8, ST: 9,
};

export default function SquadPage() {
  const save = useGameStore((s) => s.save);
  const replaceSave = useGameStore((s) => s.replaceSave);
  const updateTrainingPlan = useGameStore((s) => s.updateTrainingPlan);
  const togglePlayerRest = useGameStore((s) => s.togglePlayerRest);
  const setIndividualTraining = useGameStore((s) => s.setIndividualTraining);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState<SortKey>("position");
  const [selected, setSelected] = useState<Player | null>(null);
  const [editingNumber, setEditingNumber] = useState<Player | null>(null);
  const [tmpNumber, setTmpNumber] = useState(1);

  const players = useMemo(() => {
    if (!save) return [];
    const club = save.world.clubs[save.userClubId];
    if (!club) return [];
    const list = club.playerIds
      .map((id) => save.world.players[id])
      .filter((p): p is Player => !!p);
    return list;
  }, [save]);

  const filtered = useMemo(() => {
    let list = players;
    if (filter !== "ALL") list = list.filter((p) => POS_GROUP[p.primaryPosition] === filter);
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "number": return a.shirtNumber - b.shirtNumber;
        case "age": return a.age - b.age;
        case "name": return a.lastName.localeCompare(b.lastName);
        case "condition": return playerCondition(a) - playerCondition(b);
        default:
          return (
            (POS_ORDER[a.primaryPosition] ?? 9) - (POS_ORDER[b.primaryPosition] ?? 9) ||
            b.reputation - a.reputation
          );
      }
    });
    return sorted;
  }, [players, filter, sort]);

  if (!save) {
    return (
      <main className="flex h-full items-center justify-center bg-navy text-white/60">
        No career loaded.
      </main>
    );
  }

  const club = save.world.clubs[save.userClubId]!;
  const wageBill = players.reduce((s, p) => s + p.contract.weeklyWage, 0);
  const takenNumbers = new Set(players.map((p) => p.shirtNumber));
  const trainingPlan = save.trainingPlan ?? {
    intensity: "Normal" as TrainingIntensity,
    teamFocus: "Balanced" as TeamTrainingFocus,
    restPlayerIds: [],
    individualFocus: {},
  };
  const resting = new Set(trainingPlan.restPlayerIds);
  const injuredPlayers = players.filter((player) => !isPlayerAvailable(player));
  const averageCondition = players.length
    ? Math.round(players.reduce((sum, player) => sum + playerCondition(player), 0) / players.length)
    : 0;
  const latestTraining = save.trainingHistory?.at(-1);

  const confirmNumber = async (p: Player, n: number) => {
    const target = save.world.players[p.id];
    if (target) target.shirtNumber = n;
    setSelected((s) => (s && s.id === p.id ? { ...s, shirtNumber: n } : s));
    setEditingNumber(null);
    await replaceSave(save);
  };

  return (
    <main className="flex h-full flex-col bg-navy">
      <TopBar />
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-20">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Squad</h1>
            <p className="text-[11px] text-white/50">
              {players.length} players · Wage bill €{(wageBill / 1000).toFixed(0)}k/wk
            </p>
          </div>
          <label className="flex items-center gap-1 rounded-lg border border-white/10 bg-card px-2 py-1.5 text-xs text-white/70">
            <ArrowUpDown size={12} />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-transparent outline-none"
            >
              <option value="position" className="bg-card">Position</option>
              <option value="number" className="bg-card">Number</option>
              <option value="age" className="bg-card">Age</option>
              <option value="name" className="bg-card">Name</option>
              <option value="condition" className="bg-card">Lowest condition</option>
            </select>
          </label>
        </div>

        <section className="mb-3 rounded-xl border border-gold/20 bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Dumbbell size={16} className="text-gold" />
              <div>
                <h2 className="text-xs font-black">Weekly Training & Recovery</h2>
                <p className="text-[9px] text-white/40">Facilities {club.facilities.training}/10 · changes apply when the week advances</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-black text-green-300">{averageCondition}%</div>
              <div className="text-[8px] uppercase text-white/35">avg condition</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="rounded-lg bg-navy/60 p-2 text-[9px] font-bold uppercase tracking-wide text-white/40">
              Team focus
              <select
                value={trainingPlan.teamFocus}
                onChange={(event) => void updateTrainingPlan({ teamFocus: event.target.value as TeamTrainingFocus })}
                className="mt-1 w-full bg-transparent text-xs font-bold normal-case text-white outline-none"
              >
                {TRAINING_FOCUSES.map((focus) => <option key={focus} value={focus} className="bg-card">{focus}</option>)}
              </select>
            </label>
            <label className="rounded-lg bg-navy/60 p-2 text-[9px] font-bold uppercase tracking-wide text-white/40">
              Intensity
              <select
                value={trainingPlan.intensity}
                onChange={(event) => void updateTrainingPlan({ intensity: event.target.value as TrainingIntensity })}
                className="mt-1 w-full bg-transparent text-xs font-bold normal-case text-white outline-none"
              >
                {(["Low", "Normal", "High"] as TrainingIntensity[]).map((intensity) => (
                  <option key={intensity} value={intensity} className="bg-card">{intensity}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2 flex items-center justify-between text-[9px] text-white/45">
            <span><HeartPulse size={11} className="mr-1 inline text-orange-300" />{injuredPlayers.length} unavailable</span>
            <span>{resting.size} resting · high intensity improves faster but raises injury risk</span>
          </div>
          {latestTraining && (
            <div className="mt-2 rounded-md bg-navy/50 px-2 py-1.5 text-[9px] text-white/40">
              Week {latestTraining.week}: {latestTraining.developed.length} attribute gain{latestTraining.developed.length === 1 ? "" : "s"} · {latestTraining.returned.length} returned · {latestTraining.injuries.length} training injur{latestTraining.injuries.length === 1 ? "y" : "ies"}
            </div>
          )}
        </section>

        <div className="mb-3 flex gap-2">
          {(["ALL", "GK", "DEF", "MID", "FWD"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                filter === f ? "bg-gold text-navy" : "bg-card text-white/60 border border-white/10"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          {filtered.map((p) => {
            const group = POS_GROUP[p.primaryPosition];
            const condition = playerCondition(p);
            const rested = resting.has(p.id);
            return (
              <div
                key={p.id}
                className={`flex w-full items-stretch overflow-hidden rounded-xl border bg-card transition ${
                  p.injury ? "border-red-400/35" : rested ? "border-sky-400/30" : "border-white/10"
                }`}
              >
                <button
                  onClick={() => setSelected(p)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.02]"
                >
                  <span className="w-7 shrink-0 text-center text-sm font-black text-gold">{p.shirtNumber}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                      <span className="truncate">{p.firstName} {p.lastName}</span>
                      {p.injury && <span className="shrink-0 rounded bg-red-400/15 px-1 text-[8px] text-red-300">OUT {p.injury.weeksRemaining}W</span>}
                    </span>
                    <span className="block text-[10px] text-white/40">
                      {NATIONALITY_FLAGS[p.nationality] ?? ""} {p.age} yrs · sharp {Math.round(playerSharpness(p))}%
                    </span>
                  </span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${BADGE[group]}`}>{p.primaryPosition}</span>
                  <span className="w-10 shrink-0 text-right">
                    <span className={`block text-xs font-black ${condition >= 85 ? "text-green-300" : condition >= 70 ? "text-yellow-300" : "text-red-300"}`}>{Math.round(condition)}%</span>
                    <span className="block text-[7px] uppercase text-white/30">condition</span>
                  </span>
                </button>
                <button
                  onClick={() => void togglePlayerRest(p.id)}
                  disabled={!!p.injury}
                  title={rested ? "Return to training" : "Rest this player for the next training week"}
                  className={`w-12 shrink-0 border-l text-[8px] font-black uppercase transition disabled:opacity-25 ${
                    rested ? "border-sky-300/30 bg-sky-400/15 text-sky-200" : "border-white/10 text-white/35 hover:bg-white/5"
                  }`}
                >
                  {rested ? "Resting" : "Rest"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Player detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
             onClick={() => setSelected(null)}>
          <div
            className="max-h-[92%] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/15 bg-navy p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gold px-1.5 py-0.5 text-xs font-black text-navy">
                    #{selected.shirtNumber}
                  </span>
                  <h2 className="text-lg font-bold">
                    {selected.firstName} {selected.lastName}
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-white/55">
                  {NATIONALITY_FLAGS[selected.nationality] ?? ""} {selected.nationality} ·{" "}
                  {selected.age} yrs · {selected.height}cm / {selected.weight}kg · {selected.preferredFoot} foot
                </p>
                <p className="mt-0.5 text-xs text-white/55">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${BADGE[POS_GROUP[selected.primaryPosition]]}`}>
                    {selected.primaryPosition}
                  </span>
                  {selected.secondaryPositions.length > 0 && (
                    <span className="ml-1.5 text-white/40">
                      also {selected.secondaryPositions.join(", ")}
                    </span>
                  )}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-1 text-white/50 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>

            {/* contract */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Box label="Value" value={`€${(selected.contract.transferValue / 1_000_000).toFixed(1)}M`} />
              <Box label="Wage" value={`€${(selected.contract.weeklyWage / 1000).toFixed(1)}k/w`} />
              <Box label="Contract" value={`${selected.contract.contractYearsRemaining}y`} />
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-card p-3">
              <div className="flex items-center gap-2"><Activity size={14} className="text-green-300" /><span className="stat-label">Readiness & availability</span></div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <ReadinessBar label="Condition" value={playerCondition(selected)} />
                <ReadinessBar label="Sharpness" value={playerSharpness(selected)} />
              </div>
              {selected.injury ? (
                <div className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 p-2.5">
                  <div className="text-xs font-black text-red-200">{selected.injury.name}</div>
                  <div className="mt-1 text-[10px] text-red-100/60">
                    {selected.injury.severity} · {selected.injury.source} · {selected.injury.weeksRemaining} week{selected.injury.weeksRemaining === 1 ? "" : "s"} remaining
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/20">
                    <div className="h-full bg-red-300" style={{ width: `${selected.injury.rehabProgress * 100}%` }} />
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <label className="rounded-lg bg-navy/50 px-2 py-1.5 text-[9px] uppercase text-white/35">
                    Individual focus
                    <select
                      value={trainingPlan.individualFocus[selected.id] ?? ""}
                      onChange={(event) => void setIndividualTraining(
                        selected.id,
                        (event.target.value || undefined) as TrainingDevelopmentFocus | undefined,
                      )}
                      className="mt-0.5 block w-full bg-transparent text-[11px] font-bold normal-case text-white outline-none"
                    >
                      <option value="" className="bg-card">Follow team</option>
                      {INDIVIDUAL_FOCUSES.map((focus) => <option key={focus} value={focus} className="bg-card">{focus}</option>)}
                    </select>
                  </label>
                  <button
                    onClick={() => void togglePlayerRest(selected.id)}
                    className={`rounded-lg px-3 text-[10px] font-bold ${resting.has(selected.id) ? "bg-sky-400 text-navy" : "bg-white/10 text-white/60"}`}
                  >
                    {resting.has(selected.id) ? "Resting" : "Rest week"}
                  </button>
                </div>
              )}
            </div>

            {/* stats */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <StatGroup title="Technical" attrs={TECHNICAL_ATTRS} player={selected} />
              <StatGroup title="Physical" attrs={PHYSICAL_ATTRS} player={selected} />
              <StatGroup title="Mental" attrs={MENTAL_ATTRS} player={selected} />
              <div>
                <StatGroup title="Defensive" attrs={DEFENSIVE_ATTRS} player={selected} />
                {selected.primaryPosition === PrimaryPosition.GK && (
                  <div className="mt-2">
                    <StatGroup title="Goalkeeping" attrs={GK_ATTRS} player={selected} />
                  </div>
                )}
              </div>
            </div>

            {/* playstyles */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {selected.playstyles.map((t) => (
                <span key={t} className="rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
                  {t}
                </span>
              ))}
            </div>

            {/* personality & morale */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-card p-3">
                <span className="stat-label">Personality</span>
                <p className="text-sm font-semibold">{selected.personality}</p>
              </div>
              <div className="rounded-xl bg-card p-3">
                <span className="stat-label">Morale</span>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${selected.morale >= 70 ? "bg-green-400" : selected.morale >= 45 ? "bg-yellow-400" : "bg-red-400"}`}
                    style={{ width: `${selected.morale}%` }}
                  />
                </div>
              </div>
            </div>

            {/* season stats */}
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              <Box label="Apps" value={String(selected.seasonStats.appearances)} />
              <Box label="Goals" value={String(selected.seasonStats.goals)} />
              <Box label="Rating" value={selected.seasonStats.lastRating ? selected.seasonStats.lastRating.toFixed(1) : "-"} />
              <Box label="Cards" value={`${selected.seasonStats.yellowCards}/${selected.seasonStats.redCards}`} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className="btn-dark text-xs"
                onClick={() => {
                  setTmpNumber(selected.shirtNumber);
                  setEditingNumber(selected);
                }}
              >
                Edit Number
              </button>
              <button className="btn-dark text-xs" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Number edit modal */}
      {editingNumber && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-6"
             onClick={() => setEditingNumber(null)}>
          <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-navy p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-bold">Shirt number</h3>
            <p className="mb-3 text-[11px] text-white/50">
              {editingNumber.firstName} {editingNumber.lastName}
            </p>
            <div className="max-h-64 overflow-y-auto rounded-xl bg-card p-2">
              <div className="grid grid-cols-5 gap-1.5">
                {Array.from({ length: 99 }, (_, i) => i + 1).map((n) => {
                  const taken = takenNumbers.has(n) && n !== editingNumber.shirtNumber;
                  return (
                    <button
                      key={n}
                      onClick={() => setTmpNumber(n)}
                      className={`rounded-lg py-1.5 text-xs font-bold transition ${
                        tmpNumber === n
                          ? "bg-gold text-navy"
                          : taken
                            ? "bg-white/5 text-red-400/70"
                            : "bg-white/10 text-white/80"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
            {takenNumbers.has(tmpNumber) && tmpNumber !== editingNumber.shirtNumber && (
              <p className="mt-2 text-[11px] text-red-400">⚠ Number {tmpNumber} is already taken.</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-dark py-2 text-xs" onClick={() => setEditingNumber(null)}>Cancel</button>
              <button
                className="btn-gold py-2 text-xs"
                disabled={takenNumbers.has(tmpNumber) && tmpNumber !== editingNumber.shirtNumber}
                onClick={() => void confirmNumber(editingNumber, tmpNumber)}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}

function ReadinessBar({ label, value }: { label: string; value: number }) {
  const color = value >= 85 ? "bg-green-400" : value >= 70 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div>
      <div className="flex justify-between text-[9px] font-bold text-white/45"><span>{label}</span><span>{Math.round(value)}%</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card px-2 py-2.5">
      <div className="stat-label">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

function StatGroup({
  title, attrs, player,
}: {
  title: string;
  attrs: readonly string[];
  player: Player;
}) {
  return (
    <div className="rounded-xl bg-card p-3">
      <div className="stat-label mb-1.5">{title}</div>
      <div className="space-y-1">
        {attrs.map((a) => {
          const v = (player as unknown as Record<string, number>)[a] ?? 0;
          return (
            <div key={a} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-white/60">{labelFor(a)}</span>
              <span className={`w-5 text-right font-bold ${valueClass(v)}`}>{Math.round(v)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function labelFor(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace("GK", "")
    .trim();
}
