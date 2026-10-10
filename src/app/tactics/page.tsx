"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Save, Sparkles, X } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import StepDots from "@/components/StepDots";
import InstructionInterpretationView from "@/components/InstructionInterpretationView";
import PlayerRoleEditor from "@/components/PlayerRoleEditor";
import { useGameStore } from "@/store/gameStore";
import { assignTacticalNumbers, selectBestXI } from "@/engine/matchSimulator";
import { pressingBehavior } from "@/engine/pressing";
import { FORMATION_NAMES } from "@/engine/formations";
import {
  playerRoleDefinition,
  resolvePlayerRoleAssignment,
  retainCompatiblePlayerRoleAssignments,
} from "@/engine/playerRoles";
import {
  buildInstructionRoster,
  instructionContextFingerprint,
  isInterpretationCurrent,
} from "@/engine/directives";
import { interpretTacticalInstructions, type TacticalInstructionRequest } from "@/services/tacticalInterpreter";
import {
  DefensiveLine, MentalityLevel, PlayStyle, PressingIntensity, TempoSetting,
  TimeWasting, WidthSetting, type Player, type PlayerRoleAssignment,
  type TacticalInstructionCache, type TacticalSetup,
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

const PRESS_REACH = [
  PressingIntensity.None,
  PressingIntensity.Low,
  PressingIntensity.Standard,
  PressingIntensity.High,
  PressingIntensity.Extreme,
].map((intensity) => pressingBehavior(intensity).visualReach);
const TACTICS_PITCH_H = 1000;
const TACTICS_GOAL_MARGIN = 30;
const TACTICS_GOAL_DEPTH = 24;
const TACTICS_VIEW_H = TACTICS_PITCH_H + TACTICS_GOAL_MARGIN * 2;
const tacticsPitchTop = (engineX: number) =>
  ((TACTICS_GOAL_MARGIN + TACTICS_PITCH_H - engineX) / TACTICS_VIEW_H) * 100;

export default function TacticsPage() {
  const save = useGameStore((s) => s.save);
  const updateTactics = useGameStore((s) => s.updateTactics);
  const updatePlayerInstructions = useGameStore((s) => s.updatePlayerInstructions);
  const [draft, setDraft] = useState<TacticalSetup | null>(null);
  const [instructionDraft, setInstructionDraft] = useState<Record<string, string>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const instructionsLoaded = useRef(false);
  const [saved, setSaved] = useState(false);
  const [interpreting, setInterpreting] = useState<string | null>(null);
  const [interpretWarning, setInterpretWarning] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const dragIdx = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragMoved = useRef(false);
  const [playerCardId, setPlayerCardId] = useState<string | null>(null);
  const [pitchW, setPitchW] = useState(0);

  useEffect(() => {
    if (save && !draft) {
      setDraft({
        ...save.tacticalSetup,
        teamInstructions: save.tacticalSetup.teamInstructions ?? "",
        instructionCache: {
          team: save.tacticalSetup.instructionCache?.team,
          players: { ...(save.tacticalSetup.instructionCache?.players ?? {}) },
        },
        playerRoles: { ...(save.tacticalSetup.playerRoles ?? {}) },
        setPieces: { ...save.tacticalSetup.setPieces },
        positionOverrides: { ...save.tacticalSetup.positionOverrides },
      });
    }
  }, [save, draft]);

  // Keep the pitch fully inside its column (never taller than the viewport)
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      // Vertical field plus exterior goal margins at both ends.
      if (w > 0 && h > 0) {
        setPitchW(Math.max(110, Math.floor(Math.min(w, h * (650 / TACTICS_VIEW_H)))));
      }
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
  const tacticalNumbers = useMemo(() => assignTacticalNumbers(xi?.roles ?? []), [xi]);
  const instructionRoster = useMemo(
    () => xi ? buildInstructionRoster(
      squad,
      xi.starters,
      xi.roles,
      tacticalNumbers,
      draft?.playerRoles,
      draft?.playStyle,
    ) : [],
    [squad, xi, tacticalNumbers, draft?.playerRoles, draft?.playStyle],
  );
  const instructionFingerprint = useMemo(
    () => instructionContextFingerprint(instructionRoster),
    [instructionRoster],
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
    // Display is rotated: width = engine Y. Vertically, remove the exterior
    // goal margin before converting top-to-bottom into 1000-X.
    const y = ((clientX - rect.left) / rect.width) * 650;
    const viewY = ((clientY - rect.top) / rect.height) * TACTICS_VIEW_H;
    const x = TACTICS_PITCH_H - (viewY - TACTICS_GOAL_MARGIN);
    if (x < 10 || x > 990 || y < 10 || y > 640) return null;
    return { x: Math.round(x), y: Math.round(y) };
  };

  const onPointerDown = (i: number) => (e: React.PointerEvent) => {
    dragIdx.current = i;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    dragMoved.current = false;
    setSelectedPlayerId(xi.starters[i]?.id ?? null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragIdx.current === null) return;
    const start = pointerStart.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) dragMoved.current = true;
    if (!dragMoved.current) return;
    const c = toPitchCoords(e.clientX, e.clientY);
    if (!c) return;
    const player = xi.starters[dragIdx.current];
    if (!player) return;
    setDraft((d) =>
      d ? { ...d, positionOverrides: { ...d.positionOverrides, [player.id]: c } } : d,
    );
  };
  const onPointerUp = () => {
    const i = dragIdx.current;
    if (i !== null && !dragMoved.current) setPlayerCardId(xi.starters[i]?.id ?? null);
    dragIdx.current = null;
    pointerStart.current = null;
    dragMoved.current = false;
  };
  const onPointerCancel = () => {
    dragIdx.current = null;
    pointerStart.current = null;
    dragMoved.current = false;
  };

  const applyInterpretations = async (
    base: TacticalSetup,
    requests: TacticalInstructionRequest[],
    busyKey: string,
  ): Promise<TacticalSetup> => {
    if (!requests.length) return base;
    setInterpreting(busyKey);
    setInterpretWarning(null);
    const result = await interpretTacticalInstructions(instructionRoster, requests);
    const cache: TacticalInstructionCache = {
      team: base.instructionCache?.team,
      players: { ...(base.instructionCache?.players ?? {}) },
    };
    for (const request of requests) {
      const interpretation = result.interpretations[request.key];
      if (!interpretation) continue;
      if (request.scope === "team") cache.team = interpretation;
      else if (request.subjectPlayerId) cache.players[request.subjectPlayerId] = interpretation;
    }
    setInterpretWarning(result.warning ?? null);
    setInterpreting(null);
    return { ...base, instructionCache: cache };
  };

  const interpretTeam = async () => {
    const text = draft.teamInstructions ?? "";
    if (!text.trim()) return;
    const next = await applyInterpretations(
      draft,
      [{ key: "team", text, scope: "team" }],
      "team",
    );
    setDraft((current) => current ? { ...current, instructionCache: next.instructionCache } : current);
  };

  const interpretPlayer = async () => {
    if (!selectedPlayer || !selectedText.trim()) return;
    const next = await applyInterpretations(
      draft,
      [{ key: `player:${selectedPlayer.id}`, text: selectedText, scope: "player", subjectPlayerId: selectedPlayer.id }],
      selectedPlayer.id,
    );
    setDraft((current) => current ? { ...current, instructionCache: next.instructionCache } : current);
  };

  const saveTactics = async () => {
    const requests: TacticalInstructionRequest[] = [];
    const teamText = draft.teamInstructions ?? "";
    if (teamText.trim() && !isInterpretationCurrent(
      draft.instructionCache?.team,
      teamText,
      instructionFingerprint,
      "team",
    )) {
      requests.push({ key: "team", text: teamText, scope: "team" });
    }
    for (const player of squad) {
      const text = instructionDraft[player.id] ?? "";
      if (!text.trim()) continue;
      if (!isInterpretationCurrent(
        draft.instructionCache?.players[player.id],
        text,
        instructionFingerprint,
        "player",
        player.id,
      )) {
        requests.push({
          key: `player:${player.id}`,
          text,
          scope: "player",
          subjectPlayerId: player.id,
        });
      }
    }

    let interpretedDraft = await applyInterpretations(draft, requests, "all");
    const prunedPlayers = Object.fromEntries(
      Object.entries(interpretedDraft.instructionCache?.players ?? {})
        .filter(([playerId]) => (instructionDraft[playerId] ?? "").trim()),
    );
    interpretedDraft = {
      ...interpretedDraft,
      instructionCache: {
        team: teamText.trim() ? interpretedDraft.instructionCache?.team : undefined,
        players: prunedPlayers,
      },
    };
    setDraft(interpretedDraft);
    await updateTactics(interpretedDraft);
    await updatePlayerInstructions(instructionDraft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const pressFrom = 240 + lineShift;
  const pressTo = pressFrom + PRESS_REACH[Number(draft.pressing)];
  const selectedPlayer = squad.find((p) => p.id === selectedPlayerId) ?? squad[0];
  const selectedXIIndex = selectedPlayer ? xi.starters.findIndex((player) => player.id === selectedPlayer.id) : -1;
  const selectedSlotRole = selectedXIIndex >= 0 ? xi.roles[selectedXIIndex] : undefined;
  const selectedRoleAssignment = selectedPlayer && selectedSlotRole
    ? resolvePlayerRoleAssignment(
        draft.playerRoles?.[selectedPlayer.id],
        selectedSlotRole,
        draft.playStyle,
      )
    : undefined;
  const selectedText = selectedPlayer ? instructionDraft[selectedPlayer.id] ?? "" : "";
  const selectedCached = selectedPlayer ? draft.instructionCache?.players[selectedPlayer.id] : undefined;
  const selectedInterpretation = selectedPlayer && isInterpretationCurrent(
    selectedCached,
    selectedText,
    instructionFingerprint,
    "player",
    selectedPlayer.id,
  ) ? selectedCached : undefined;
  const teamCached = draft.instructionCache?.team;
  const teamInterpretation = isInterpretationCurrent(
    teamCached,
    draft.teamInstructions ?? "",
    instructionFingerprint,
    "team",
  ) ? teamCached : undefined;
  const playerCard = playerCardId ? xi.starters.find((p) => p.id === playerCardId) ?? null : null;
  const playerCardIdx = playerCard ? xi.starters.findIndex((p) => p.id === playerCard.id) : -1;

  return (
    <main className="flex h-full flex-col bg-navy">
      <TopBar budget={false} />

      <div className="flex min-h-0 flex-1 flex-row">
        {/* ---------- VERTICAL PITCH (home goal bottom, attack upward) ---------- */}
        <div className="flex w-[48%] min-w-[150px] max-w-[400px] shrink-0 flex-col border-r border-white/10 sm:w-[42%]">
          <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center p-1.5 sm:p-3">
            <div
              ref={pitchRef}
              className="relative touch-none overflow-hidden rounded-xl border border-white/20 bg-[#102d18] shadow-xl"
              style={{
                width: pitchW || "100%",
                aspectRatio: `650 / ${TACTICS_VIEW_H}`,
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onPointerLeave={(e) => {
                if (e.buttons === 0) onPointerCancel();
              }}
            >
              <span
                className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 text-[7px] font-black tracking-[0.18em] text-white/45"
                style={{ top: `${((TACTICS_GOAL_MARGIN + 7) / TACTICS_VIEW_H) * 100}%` }}
              >
                ATTACK ↑
              </span>

              {/* The striped playing surface is inset so both nets can occupy
                  real exterior space behind their goal lines. */}
              <div
                className="pointer-events-none absolute inset-x-0 border border-white/55"
                style={{
                  top: `${(TACTICS_GOAL_MARGIN / TACTICS_VIEW_H) * 100}%`,
                  height: `${(TACTICS_PITCH_H / TACTICS_VIEW_H) * 100}%`,
                  background:
                    "repeating-linear-gradient(0deg, #2E7D32 0%, #2E7D32 10%, #317F35 10%, #317F35 20%)",
                }}
              >
                {/* pressing territory, rotated from engine X into vertical Y */}
                {Number(draft.pressing) > 0 && (
                  <div
                    className="absolute inset-x-0 bg-gold/10"
                    style={{ top: `${100 - pressTo / 10}%`, height: `${(pressTo - pressFrom) / 10}%` }}
                  >
                    <div className="absolute inset-x-0 top-0 border-t border-dashed border-gold/65" />
                  </div>
                )}

                {/* full vertical pitch markings */}
                <div className="absolute inset-0">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-white/55" />
                  <div className="absolute left-1/2 top-1/2 h-[12%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/55" />
                  <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />

                  {/* opponent penalty / goal areas */}
                  <div className="absolute left-[19.1%] top-0 h-[16.5%] w-[61.8%] border border-white/55" />
                  <div className="absolute left-[36%] top-0 h-[5.5%] w-[28%] border border-white/55" />
                  <span className="absolute left-1/2 top-[11%] h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />

                  {/* own penalty / goal areas */}
                  <div className="absolute bottom-0 left-[19.1%] h-[16.5%] w-[61.8%] border border-white/55" />
                  <div className="absolute bottom-0 left-[36%] h-[5.5%] w-[28%] border border-white/55" />
                  <span className="absolute bottom-[11%] left-1/2 h-1 w-1 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/70" />

                  {draft.offsideTrap && (
                    <div
                      className="absolute inset-x-0 border-t-2 border-dashed border-amber-300/85"
                      style={{ top: `${100 - (300 + lineShift) / 10}%` }}
                    />
                  )}
                </div>
              </div>

              {/* Nets: their open fronts meet the lines; all net depth remains
                  outside the green playing surface. */}
              <div
                className="pointer-events-none absolute left-[43.5%] z-[2] w-[13%] border-x-2 border-t-2 border-white/90 bg-white/10"
                style={{
                  top: `${((TACTICS_GOAL_MARGIN - TACTICS_GOAL_DEPTH) / TACTICS_VIEW_H) * 100}%`,
                  height: `${(TACTICS_GOAL_DEPTH / TACTICS_VIEW_H) * 100}%`,
                  backgroundImage:
                    "linear-gradient(90deg, transparent 45%, rgba(255,255,255,.3) 46%, rgba(255,255,255,.3) 54%, transparent 55%), linear-gradient(0deg, transparent 45%, rgba(255,255,255,.25) 46%, rgba(255,255,255,.25) 54%, transparent 55%)",
                  backgroundSize: "8px 8px",
                }}
              />
              <div
                className="pointer-events-none absolute left-[43.5%] z-[2] w-[13%] border-x-2 border-b-2 border-white/90 bg-white/10"
                style={{
                  top: `${((TACTICS_GOAL_MARGIN + TACTICS_PITCH_H) / TACTICS_VIEW_H) * 100}%`,
                  height: `${(TACTICS_GOAL_DEPTH / TACTICS_VIEW_H) * 100}%`,
                  backgroundImage:
                    "linear-gradient(90deg, transparent 45%, rgba(255,255,255,.3) 46%, rgba(255,255,255,.3) 54%, transparent 55%), linear-gradient(0deg, transparent 45%, rgba(255,255,255,.25) 46%, rgba(255,255,255,.25) 54%, transparent 55%)",
                  backgroundSize: "8px 8px",
                }}
              />

              {/* formation dots: engine Y → horizontal, engine X → bottom-to-top */}
              {xi.starters.map((p, i) => {
                const pos = displayPos(i);
                const dragPos = draft.positionOverrides[p.id];
                const isGK = p.primaryPosition === "GK";
                const number = tacticalNumbers[i] ?? p.shirtNumber;
                const roleAssignment = resolvePlayerRoleAssignment(
                  draft.playerRoles?.[p.id],
                  xi.roles[i],
                  draft.playStyle,
                );
                const roleDefinition = playerRoleDefinition(roleAssignment.role);
                return (
                  <div
                    key={p.id}
                    onPointerDown={onPointerDown(i)}
                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab select-none rounded-full active:cursor-grabbing ${selectedPlayerId === p.id ? "ring-2 ring-gold/80 ring-offset-2 ring-offset-transparent" : ""}`}
                    style={{
                      left: `${Math.min(94, Math.max(6, (pos.y / 650) * 100))}%`,
                      top: `${Math.min(97.4, Math.max(2.6, tacticsPitchTop(pos.x)))}%`,
                    }}
                    title={`${p.firstName} ${p.lastName} · #${number} ${xi.roles[i]} · ${roleDefinition.label} (${roleAssignment.duty}) · tap for stats, drag to move`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border text-[7px] font-black shadow-md sm:h-5 sm:w-5 sm:text-[8px] ${
                        isGK
                          ? "border-yellow-300 bg-navy text-yellow-300"
                          : dragPos
                            ? "border-gold bg-navy text-gold"
                            : "border-white/85 bg-card text-white"
                      }`}
                    >
                      {number}
                    </span>
                    <span className="mt-0.5 hidden max-w-14 truncate text-center text-[7px] font-semibold text-white/90 drop-shadow sm:block">
                      {p.lastName}
                    </span>
                    <span className="hidden rounded bg-black/45 px-1 text-[6px] font-bold text-gold/90 sm:block">
                      {roleDefinition.shortLabel}-{roleAssignment.duty[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="px-1.5 pb-2 text-center text-[8px] leading-tight text-white/40 sm:px-3 sm:text-[9px]">
            Tap = stats · drag = position<br />{draft.formation} · gold = press zone
          </p>
        </div>

        {/* ---------- SETTINGS (side panel, own scroll) ---------- */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 pb-28 sm:px-4">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-bold">Tactics</h1>
            <select
              value={draft.formation}
              onChange={(e) => {
                const formation = e.target.value;
                setDraft((d) => {
                  if (!d) return d;
                  const nextXI = selectBestXI(squad, formation);
                  return {
                    ...d,
                    formation,
                    playerRoles: retainCompatiblePlayerRoleAssignments(
                      d.playerRoles,
                      nextXI.starters.map((player, index) => ({
                        playerId: player.id,
                        position: nextXI.roles[index],
                      })),
                      d.playStyle,
                    ),
                    positionOverrides: {},
                  };
                });
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
                  {sl.key === "pressing" && (
                    <p className="mt-1.5 rounded-lg border border-gold/15 bg-gold/5 px-2.5 py-2 text-[10px] leading-relaxed text-white/55">
                      <span className="font-bold text-gold">Physical effect: </span>
                      {pressingBehavior(draft.pressing).description}
                    </p>
                  )}
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

              <div className="border-t border-white/10 pt-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="stat-label">Talk to the whole team</span>
                    <p className="mt-1 text-[10px] leading-relaxed text-white/40">
                      Write in your own words—even with shorthand or spelling mistakes. A small on-device AI model resolves meaning, players and roles; first use downloads it once, then your browser cache reuses it.
                    </p>
                  </div>
                  <Sparkles size={17} className="mt-0.5 shrink-0 text-gold" />
                </div>
                <textarea
                  value={draft.teamInstructions ?? ""}
                  onChange={(e) => set("teamInstructions", e.target.value)}
                  placeholder="Tell the team what you want them to do and when…"
                  rows={3}
                  maxLength={600}
                  className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-navy p-3 text-xs leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-gold"
                />
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[9px] text-white/30">{(draft.teamInstructions ?? "").length}/600</span>
                  <button
                    type="button"
                    disabled={!draft.teamInstructions?.trim() || interpreting !== null}
                    onClick={() => void interpretTeam()}
                    className="flex items-center gap-1.5 rounded-lg border border-gold/35 bg-gold/10 px-2.5 py-1.5 text-[9px] font-bold text-gold disabled:opacity-35"
                  >
                    {interpreting === "team" ? <LoaderCircle size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Understand with AI
                  </button>
                </div>
                <InstructionInterpretationView
                  text={draft.teamInstructions ?? ""}
                  interpretation={teamInterpretation}
                  stale={Boolean(draft.teamInstructions?.trim() && teamCached && !teamInterpretation)}
                />
              </div>
            </div>
          </section>

          {/* Individual instructions */}
          <section className="card-panel mt-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="stat-label">Individual Instructions</span>
                <p className="mt-1 text-[10px] leading-relaxed text-white/40">
                  Describe intent in your own words. Local AI uses semantic context and resolves teammate references instead of scanning for command phrases.
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
                <option key={p.id} value={p.id}>XI · {xi.roles[i]} · #{tacticalNumbers[i] ?? p.shirtNumber} {p.firstName} {p.lastName}</option>
              ))}
              {xi.bench.map((p) => (
                <option key={p.id} value={p.id}>Bench · {p.primaryPosition} · #{p.shirtNumber} {p.firstName} {p.lastName}</option>
              ))}
              {squad.filter((p) => !xi.starters.includes(p) && !xi.bench.includes(p)).map((p) => (
                <option key={p.id} value={p.id}>Squad · {p.primaryPosition} · #{p.shirtNumber} {p.lastName}</option>
              ))}
            </select>

            {selectedPlayer && selectedSlotRole && selectedRoleAssignment ? (
              <div className="mt-2">
                <PlayerRoleEditor
                  position={selectedSlotRole}
                  assignment={selectedRoleAssignment}
                  onChange={(assignment) => setDraft((current) => current ? {
                    ...current,
                    playerRoles: { ...(current.playerRoles ?? {}), [selectedPlayer.id]: assignment },
                  } : current)}
                />
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-white/10 bg-navy p-2.5 text-[10px] leading-relaxed text-white/40">
                Role and duty are assigned to the active XI. Move this player into the formation to configure their match job.
              </p>
            )}

            <textarea
              value={selectedText}
              onChange={(e) => selectedPlayer && setInstructionDraft((d) => ({ ...d, [selectedPlayer.id]: e.target.value }))}
              placeholder="Tell this player what you mean in any natural wording…"
              rows={3}
              maxLength={600}
              className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-navy p-3 text-xs leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-gold"
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[9px] text-white/30">{selectedText.length}/600</span>
              <button
                type="button"
                disabled={!selectedText.trim() || interpreting !== null}
                onClick={() => void interpretPlayer()}
                className="flex items-center gap-1.5 rounded-lg border border-gold/35 bg-gold/10 px-2.5 py-1.5 text-[9px] font-bold text-gold disabled:opacity-35"
              >
                {interpreting === selectedPlayer?.id ? <LoaderCircle size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Understand with AI
              </button>
            </div>

            <InstructionInterpretationView
              text={selectedText}
              interpretation={selectedInterpretation}
              stale={Boolean(selectedText.trim() && selectedCached && !selectedInterpretation)}
            />
          </section>

          {interpretWarning && (
            <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[10px] leading-relaxed text-amber-200">
              Local AI was unavailable: {interpretWarning} The saved result is visibly marked as a non-AI basic fallback and can be reinterpreted later.
            </div>
          )}

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

      {playerCard && (
        <PlayerStatsPopup
          player={playerCard}
          role={xi.roles[playerCardIdx] ?? playerCard.primaryPosition}
          roleAssignment={resolvePlayerRoleAssignment(
            draft.playerRoles?.[playerCard.id],
            xi.roles[playerCardIdx] ?? playerCard.primaryPosition,
            draft.playStyle,
          )}
          number={tacticalNumbers[playerCardIdx] ?? playerCard.shirtNumber}
          onClose={() => setPlayerCardId(null)}
        />
      )}

      <div className="fixed inset-x-0 bottom-14 z-30 mx-auto max-w-lg px-4 pb-2">
        <button
          disabled={interpreting !== null}
          onClick={() => void saveTactics()}
          className="btn-gold flex w-full items-center justify-center gap-2 disabled:opacity-60"
        >
          {interpreting === "all"
            ? <><LoaderCircle size={16} className="animate-spin" /> Understanding instructions…</>
            : saved
              ? "Saved ✓"
              : <><Save size={16} /> Save Tactics</>}
        </button>
      </div>

      <BottomNav />
    </main>
  );
}

function PlayerStatsPopup({
  player, role, roleAssignment, number, onClose,
}: { player: Player; role: string; roleAssignment: PlayerRoleAssignment; number: number; onClose: () => void }) {
  const groups: { title: string; stats: [string, number][] }[] = [
    {
      title: "Technical",
      stats: [
        ["Control", player.ballControl], ["Short pass", player.shortPassing],
        ["Long pass", player.longPassing], ["Dribbling", player.dribbling],
        ["Finishing", player.finishing], ["Long shots", player.longShots],
        ["Crossing", player.crossing], ["Tackling", player.tackling],
      ],
    },
    {
      title: "Mental",
      stats: [
        ["Decisions", player.decisions], ["Creativity", player.creativity],
        ["Composure", player.composure], ["Anticipation", player.anticipation],
        ["Positioning", player.positioning], ["Off the ball", player.offTheBall],
      ],
    },
    {
      title: "Physical",
      stats: [
        ["Pace", player.pace], ["Acceleration", player.acceleration],
        ["Strength", player.strength], ["Agility", player.agility],
        ["Balance", player.balance], ["Jumping", player.jumping],
      ],
    },
  ];
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3" onPointerDown={onClose}>
      <section className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-gold/35 bg-navy shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-white/10 bg-panel px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-gold bg-card text-lg font-black text-gold">{number}</span>
            <div>
              <h2 className="font-black">{player.firstName} {player.lastName}</h2>
              <p className="text-[10px] font-semibold text-gold">{role} · {playerRoleDefinition(roleAssignment.role).label} ({roleAssignment.duty})</p>
              <p className="mt-0.5 text-[9px] text-white/40">{player.primaryPosition} · {player.age} yrs · {player.height} cm · {player.preferredFoot} foot</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Close player stats"><X size={18} /></button>
        </header>
        <div className="space-y-4 p-4">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="stat-label mb-2">{group.title}</div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
                {group.stats.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between border-b border-white/5 pb-1 text-[11px]">
                    <span className="text-white/55">{label}</span>
                    <span className={`font-black tabular-nums ${statColor(value)}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="rounded-lg bg-card px-3 py-2 text-[9px] leading-relaxed text-white/40">
            Tactical number #{number} identifies this role on the board and during the match. It does not change the player&apos;s registered squad number.
          </p>
        </div>
      </section>
    </div>
  );
}

function statColor(value: number): string {
  if (value >= 16) return "text-emerald-400";
  if (value >= 13) return "text-gold";
  if (value >= 9) return "text-white/80";
  return "text-red-400";
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
