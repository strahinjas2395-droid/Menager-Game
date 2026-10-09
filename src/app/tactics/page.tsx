"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Save, Sparkles } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import StepDots from "@/components/StepDots";
import { useGameStore } from "@/store/gameStore";
import { selectBestXI } from "@/engine/matchSimulator";
import { FORMATION_NAMES } from "@/engine/formations";
import { parseInstructions, summarizeDirectives } from "@/engine/directives";
import {
  DefensiveLine, MentalityLevel, PlayStyle, PressingIntensity, TempoSetting,
  TimeWasting, WidthSetting, type Player, type TacticalSetup,
} from "@/types";

const PLAY_STYLES = Object.values(PlayStyle);

const STYLE_HELP: Record<PlayStyle, string> = {
  [PlayStyle.PossessionBased]: "Patient build-up, safe support angles, circulation and rest defence.",
  [PlayStyle.TikiTaka]: "Compact triangles, short combinations, third-man runs and aggressive recycling.",
  [PlayStyle.DirectCounterAttack]: "Defend compactly, then attack space vertically as soon as possession turns.",
  [PlayStyle.GegenpressingStyle]: "High line, intense counter-press and fast combinations after regains.",
  [PlayStyle.LongBallDirect]: "Bypass midfield, find strong forwards and attack aerial second balls.",
  [PlayStyle.WingPlay]: "Stretch both flanks, overlap and deliver crosses or byline cutbacks.",
  [PlayStyle.ParkTheBus]: "Deep narrow block, conserve shape and release selective counterattacks.",
  [PlayStyle.TotalFootball]: "Fluid rotations, roaming midfielders and position interchanges.",
  [PlayStyle.RouteOne]: "Early vertical service toward a target forward with runners collecting knockdowns.",
  [PlayStyle.Balanced]: "A mixed approach that adapts risk, width and progression to the situation.",
};

const INSTRUCTION_EXAMPLES = [
  "Hold your position and keep passes short",
  "Make runs in behind and shoot from distance",
  "Stay wide, take on defenders and whip early crosses",
  "Cut inside, roam freely and play through balls",
  "Act as a target man, hold up the ball and lay it off",
  "Press aggressively and mark tightly",
];

type NumKey =
  | "tempo" | "passingLength" | "defensiveLine" | "pressing" | "width" | "mentality";

