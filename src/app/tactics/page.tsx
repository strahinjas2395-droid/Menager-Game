"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Save } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import { useGameStore } from "@/store/gameStore";
import { selectBestXI } from "@/engine/matchSimulator";
import { FORMATION_NAMES } from "@/engine/formations";
import {
  DefensiveLine, MentalityLevel, PlayStyle, PressingIntensity, TempoSetting,
  TimeWasting, WidthSetting, type Player, type TacticalSetup,
} from "@/types";

const PLAY_STYLES = Object.values(PlayStyle);

const SLIDERS: {
  key: keyof TacticalSetup;
  label: string;
  min: number;
  max: number;
  ends: [string, string];
}[] = [
  { key: "tempo", label: "Tempo", min: 0, max: 4, ends: ["Very Slow", "Very Fast"] },
  { key: "passingLength", label: "Passing", min: 0, max: 4, ends: ["Very Short", "Very Direct"] },
  { key: "defensiveLine", label: "Defensive Line", min: 0, max: 4, ends: ["Very Deep", "Very High"] },
  { key: "pressing", label: "Pressing", min: 0, max: 4, ends: ["None", "Extreme"] },
  { key: "width", label: "Width", min: 0, max: 4, ends: ["Very Narrow", "Very Wide"] },
  { key: "mentality", label: "Mentality", min: 0, max: 6, ends: ["Ultra Defensive", "Ultra Attacking"] },
];