const SLIDERS: {
  key: NumKey;
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

const PRESS_REACH = [0, 45, 95, 160, 235]; // visual press-zone depth per level

export default function TacticsPage() {
  const save = useGameStore((s) => s.save);
  const updateTactics = useGameStore((s) => s.updateTactics);
  const updatePlayerInstructions = useGameStore((s) => s.updatePlayerInstructions);
  const [draft, setDraft] = useState<TacticalSetup | null>(null);
  const [instructionDraft, setInstructionDraft] = useState<Record<string, string>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const instructionsLoaded = useRef(false);
  const [saved, setSaved] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const dragIdx = useRef<number | null>(null);
  const [pitchW, setPitchW] = useState(0);

  useEffect(() => {
    if (save && !draft) setDraft({ ...save.tacticalSetup, setPieces: { ...save.tacticalSetup.setPieces }, positionOverrides: { ...save.tacticalSetup.positionOverrides } });
  }, [save, draft]);

  // Keep the pitch fully inside its column (never taller than the viewport)
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setPitchW(Math.max(220, Math.floor(Math.min(w, h * (1000 / 650)))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const squad = useMemo<Player[]>(() => {
    if (!save) return [];
    const club = save.world.clubs[save.userClubId];
    if (!club) return [];
    return club.playerIds.map((id) => save.world.players[id]).filter((p): p is Player => !!p);
  }, [save]);

  useEffect(() => {
    if (!squad.length || instructionsLoaded.current) return;
    setInstructionDraft(Object.fromEntries(squad.map((p) => [p.id, p.individualInstructions ?? ""])));
    setSelectedPlayerId(squad.find((p) => p.primaryPosition !== "GK")?.id ?? squad[0]?.id ?? null);
    instructionsLoaded.current = true;
  }, [squad]);

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
  const setNum = (key: NumKey, value: number) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  // Live preview: same shaping math the match engine uses (static, in-possession)
  const widthF = 0.78 + Number(draft.width) * 0.11;
  const lineShift = (Number(draft.defensiveLine) - 2) * 26;
  const mentShift = (Number(draft.mentality) - 3) * 16;

  const displayPos = (i: number) => {
    const p = xi.starters[i];
    const base = xi.basePositions[i];
    if (p && draft.positionOverrides[p.id]) return draft.positionOverrides[p.id];
    if (p?.primaryPosition === "GK") return { x: Math.max(30, base.x), y: base.y };
    const tx = base.x + lineShift + mentShift * 0.6;
    const ty = 325 + (base.y - 325) * widthF;
    return {
      x: Math.round(Math.min(975, Math.max(25, tx))),
      y: Math.round(Math.min(635, Math.max(15, ty))),
    };
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
    setSelectedPlayerId(xi.starters[i]?.id ?? null);
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
    await updatePlayerInstructions(instructionDraft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const pressFrom = 240 + lineShift;
  const pressTo = pressFrom + PRESS_REACH[Number(draft.pressing)];
  const selectedPlayer = squad.find((p) => p.id === selectedPlayerId) ?? squad[0];
  const selectedText = selectedPlayer ? instructionDraft[selectedPlayer.id] ?? "" : "";
  const understood = summarizeDirectives(parseInstructions(selectedText));

  return (
    <main className="flex h-full flex-col bg-navy">
      <TopBar budget={false} />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ---------- PITCH (always visible) ---------- */}
        <div className="flex h-[34vh] shrink-0 flex-col border-b border-white/10 lg:h-auto lg:w-[46%] lg:max-w-[600px] lg:border-b-0 lg:border-r">
          <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center p-3">
            <div
              ref={pitchRef}
              className="relative touch-none overflow-hidden rounded-xl border border-white/15 shadow-lg"
              style={{
                width: pitchW || "100%",
                aspectRatio: "1000 / 650",
                background:
                  "repeating-linear-gradient(90deg, #2E7D32 0%, #2E7D32 10%, #317F35 10%, #317F35 20%)",
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {/* press zone */}
              {Number(draft.pressing) > 0 && (
                <div
                  className="pointer-events-none absolute inset-y-0 bg-gold/10"
                  style={{ left: `${pressFrom / 10}%`, width: `${(pressTo - pressFrom) / 10}%` }}
                >
                  <div className="absolute inset-y-0 right-0 w-px border-r border-dashed border-gold/60" />
                </div>
              )}

              {/* pitch markings */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-1/2 w-px bg-white/50" />
                <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />
                <div className="absolute inset-y-[19%] left-0 w-[16.5%] border border-white/50" />
                <div className="absolute inset-y-[19%] right-0 w-[16.5%] border border-white/50" />
                <div className="absolute inset-y-[31%] left-0 w-[5.5%] border border-white/50" />
                <div className="absolute inset-y-[31%] right-0 w-[5.5%] border border-white/50" />
                {/* offside trap line */}
                {draft.offsideTrap && (
                  <div
                    className="absolute inset-y-0 border-l-2 border-dashed border-amber-300/80"
                    style={{ left: `${(300 + lineShift) / 10}%` }}
                  />
                )}
              </div>

              {/* formation dots */}
              {xi.starters.map((p, i) => {
                const pos = displayPos(i);
                const dragPos = draft.positionOverrides[p.id];
                const isGK = p.primaryPosition === "GK";
                return (
                  <div
                    key={p.id}
                    onPointerDown={onPointerDown(i)}
                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab select-none rounded-full active:cursor-grabbing ${selectedPlayerId === p.id ? "ring-2 ring-gold/80 ring-offset-2 ring-offset-transparent" : ""}`}
                    style={{ left: `${pos.x / 10}%`, top: `${(pos.y / 650) * 100}%` }}
                    title={`${p.firstName} ${p.lastName} — drag to fix position`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[9px] font-black shadow-md ${
                        isGK
                          ? "border-yellow-300 bg-navy text-yellow-300"
                          : dragPos
                            ? "border-gold bg-navy text-gold"
                            : "border-white/85 bg-card text-white"
                      }`}
                    >
                      {p.shirtNumber}
                    </span>
                    <span className="mt-0.5 block max-w-14 truncate text-center text-[8px] font-semibold text-white/90 drop-shadow">
                      {p.lastName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="px-3 pb-2 text-center text-[9px] text-white/40">
            {draft.formation} · drag dots to fix a position · gold zone = press
            {draft.offsideTrap ? " · dashed = offside line" : ""}
          </p>
        </div>

        {/* ---------- SETTINGS (side panel, own scroll) ---------- */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-28">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-bold">Tactics</h1>
            <select
              value={draft.formation}
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

          {/* Play style */}
          <section className="card-panel">
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
                  {prettyStyle(s)}
                </button>
              ))}
            </div>
            <p className="mt-2 rounded-lg bg-navy/70 px-3 py-2 text-[11px] leading-relaxed text-white/55">
              {STYLE_HELP[draft.playStyle]}
            </p>
          </section>

          {/* Team instructions — dot sliders */}
          <section className="card-panel mt-3">
            <span className="stat-label">Team Instructions</span>
            <div className="mt-3 space-y-4">
              {SLIDERS.map((sl) => (
                <div key={sl.key}>
                  <div className="mb-0.5 flex justify-between text-[11px]">
                    <span className="font-semibold text-white/80">{sl.label}</span>
                    <span className="font-bold text-gold">
                      {labelForValue(sl, Number(draft[sl.key] ?? 0))}
                    </span>
                  </div>
                  <StepDots
                    value={Number(draft[sl.key] ?? 0)}
                    min={sl.min}
                    max={sl.max}
                    onChange={(v) => setNum(sl.key, v)}
                    startLabel={sl.ends[0]}
                    endLabel={sl.ends[1]}
                    ariaLabel={sl.label}
                  />
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

          {/* Individual instructions */}
          <section className="card-panel mt-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="stat-label">Individual Instructions</span>
                <p className="mt-1 text-[10px] leading-relaxed text-white/40">
                  Write naturally. The tactical interpreter converts your note into decisions, movement and defensive behaviour.
                </p>
              </div>
              <Sparkles size={18} className="shrink-0 text-gold" />
            </div>

            <select
              value={selectedPlayer?.id ?? ""}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="mt-3 w-full rounded-lg border border-white/10 bg-navy px-3 py-2 text-xs font-semibold outline-none focus:border-gold"
            >
              {xi.starters.map((p, i) => (
                <option key={p.id} value={p.id}>XI · {xi.roles[i]} · #{p.shirtNumber} {p.firstName} {p.lastName}</option>
              ))}
              {xi.bench.map((p) => (
                <option key={p.id} value={p.id}>Bench · {p.primaryPosition} · #{p.shirtNumber} {p.firstName} {p.lastName}</option>
              ))}
              {squad.filter((p) => !xi.starters.includes(p) && !xi.bench.includes(p)).map((p) => (
                <option key={p.id} value={p.id}>Squad · {p.primaryPosition} · #{p.shirtNumber} {p.lastName}</option>
              ))}
            </select>

            <textarea
              value={selectedText}
              onChange={(e) => selectedPlayer && setInstructionDraft((d) => ({ ...d, [selectedPlayer.id]: e.target.value }))}
              placeholder="Example: Stay wide, take on defenders and whip early crosses. Press their full-back hard."
              rows={3}
              maxLength={300}
              className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-navy p-3 text-xs leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-gold"
            />
            <div className="mt-1 text-right text-[9px] text-white/30">{selectedText.length}/300</div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {understood.length ? understood.map((label) => (
                <span key={label} className="rounded-full border border-gold/30 bg-gold/10 px-2 py-1 text-[9px] font-semibold text-gold">
                  {label}
                </span>
              )) : (
                <span className="text-[10px] text-white/35">No instruction — follows the team system.</span>
              )}
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] font-semibold text-white/45">Example phrases</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {INSTRUCTION_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => selectedPlayer && setInstructionDraft((d) => ({ ...d, [selectedPlayer.id]: example }))}
                    className="rounded-lg border border-white/10 bg-navy px-2 py-1.5 text-left text-[9px] text-white/55 hover:border-gold/40 hover:text-white"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </details>
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

function prettyStyle(style: PlayStyle): string {
  return style.replace(/([a-z])([A-Z])/g, "$1 $2").replace("Style", "");
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