export default function TacticsPage() {
  const save = useGameStore((s) => s.save);
  const updateTactics = useGameStore((s) => s.updateTactics);
  const [draft, setDraft] = useState<TacticalSetup | null>(null);
  const [saved, setSaved] = useState(false);
  const pitchRef = useRef<HTMLDivElement>(null);
  const dragIdx = useRef<number | null>(null);

  useEffect(() => {
    if (save && !draft) setDraft({ ...save.tacticalSetup, setPieces: { ...save.tacticalSetup.setPieces }, positionOverrides: { ...save.tacticalSetup.positionOverrides } });
  }, [save, draft]);

  const squad = useMemo<Player[]>(() => {
    if (!save) return [];
    const club = save.world.clubs[save.userClubId];
    if (!club) return [];
    return club.playerIds.map((id) => save.world.players[id]).filter((p): p is Player => !!p);
  }, [save]);

  const xi = useMemo(
    () => (draft && squad.length ? selectBestXI(squad, draft.formation) : null),
    [draft, squad],
  );

  if (!save || !draft || !xi) {
    return (
      <main className="flex h-full items-center justify-center bg-navy text-white/60">
        Loading career…
      </main>
    );
  }

  const set = <K extends keyof TacticalSetup>(key: K, value: TacticalSetup[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const dotPos = (i: number) => {
    const p = xi.starters[i];
    const base = xi.basePositions[i];
    if (p && draft.positionOverrides[p.id]) return draft.positionOverrides[p.id];
    return base;
  };

  const toPitchCoords = (clientX: number, clientY: number) => {
    const rect = pitchRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((clientX - rect.left) / rect.width) * 1000;
    const y = ((clientY - rect.top) / rect.height) * 650;
    if (x < 10 || x > 990 || y < 10 || y > 640) return null;
    return { x: Math.round(x), y: Math.round(y) };
  };

  const onPointerDown = (i: number) => (e: React.PointerEvent) => {
    dragIdx.current = i;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragIdx.current === null) return;
    const c = toPitchCoords(e.clientX, e.clientY);
    if (!c) return;
    const player = xi.starters[dragIdx.current];
    if (!player) return;
    setDraft((d) =>
      d ? { ...d, positionOverrides: { ...d.positionOverrides, [player.id]: c } } : d,
    );
  };
  const onPointerUp = () => {
    dragIdx.current = null;
  };

  const saveTactics = async () => {
    await updateTactics(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const formationName = draft.formation;

  return (
    <main className="flex h-full flex-col bg-navy">
      <TopBar budget={false} />
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-24">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">Tactics</h1>
          <select
            value={formationName}
            onChange={(e) => {
              set("formation", e.target.value);
              setDraft((d) => (d ? { ...d, positionOverrides: {} } : d));
            }}
            className="rounded-lg border border-white/15 bg-card px-3 py-1.5 text-sm font-semibold outline-none focus:border-gold"
          >
            {FORMATION_NAMES.map((n) => (
              <option key={n} value={n} className="bg-card">{n}</option>
            ))}
          </select>
        </div>

        {/* Pitch */}
        <div
          ref={pitchRef}
          className="relative aspect-[1000/650] w-full touch-none overflow-hidden rounded-xl border border-white/15"
          style={{
            background:
              "repeating-linear-gradient(90deg, #2E7D32 0%, #2E7D32 10%, #358838 10%, #358838 20%)",
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {/* pitch markings */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/50" />
            <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />
            <div className="absolute inset-y-[19%] left-0 w-[16.5%] border border-white/50" />
            <div className="absolute inset-y-[19%] right-0 w-[16.5%] border border-white/50" />
            <div className="absolute inset-y-[31%] left-0 w-[5.5%] border border-white/50" />
            <div className="absolute inset-y-[31%] right-0 w-[5.5%] border border-white/50" />
          </div>

          {xi.starters.map((p, i) => {
            const pos = dotPos(i);
            const dragPos = p && draft.positionOverrides[p.id] ? draft.positionOverrides[p.id] : null;
            return (
              <div
                key={p.id}
                onPointerDown={onPointerDown(i)}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab select-none active:cursor-grabbing"
                style={{
                  left: `${(pos.x / 1000) * 100}%`,
                  top: `${(pos.y / 650) * 100}%`,
                }}
                title={`${p.firstName} ${p.lastName} — drag to reposition`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-black shadow-lg ${
                    dragPos ? "border-gold bg-navy text-gold" : "border-white/80 bg-card text-white"
                  }`}
                >
                  {p.shirtNumber}
                </span>
                <span className="mt-0.5 block max-w-16 truncate text-center text-[8px] font-semibold text-white/90 drop-shadow">
                  {p.lastName}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-white/40">
          Drag dots to fine-tune positions ({formationName})
        </p>

        {/* Play style */}
        <section className="card-panel mt-4">
          <span className="stat-label">Play Style</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLAY_STYLES.map((s) => (
              <button
                key={s}
                onClick={() => set("playStyle", s)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  draft.playStyle === s
                    ? "bg-gold text-navy"
                    : "border border-white/10 bg-navy text-white/60"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {/* Team instructions */}
        <section className="card-panel mt-3">
          <span className="stat-label">Team Instructions</span>
          <div className="mt-3 space-y-4">
            {SLIDERS.map((sl) => (
              <div key={sl.key as string}>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="font-semibold text-white/80">{sl.label}</span>
                  <span className="text-gold">{labelForValue(sl, Number(draft[sl.key] ?? 0))}</span>
                </div>
                <input
                  type="range"
                  min={sl.min}
                  max={sl.max}
                  step={1}
                  value={Number(draft[sl.key] ?? 0)}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, [sl.key]: Number(e.target.value) as never } : d))
                  }
                />
                <div className="flex justify-between text-[9px] text-white/35">
                  <span>{sl.ends[0]}</span>
                  <span>{sl.ends[1]}</span>
                </div>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center justify-between rounded-lg bg-navy px-3 py-2 text-xs">
                <span>Offside trap</span>
                <Toggle on={draft.offsideTrap} onChange={(v) => set("offsideTrap", v)} />
              </label>
              <label className="flex items-center justify-between rounded-lg bg-navy px-3 py-2 text-xs">
                <span>Counter attack</span>
                <Toggle on={draft.counterAttack} onChange={(v) => set("counterAttack", v)} />
              </label>
            </div>

            <div>
              <span className="stat-label">Time wasting</span>
              <div className="mt-1.5 flex gap-2">
                {Object.values(TimeWasting).map((t) => (
                  <button
                    key={t}
                    onClick={() => set("timeWasting", t)}
                    className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold ${
                      draft.timeWasting === t ? "bg-gold text-navy" : "bg-navy text-white/60 border border-white/10"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Set pieces */}
        <section className="card-panel mt-3">
          <span className="stat-label">Set Pieces & Leadership</span>
          <div className="mt-2 space-y-2">
            <SelectRow label="Captain" value={draft.setPieces.captainId}
              options={squad} onChange={(v) => set("setPieces", { ...draft.setPieces, captainId: v })} />
            <SelectRow label="Penalty taker" value={draft.setPieces.penaltyId}
              options={squad} onChange={(v) => set("setPieces", { ...draft.setPieces, penaltyId: v })} />
            <SelectRow label="Free kick taker" value={draft.setPieces.freeKickId}
              options={squad} onChange={(v) => set("setPieces", { ...draft.setPieces, freeKickId: v })} />
            <SelectRow label="Corner (left)" value={draft.setPieces.cornerLeftId}
              options={squad} onChange={(v) => set("setPieces", { ...draft.setPieces, cornerLeftId: v })} />
            <SelectRow label="Corner (right)" value={draft.setPieces.cornerRightId}
              options={squad} onChange={(v) => set("setPieces", { ...draft.setPieces, cornerRightId: v })} />
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-14 z-30 mx-auto max-w-lg px-4 pb-2">
        <button onClick={() => void saveTactics()} className="btn-gold flex w-full items-center justify-center gap-2">
          {saved ? "Saved ✓" : (<><Save size={16} /> Save Tactics</>)}
        </button>
      </div>

      <BottomNav />
    </main>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`h-5 w-9 rounded-full p-0.5 transition ${on ? "bg-gold" : "bg-white/20"}`}
      aria-pressed={on}
    >
      <span className={`block h-4 w-4 rounded-full bg-white transition ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}

function SelectRow({
  label, value, options, onChange,
}: {
  label: string;
  value: string | null;
  options: Player[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span className="text-white/60">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="max-w-[60%] rounded-lg border border-white/10 bg-navy px-2 py-1.5 text-xs outline-none focus:border-gold"
      >
        <option value="">— Auto —</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            #{p.shirtNumber} {p.firstName} {p.lastName}
          </option>
        ))}
      </select>
    </label>
  );
}

function labelForValue(sl: { ends: [string, string]; max: number }, v: number): string {
  if (sl.max === 4) {
    const names: Record<string, string[]> = {
      "Very Slow,Very Fast": ["Very Slow", "Slow", "Normal", "Fast", "Very Fast"],
      "Very Short,Very Direct": ["Very Short", "Short", "Normal", "Direct", "Very Direct"],
      "Very Deep,Very High": ["Very Deep", "Deep", "Normal", "High", "Very High"],
      "None,Extreme": ["None", "Low", "Standard", "High", "Extreme"],
      "Very Narrow,Very Wide": ["Very Narrow", "Narrow", "Normal", "Wide", "Very Wide"],
    };
    const key = `${sl.ends[0]},${sl.ends[1]}`;
    return names[key]?.[v] ?? String(v);
  }
  const ment = [
    "Ultra Defensive", "Defensive", "Cautious", "Balanced", "Positive", "Attacking", "Ultra Attacking",
  ];
  return ment[v] ?? String(v);
}
