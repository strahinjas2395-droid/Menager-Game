"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pause, Play, FastForward, Gauge, SlidersHorizontal, X, Check, LoaderCircle, Sparkles } from "lucide-react";
import MatchCanvas, { type MatchScene } from "@/components/MatchCanvas";
import StepDots from "@/components/StepDots";
import InstructionInterpretationView from "@/components/InstructionInterpretationView";
import { getMatchContext, useGameStore, type MatchContext } from "@/store/gameStore";
import { selectBestXI, type MatchSnapshot, type Side } from "@/engine/matchSimulator";
import type {
  MatchEvent, MatchResult, MatchStats, TacticalInstructionCache, TacticalSetup,
} from "@/types";
import {
  CompetitionType, DefensiveLine, MatchEventType, MentalityLevel, PlayStyle,
  PressingIntensity, TempoSetting, TimeWasting, WidthSetting,
} from "@/types";
import { FORMATION_NAMES } from "@/engine/formations";
import {
  buildInstructionRoster,
  compileInstructionPlans,
  instructionContextFingerprint,
  isInterpretationCurrent,
  type InstructionRosterPlayer,
} from "@/engine/directives";
import { interpretTacticalInstructions, type TacticalInstructionRequest } from "@/services/tacticalInterpreter";
import { expectedGoals } from "@/engine/leagueEngine";
import { penaltyShootout } from "@/engine/cupEngine";
import { SeededRNG } from "@/database/rng";

type WorkerMsg =
  | { type: "ready" }
  | { type: "state"; state: MatchSnapshot }
  | { type: "event"; event: MatchEvent }
  | { type: "halfTime" }
  | { type: "fullTime"; state: MatchSnapshot };

export default function MatchPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-navy text-white/60">Loading…</div>}>
      <MatchScreen />
    </Suspense>
  );
}

function MatchScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const fixtureId = params.get("fixture") ?? "";
  const save = useGameStore((s) => s.save);
  const recordUserMatch = useGameStore((s) => s.recordUserMatch);

  const ctx = useMemo<MatchContext | null>(
    () => (save && fixtureId ? getMatchContext(save, fixtureId) : null),
    [save, fixtureId],
  );

  const sceneRef = useRef<MatchScene | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [halfTime, setHalfTime] = useState(false);
  const [fullTime, setFullTime] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4 | 8>(
    (save?.settings.defaultMatchSpeed as 1 | 2 | 4 | 8) ?? 2,
  );
  const speedRef = useRef<1 | 2 | 4 | 8>(speed);
  speedRef.current = speed;
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [pendingSub, setPendingSub] = useState<{ off: number; on: number; dirty: boolean }>({ off: 0, on: 0, dirty: false });
  // knockout drama
  const [etGoals, setEtGoals] = useState<{ h: number; a: number } | null>(null);
  const [pens, setPens] = useState<{ home: number; away: number } | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showTactics, setShowTactics] = useState(false);
  const [liveTactics, setLiveTactics] = useState<TacticalSetup | null>(null);
  const [liveInstructions, setLiveInstructions] = useState<Record<string, string>>({});
  const [liveInterpreting, setLiveInterpreting] = useState(false);
  const [liveInterpretWarning, setLiveInterpretWarning] = useState<string | null>(null);
  const resumeAfterTactics = useRef(false);

  const isKnockout = ctx?.fixture.competitionType !== CompetitionType.League;
  const userSide: Side = ctx?.home.isUserTeam ? "home" : "away";
  const liveInstructionRoster = useMemo(() => {
    if (!ctx || !save) return [];
    const team = ctx.home.isUserTeam ? ctx.home : ctx.away;
    const club = save.world.clubs[save.userClubId];
    const fullSquad = (club?.playerIds ?? [])
      .map((id) => save.world.players[id])
      .filter((player): player is NonNullable<typeof player> => Boolean(player));
    const currentLineup = ctx.home.isUserTeam ? snapshot?.homeLineup : snapshot?.awayLineup;
    const activePlayers = (currentLineup ?? [])
      .map((entry) => save.world.players[entry.playerId])
      .filter((player): player is NonNullable<typeof player> => Boolean(player));
    const roleAssignment = selectBestXI(
      activePlayers.length === 11 ? activePlayers : team.starters,
      liveTactics?.formation ?? team.tactics.formation,
    );
    const stableNumbers = roleAssignment.starters.map((player) =>
      currentLineup?.find((entry) => entry.playerId === player.id)?.shirtNumber ??
      team.displayNumbers[team.starters.findIndex((starter) => starter.id === player.id)] ??
      player.shirtNumber,
    );
    return buildInstructionRoster(
      fullSquad.length ? fullSquad : [...team.starters, ...team.bench],
      roleAssignment.starters,
      roleAssignment.roles,
      stableNumbers,
    );
  }, [ctx, save, snapshot?.homeLineup, snapshot?.awayLineup, liveTactics?.formation]);
  const liveInstructionFingerprint = useMemo(
    () => instructionContextFingerprint(liveInstructionRoster),
    [liveInstructionRoster],
  );

  useEffect(() => {
    if (!ctx) return;
    const source = ctx.home.isUserTeam ? ctx.home.tactics : ctx.away.tactics;
    setLiveTactics({
      ...source,
      teamInstructions: source.teamInstructions ?? "",
      instructionCache: {
        team: source.instructionCache?.team,
        players: { ...(source.instructionCache?.players ?? {}) },
      },
      positionOverrides: { ...source.positionOverrides },
      setPieces: { ...source.setPieces },
    });
    const team = ctx.home.isUserTeam ? ctx.home : ctx.away;
    setLiveInstructions(Object.fromEntries(
      [...team.starters, ...team.bench].map((p) => [p.id, p.individualInstructions ?? ""]),
    ));
  }, [ctx]);

  // --- boot worker
  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;

    // best-effort landscape lock on mobile
    try {
      const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      void so?.lock?.("landscape").catch(() => undefined);
    } catch {
      /* unsupported */
    }

    const worker = new Worker(new URL("../../engine/matchWorker.ts", import.meta.url));
    worker.onmessage = (ev: MessageEvent<WorkerMsg>) => {
      if (cancelled) return;
      const msg = ev.data;
      switch (msg.type) {
        case "state": {
          const st = msg.state;
          setSnapshot(st);
          setEvents(st.events);
          sceneRef.current?.updatePositions(st.homePositions, st.awayPositions, st.ball);
          break;
        }
        case "event": {
          if (msg.event.type === "Goal") {
            const vib = useGameStore.getState().save?.settings.vibration;
            if (vib !== false) {
              try {
                navigator.vibrate?.(200);
              } catch { /* noop */ }
            }
          }
          break;
        }
        case "halfTime":
          setHalfTime(true);
          setPaused(true);
          break;
        case "fullTime":
          setFullTime(true);
          setPaused(true);
          break;
      }
    };
    worker.postMessage({
      type: "init",
      payload: {
        home: ctx.home,
        away: ctx.away,
        options: { seed: ctx.seed, timeScale: 6 },
      },
    });
    workerRef.current = worker;
    // match UI highlight: sim defaults to 1x — push the selected speed immediately
    worker.postMessage({ type: "speed", value: speedRef.current });

    return () => {
      cancelled = true;
      try {
        void screen.orientation?.unlock?.();
      } catch { /* noop */ }
      worker.terminate();
      workerRef.current = null;
    };
  }, [ctx]);

  const post = useCallback((msg: unknown) => {
    workerRef.current?.postMessage(msg);
  }, []);

  const changeSpeed = (s: 1 | 2 | 4 | 8) => {
    setSpeed(s);
    post({ type: "speed", value: s });
    if (paused && !halfTime && !fullTime) {
      post({ type: "resume" });
      setPaused(false);
    }
  };

  const togglePause = () => {
    post({ type: paused ? "resume" : "pause" });
    setPaused(!paused);
  };

  const skip = () => {
    if (halfTime || fullTime) return;
    post({ type: "skip" });
  };

  const openTactics = () => {
    resumeAfterTactics.current = !paused && !halfTime && !fullTime;
    if (resumeAfterTactics.current) {
      post({ type: "pause" });
      setPaused(true);
    }
    setShowTactics(true);
  };

  const closeTactics = () => {
    setShowTactics(false);
    if (resumeAfterTactics.current) {
      post({ type: "resume" });
      post({ type: "speed", value: speed });
      setPaused(false);
    }
    resumeAfterTactics.current = false;
  };

  const applyLiveTactics = async () => {
    if (!liveTactics || !ctx) return;
    const matchPlayers = userSide === "home"
      ? ctx.home.starters.concat(ctx.home.bench)
      : ctx.away.starters.concat(ctx.away.bench);
    const withLiveText = matchPlayers.map((player) => ({
      ...player,
      individualInstructions: liveInstructions[player.id] ?? "",
    }));
    const requests: TacticalInstructionRequest[] = [];
    const teamText = liveTactics.teamInstructions ?? "";
    if (teamText.trim() && !isInterpretationCurrent(
      liveTactics.instructionCache?.team,
      teamText,
      liveInstructionFingerprint,
      "team",
    )) {
      requests.push({ key: "team", text: teamText, scope: "team" });
    }
    for (const player of withLiveText) {
      const text = player.individualInstructions ?? "";
      if (!text.trim()) continue;
      if (!isInterpretationCurrent(
        liveTactics.instructionCache?.players[player.id],
        text,
        liveInstructionFingerprint,
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

    setLiveInterpreting(true);
    setLiveInterpretWarning(null);
    let updatedTactics = liveTactics;
    if (requests.length) {
      const result = await interpretTacticalInstructions(liveInstructionRoster, requests);
      const cache: TacticalInstructionCache = {
        team: liveTactics.instructionCache?.team,
        players: { ...(liveTactics.instructionCache?.players ?? {}) },
      };
      for (const request of requests) {
        const interpretation = result.interpretations[request.key];
        if (!interpretation) continue;
        if (request.scope === "team") cache.team = interpretation;
        else if (request.subjectPlayerId) cache.players[request.subjectPlayerId] = interpretation;
      }
      updatedTactics = { ...liveTactics, instructionCache: cache };
      setLiveTactics(updatedTactics);
      setLiveInterpretWarning(result.warning ?? null);
    }

    const plans = compileInstructionPlans(
      withLiveText,
      updatedTactics.teamInstructions ?? "",
      updatedTactics.instructionCache,
      liveInstructionRoster,
    );
    post({ type: "tactics", side: userSide, tactics: updatedTactics });
    post({
      type: "directives",
      side: userSide,
      directives: plans.playerDirectives,
      teamDirectives: plans.teamDirectives,
    });
    setLiveInterpreting(false);
    closeTactics();
  };

  const makeSubstitution = (off = pendingSub.off, on = pendingSub.on) => {
    post({ type: "sub", side: userSide, starterIdx: off, benchIdx: on });
    setPendingSub({ off, on, dirty: false });
  };

  const resumeSecondHalf = () => {
    setHalfTime(false);
    setPaused(false);
    post({ type: "resumeHalf" });
    post({ type: "speed", value: speed });
    if (pendingSub.dirty && ctx) {
      post({ type: "sub", side: userSide, starterIdx: pendingSub.off, benchIdx: pendingSub.on });
      setPendingSub({ off: 0, on: 0, dirty: false });
    }
  };

  // --- knockout extra time & penalties
  const playExtraTime = () => {
    if (!ctx) return;
    const rng = new SeededRNG(ctx.seed ^ 0xe7);
    const xg = expectedGoals(ctx.home.starters, ctx.away.starters, 1.0);
    const eh = poisson(xg.home / 3, rng);
    const ea = poisson(xg.away / 3, rng);
    setEtGoals({ h: eh, a: ea });
    if ((snapshot?.homeScore ?? 0) + eh === (snapshot?.awayScore ?? 0) + ea) {
      setPens(penaltyShootout(ctx.home.starters.concat(ctx.home.bench), ctx.away.starters.concat(ctx.away.bench), rng));
    }
  };

  const finishMatch = async () => {
    if (!ctx || !snapshot) return;
    const homeGoals = snapshot.homeScore + (etGoals?.h ?? 0);
    const awayGoals = snapshot.awayScore + (etGoals?.a ?? 0);
    const result: MatchResult = {
      fixtureId: ctx.fixture.id,
      homeClubId: ctx.fixture.homeClubId,
      awayClubId: ctx.fixture.awayClubId,
      homeGoals,
      awayGoals,
      homePens: pens?.home,
      awayPens: pens?.away,
      stats: snapshot.stats,
      ratings: snapshot.ratings,
      events: [
        ...snapshot.events,
        ...(etGoals
          ? [{ minute: 105, type: MatchEventType.FullTime, text: `Extra time: +${etGoals.h} - +${etGoals.a}` }]
          : []),
        ...(pens
          ? [{ minute: 120, type: MatchEventType.FullTime, text: `Penalties: ${pens.home} - ${pens.away}` }]
          : []),
      ],
    };
    const res = recordUserMatch(result);
    if (res.type === "match") {
      router.replace(`/match?fixture=${res.fixtureId}`);
    } else {
      router.replace("/hub");
    }
  };

  if (!save) {
    return <main className="flex h-full items-center justify-center bg-navy text-white/60">No career.</main>;
  }
  if (!ctx) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 bg-navy">
        <p className="text-white/60">Fixture not found.</p>
        <button className="btn-gold" onClick={() => router.replace("/hub")}>Back to Hub</button>
      </main>
    );
  }

  const clock = formatClock(snapshot?.gameTime ?? 0, snapshot?.addedTime90 ?? 0);
  const homeClub = save.world.clubs[ctx.fixture.homeClubId]!;
  const awayClub = save.world.clubs[ctx.fixture.awayClubId]!;

  const displayHome = snapshot ? snapshot.homeScore + (etGoals?.h ?? 0) : 0;
  const displayAway = snapshot ? snapshot.awayScore + (etGoals?.a ?? 0) : 0;

  const finalScoreDecided =
    !isKnockout ||
    displayHome !== displayAway ||
    (pens !== null && pens.home !== pens.away);

  return (
    <main className="flex h-full flex-col overflow-hidden bg-navy">
      {/* scoreboard */}
      <header className="border-b border-white/10 bg-panel px-3 py-2">
        <div className="text-center text-[10px] uppercase tracking-widest text-gold/80">
          {ctx.competitionLabel}
        </div>
        <div className="mt-1 flex items-center justify-center gap-3">
          <span className="max-w-[38%] truncate text-right text-sm font-bold">{homeClub.shortName}</span>
          <span className="rounded-lg bg-navy px-3 py-1 text-xl font-black tabular-nums">
            {displayHome} - {displayAway}
          </span>
          <span className="max-w-[38%] truncate text-left text-sm font-bold">{awayClub.shortName}</span>
          <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-xs font-bold tabular-nums text-gold">
            {clock}
          </span>
        </div>
        {pens && (
          <div className="mt-0.5 text-center text-[11px] font-semibold text-white/70">
            Penalties {pens.home} - {pens.away}
          </div>
        )}
      </header>

      <div className="match-stage">
        {/* Pitch is constrained by both available width and height, so all four
            touchlines remain visible in portrait and landscape. */}
        <div className="match-pitch-shell relative p-2">
          <MatchCanvas
            sceneRef={sceneRef}
            homeColor={homeClub.primaryColor}
            awayColor={awayClub.primaryColor}
            homeNumbers={ctx.home.displayNumbers}
            awayNumbers={ctx.away.displayNumbers}
          />
          {snapshot?.ball.airborne && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-gold/60 bg-navy/90 px-2.5 py-1 text-[9px] font-black tracking-widest text-gold shadow-lg">
              ↑ AIR BALL
            </div>
          )}
          {paused && !halfTime && !fullTime && !showTactics && (
            <div className="absolute inset-2 flex items-center justify-center rounded-lg bg-black/40">
              <span className="rounded-full bg-black/70 px-4 py-2 text-sm font-bold">PAUSED</span>
            </div>
          )}
        </div>

        {/* Match desk: in portrait it occupies a fixed strip below the whole
            pitch; in landscape it becomes a side rail. */}
        <aside className="match-sidebar gap-2 border-t border-white/10 px-3 py-2 landscape:border-l landscape:border-t-0">
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5">
            <button
              onClick={togglePause}
              disabled={halfTime || fullTime}
              className="btn-dark flex items-center gap-1 px-2.5 py-1.5 text-[11px] disabled:opacity-30"
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}
              {paused ? "Resume" : "Pause"}
            </button>
            <div className="flex gap-1">
              {([1, 2, 4, 8] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => changeSpeed(s)}
                  className={`rounded-lg px-2 py-1.5 text-[10px] font-bold transition ${
                    speed === s ? "bg-gold text-navy" : "border border-white/10 bg-card text-white/60"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
            <button
              onClick={openTactics}
              disabled={fullTime}
              className="flex items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-[11px] font-bold text-gold disabled:opacity-30"
            >
              <SlidersHorizontal size={13} /> Tactics
            </button>
            <button onClick={() => setShowStats((v) => !v)} className="btn-dark flex items-center gap-1 px-2 py-1.5 text-[11px]">
              <Gauge size={13} /> Stats
            </button>
            <button onClick={skip} disabled={halfTime || fullTime}
              className="btn-dark flex items-center gap-1 px-2 py-1.5 text-[11px] disabled:opacity-30" title="Skip to half / full time">
              <FastForward size={13} /> Skip
            </button>
          </div>

          {liveTactics && (
            <div className="shrink-0 truncate text-center text-[9px] text-white/35">
              {liveTactics.formation} · {prettyPlayStyle(liveTactics.playStyle)} · mentality {liveTactics.mentality + 1}/7
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-card/70 p-2">
            <div className="stat-label mb-1">Live Commentary</div>
            <ul className="space-y-1">
              {[...events].slice(-9).reverse().map((e, i) => (
                <li key={`${e.minute}-${i}-${e.text}`} className="text-[10px] leading-snug text-white/75">
                  <span className="font-bold text-gold">{e.minute}&apos;</span> {e.text}
                </li>
              ))}
              {events.length === 0 && <li className="text-[10px] text-white/40">Kick off pending…</li>}
            </ul>
          </div>
        </aside>
      </div>

      {showTactics && liveTactics && (
        <LiveTacticsPanel
          tactics={liveTactics}
          onChange={setLiveTactics}
          onApply={applyLiveTactics}
          onClose={closeTactics}
          home={homeClub.shortName}
          away={awayClub.shortName}
          score={`${displayHome}-${displayAway}`}
          minute={clock}
          currentLineup={userSide === "home" ? snapshot?.homeLineup ?? [] : snapshot?.awayLineup ?? []}
          bench={userSide === "home" ? ctx.home.bench : ctx.away.bench}
          pendingSub={pendingSub}
          onPendingSub={setPendingSub}
          onSub={makeSubstitution}
          atHalfTime={halfTime}
          instructionPlayers={userSide === "home" ? ctx.home.starters.concat(ctx.home.bench) : ctx.away.starters.concat(ctx.away.bench)}
          instructionText={liveInstructions}
          onInstructionText={setLiveInstructions}
          instructionRoster={liveInstructionRoster}
          instructionFingerprint={liveInstructionFingerprint}
          interpreting={liveInterpreting}
          interpretWarning={liveInterpretWarning}
        />
      )}

      {liveInterpretWarning && !showTactics && (
        <button
          type="button"
          onClick={() => setLiveInterpretWarning(null)}
          className="absolute bottom-3 left-1/2 z-[65] max-w-[90%] -translate-x-1/2 rounded-xl border border-amber-400/30 bg-black/90 px-3 py-2 text-[9px] leading-relaxed text-amber-200 shadow-xl"
        >
          Cloud AI was unavailable; a basic fallback was applied. Tap to dismiss and retry from Match Tactics when online.
        </button>
      )}

      {showStats && snapshot && (
        <StatsOverlay stats={snapshot.stats} onClose={() => setShowStats(false)}
          home={homeClub.shortName} away={awayClub.shortName} />
      )}

      {/* HALFTIME */}
      {halfTime && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gold/40 bg-navy p-5">
            <h2 className="text-center text-xl font-black text-gold">HALF TIME</h2>
            <p className="mt-1 text-center text-sm">
              {homeClub.shortName} {snapshot?.homeScore ?? 0} - {snapshot?.awayScore ?? 0} {awayClub.shortName}
            </p>
            {snapshot && <StatsBlock stats={snapshot.stats} home={homeClub.shortName} away={awayClub.shortName} />}

            <div className="mt-4 rounded-xl bg-card p-3">
              <span className="stat-label">Substitution (your team)</span>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <select
                  value={pendingSub.off}
                  onChange={(e) => setPendingSub((s) => ({ ...s, off: Number(e.target.value), dirty: true }))}
                  className="rounded-lg border border-white/10 bg-navy px-2 py-1.5"
                >
                  {(ctx.home.isUserTeam ? snapshot?.homeLineup ?? [] : snapshot?.awayLineup ?? []).map((p, i) => (
                    <option key={p.playerId} value={i}>#{p.shirtNumber} {p.name} (off)</option>
                  ))}
                </select>
                <select
                  value={pendingSub.on}
                  onChange={(e) => setPendingSub((s) => ({ ...s, on: Number(e.target.value), dirty: true }))}
                  className="rounded-lg border border-white/10 bg-navy px-2 py-1.5"
                >
                  {(ctx.home.isUserTeam ? ctx.home.bench : ctx.away.bench).map((p, i) => (
                    <option key={p.id} value={i}>#{p.shirtNumber} {p.lastName} (on)</option>
                  ))}
                </select>
              </div>
            </div>

            <button onClick={openTactics} className="btn-dark mt-4 flex w-full items-center justify-center gap-2 text-xs">
              <SlidersHorizontal size={14} /> Adjust Tactics
            </button>
            <button onClick={resumeSecondHalf} className="btn-gold mt-2 w-full">
              Start Second Half
            </button>
          </div>
        </div>
      )}

      {/* FULL TIME */}
      {fullTime && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gold/40 bg-navy p-5">
            <h2 className="text-center text-xl font-black text-gold">FULL TIME</h2>
            <p className="mt-2 text-center text-2xl font-black">
              {homeClub.shortName} {displayHome} - {displayAway} {awayClub.shortName}
            </p>
            {snapshot && <StatsBlock stats={snapshot.stats} home={homeClub.shortName} away={awayClub.shortName} />}

            {snapshot && isKnockout && displayHome === displayAway && !etGoals && (
              <button onClick={playExtraTime} className="btn-gold mt-4 w-full">
                Play Extra Time &amp; Penalties
              </button>
            )}
            {snapshot && isKnockout && displayHome === displayAway && etGoals && !pens && (
              <p className="mt-3 text-center text-sm text-yellow-300">
                Extra time ended level — penalties required!
              </p>
            )}
            {finalScoreDecided && (
              <div className="mt-3">
                <RatingsStrip
                  home={snapshot?.homeLineup ?? []}
                  away={snapshot?.awayLineup ?? []}
                />
                <button
                  onClick={() => void finishMatch()}
                  className="btn-gold mt-3 w-full"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

const LIVE_SLIDERS: {
  key: "tempo" | "passingLength" | "defensiveLine" | "pressing" | "width" | "mentality";
  label: string;
  min: number;
  max: number;
  low: string;
  high: string;
}[] = [
  { key: "mentality", label: "Mentality", min: 0, max: 6, low: "Defend", high: "Attack" },
  { key: "tempo", label: "Tempo", min: 0, max: 4, low: "Patient", high: "Urgent" },
  { key: "passingLength", label: "Passing", min: 0, max: 4, low: "Short", high: "Direct" },
  { key: "defensiveLine", label: "Defensive line", min: 0, max: 4, low: "Deep", high: "High" },
  { key: "pressing", label: "Pressing", min: 0, max: 4, low: "Hold", high: "Hunt" },
  { key: "width", label: "Width", min: 0, max: 4, low: "Narrow", high: "Wide" },
];

function LiveTacticsPanel({
  tactics, onChange, onApply, onClose, home, away, score, minute,
  currentLineup, bench, pendingSub, onPendingSub, onSub, atHalfTime,
  instructionPlayers, instructionText, onInstructionText,
  instructionRoster, instructionFingerprint, interpreting, interpretWarning,
}: {
  tactics: TacticalSetup;
  onChange: (t: TacticalSetup) => void;
  onApply: () => void;
  onClose: () => void;
  home: string;
  away: string;
  score: string;
  minute: string;
  currentLineup: MatchSnapshot["homeLineup"];
  bench: MatchContext["home"]["bench"];
  pendingSub: { off: number; on: number; dirty: boolean };
  onPendingSub: React.Dispatch<React.SetStateAction<{ off: number; on: number; dirty: boolean }>>;
  onSub: (off: number, on: number) => void;
  atHalfTime: boolean;
  instructionPlayers: MatchContext["home"]["starters"];
  instructionText: Record<string, string>;
  onInstructionText: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  instructionRoster: InstructionRosterPlayer[];
  instructionFingerprint: string;
  interpreting: boolean;
  interpretWarning: string | null;
}) {
  const [instructionPlayerId, setInstructionPlayerId] = useState(instructionPlayers[0]?.id ?? "");
  const [interpretingKey, setInterpretingKey] = useState<string | null>(null);
  const [localWarning, setLocalWarning] = useState<string | null>(null);
  const set = <K extends keyof TacticalSetup>(key: K, value: TacticalSetup[K]) =>
    onChange({ ...tactics, [key]: value });
  const activeIds = new Set(currentLineup.map((p) => p.playerId));
  const availableBench = bench.map((p, i) => ({ p, i })).filter(({ p }) => !activeIds.has(p.id));
  const selectedBenchIdx = availableBench.some(({ i }) => i === pendingSub.on)
    ? pendingSub.on
    : (availableBench[0]?.i ?? 0);
  const selectedInstructionText = instructionText[instructionPlayerId] ?? "";
  const selectedCached = tactics.instructionCache?.players[instructionPlayerId];
  const selectedInterpretation = isInterpretationCurrent(
    selectedCached,
    selectedInstructionText,
    instructionFingerprint,
    "player",
    instructionPlayerId,
  ) ? selectedCached : undefined;
  const teamCached = tactics.instructionCache?.team;
  const teamInterpretation = isInterpretationCurrent(
    teamCached,
    tactics.teamInstructions ?? "",
    instructionFingerprint,
    "team",
  ) ? teamCached : undefined;

  const interpretNow = async (request: TacticalInstructionRequest, key: string) => {
    setInterpretingKey(key);
    setLocalWarning(null);
    const result = await interpretTacticalInstructions(instructionRoster, [request]);
    const interpretation = result.interpretations[request.key];
    if (interpretation) {
      const cache: TacticalInstructionCache = {
        team: tactics.instructionCache?.team,
        players: { ...(tactics.instructionCache?.players ?? {}) },
      };
      if (request.scope === "team") cache.team = interpretation;
      else if (request.subjectPlayerId) cache.players[request.subjectPlayerId] = interpretation;
      onChange({ ...tactics, instructionCache: cache });
    }
    setLocalWarning(result.warning ?? null);
    setInterpretingKey(null);
  };

  const preset = (kind: "protect" | "control" | "chase") => {
    if (kind === "protect") {
      onChange({ ...tactics, playStyle: PlayStyle.ParkTheBus, mentality: MentalityLevel.Defensive,
        tempo: TempoSetting.Slow, passingLength: TempoSetting.Fast, defensiveLine: DefensiveLine.Deep,
        pressing: PressingIntensity.Low, width: WidthSetting.Narrow, timeWasting: TimeWasting.Always });
    } else if (kind === "control") {
      onChange({ ...tactics, playStyle: PlayStyle.PossessionBased, mentality: MentalityLevel.Balanced,
        tempo: TempoSetting.Normal, passingLength: TempoSetting.Slow, defensiveLine: DefensiveLine.Normal,
        pressing: PressingIntensity.Standard, width: WidthSetting.Normal, timeWasting: TimeWasting.Never });
    } else {
      onChange({ ...tactics, playStyle: PlayStyle.GegenpressingStyle, mentality: MentalityLevel.Attacking,
        tempo: TempoSetting.Fast, passingLength: TempoSetting.Normal, defensiveLine: DefensiveLine.High,
        pressing: PressingIntensity.High, width: WidthSetting.Wide, timeWasting: TimeWasting.Never });
    }
  };

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <section className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gold/35 bg-navy shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-panel px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 font-black text-gold"><SlidersHorizontal size={16} /> Match Tactics</h2>
            <p className="mt-0.5 text-[10px] text-white/45">{home} {score} {away} · {minute} · match paused</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close tactics">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => preset("protect")} className="rounded-lg border border-blue-300/20 bg-blue-400/10 py-2 text-[10px] font-bold text-blue-200">Protect lead</button>
            <button onClick={() => preset("control")} className="rounded-lg border border-white/15 bg-white/5 py-2 text-[10px] font-bold text-white/70">Control game</button>
            <button onClick={() => preset("chase")} className="rounded-lg border border-red-300/20 bg-red-400/10 py-2 text-[10px] font-bold text-red-200">Chase goal</button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-[10px] text-white/45">
              Formation
              <select value={tactics.formation} onChange={(e) => set("formation", e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-card px-2 py-2 text-xs font-semibold text-white outline-none focus:border-gold">
                {FORMATION_NAMES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-white/45">
              Play style
              <select value={tactics.playStyle} onChange={(e) => set("playStyle", e.target.value as PlayStyle)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-card px-2 py-2 text-xs font-semibold text-white outline-none focus:border-gold">
                {Object.values(PlayStyle).map((v) => <option key={v} value={v}>{prettyPlayStyle(v)}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {LIVE_SLIDERS.map((sl) => (
              <div key={sl.key}>
                <div className="flex justify-between text-[10px]"><span className="font-semibold text-white/75">{sl.label}</span><span className="text-gold">{Number(tactics[sl.key]) + 1}/{sl.max + 1}</span></div>
                <StepDots value={Number(tactics[sl.key])} min={sl.min} max={sl.max}
                  onChange={(v) => set(sl.key, v as never)} startLabel={sl.low} endLabel={sl.high} ariaLabel={sl.label} />
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]">
            <MatchToggle label="Counter" on={tactics.counterAttack} onChange={(v) => set("counterAttack", v)} />
            <MatchToggle label="Offside trap" on={tactics.offsideTrap} onChange={(v) => set("offsideTrap", v)} />
            <label className="rounded-lg bg-card p-2 text-white/55">Time wasting
              <select value={tactics.timeWasting} onChange={(e) => set("timeWasting", e.target.value as TimeWasting)} className="mt-1 w-full bg-transparent text-[10px] font-bold text-white outline-none">
                {Object.values(TimeWasting).map((v) => <option key={v} value={v} className="bg-card">{v}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-gold/20 bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="stat-label">Live Team Instruction</span>
              <Sparkles size={13} className="text-gold" />
            </div>
            <textarea
              value={tactics.teamInstructions ?? ""}
              onChange={(event) => set("teamInstructions", event.target.value)}
              placeholder="Tell the whole team what to change right now…"
              rows={2}
              maxLength={600}
              className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-navy p-2 text-[10px] leading-relaxed outline-none focus:border-gold"
            />
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                disabled={!tactics.teamInstructions?.trim() || interpreting || interpretingKey !== null}
                onClick={() => void interpretNow({ key: "team", text: tactics.teamInstructions ?? "", scope: "team" }, "team")}
                className="flex items-center gap-1 rounded-lg border border-gold/30 bg-gold/10 px-2 py-1 text-[8px] font-bold text-gold disabled:opacity-35"
              >
                {interpretingKey === "team" ? <LoaderCircle size={10} className="animate-spin" /> : <Sparkles size={10} />}
                Understand now
              </button>
            </div>
            <InstructionInterpretationView
              text={tactics.teamInstructions ?? ""}
              interpretation={teamInterpretation}
              stale={Boolean(tactics.teamInstructions?.trim() && teamCached && !teamInterpretation)}
              compact
            />
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="stat-label">Live Individual Instruction</span>
              <span className="text-[9px] text-gold/70">AI semantic plan</span>
            </div>
            <select value={instructionPlayerId} onChange={(e) => setInstructionPlayerId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-navy px-2 py-2 text-[10px]">
              {instructionPlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  #{currentLineup.find((line) => line.playerId === p.id)?.shirtNumber ?? p.shirtNumber} {p.firstName} {p.lastName} · {p.primaryPosition}
                </option>
              ))}
            </select>
            <textarea value={selectedInstructionText}
              onChange={(e) => onInstructionText((v) => ({ ...v, [instructionPlayerId]: e.target.value }))}
              placeholder="Tell this player what you mean in any wording…" rows={2} maxLength={600}
              className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-navy p-2 text-[10px] leading-relaxed outline-none focus:border-gold" />
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                disabled={!selectedInstructionText.trim() || interpreting || interpretingKey !== null}
                onClick={() => void interpretNow({
                  key: `player:${instructionPlayerId}`,
                  text: selectedInstructionText,
                  scope: "player",
                  subjectPlayerId: instructionPlayerId,
                }, instructionPlayerId)}
                className="flex items-center gap-1 rounded-lg border border-gold/30 bg-gold/10 px-2 py-1 text-[8px] font-bold text-gold disabled:opacity-35"
              >
                {interpretingKey === instructionPlayerId ? <LoaderCircle size={10} className="animate-spin" /> : <Sparkles size={10} />}
                Understand now
              </button>
            </div>
            <InstructionInterpretationView
              text={selectedInstructionText}
              interpretation={selectedInterpretation}
              stale={Boolean(selectedInstructionText.trim() && selectedCached && !selectedInterpretation)}
              compact
            />
            <p className="mt-2 text-[9px] text-white/30">Live edits last for this match. Use the Tactics page to save them permanently.</p>
          </div>

          {(localWarning || interpretWarning) && (
            <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-[9px] leading-relaxed text-amber-200">
              Cloud AI unavailable: {localWarning ?? interpretWarning}. A visibly marked basic fallback was used.
            </div>
          )}

          <div className="mt-4 rounded-xl border border-white/10 bg-card p-3">
            <div className="flex items-center justify-between"><span className="stat-label">Substitution</span><span className="text-[9px] text-white/30">up to 5</span></div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select value={pendingSub.off} onChange={(e) => onPendingSub((v) => ({ ...v, off: Number(e.target.value), dirty: true }))} className="rounded-lg border border-white/10 bg-navy px-2 py-2 text-[10px]">
                {currentLineup.map((p, i) => <option key={p.playerId} value={i}>Off · #{p.shirtNumber} {p.name} ({p.rating})</option>)}
              </select>
              <select value={selectedBenchIdx} onChange={(e) => onPendingSub((v) => ({ ...v, on: Number(e.target.value), dirty: true }))} className="rounded-lg border border-white/10 bg-navy px-2 py-2 text-[10px]">
                {availableBench.map(({ p, i }) => <option key={p.id} value={i}>On · #{p.shirtNumber} {p.lastName}</option>)}
              </select>
            </div>
            <button onClick={() => onSub(pendingSub.off, selectedBenchIdx)} disabled={!availableBench.length || !currentLineup.length}
              className="mt-2 w-full rounded-lg border border-white/10 py-2 text-[10px] font-bold text-white/70 disabled:opacity-30">
              {atHalfTime ? "Make substitution now" : "Make substitution"}
            </button>
          </div>
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-white/10 bg-panel p-3">
          <button onClick={onClose} className="btn-dark flex-1 py-2 text-xs">Cancel</button>
          <button
            disabled={interpreting || interpretingKey !== null}
            onClick={onApply}
            className="btn-gold flex flex-1 items-center justify-center gap-2 py-2 text-xs disabled:opacity-60"
          >
            {interpreting
              ? <><LoaderCircle size={15} className="animate-spin" /> Understanding…</>
              : <><Check size={15} /> Apply &amp; {atHalfTime ? "Return" : "Resume"}</>}
          </button>
        </footer>
      </section>
    </div>
  );
}

function MatchToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={`rounded-lg border p-2 text-left transition ${on ? "border-gold/50 bg-gold/10 text-gold" : "border-white/10 bg-card text-white/45"}`}>
      <span className="block text-[9px] uppercase tracking-wide">{label}</span>
      <span className="mt-1 block text-[10px] font-bold">{on ? "ON" : "OFF"}</span>
    </button>
  );
}

function prettyPlayStyle(style: PlayStyle): string {
  return style.replace(/([a-z])([A-Z])/g, "$1 $2").replace(" Style", "");
}

function poisson(lambda: number, rng: SeededRNG): number {
  const L = Math.exp(-Math.max(0.05, Math.min(12, lambda)));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > L && k < 30);
  return k - 1;
}

function formatClock(gameTime: number, added: number): string {
  const min = Math.floor(gameTime / 60);
  if (min >= 90) {
    if (added > 0) {
      const extra = Math.min(min - 90, Math.max(1, Math.ceil(added / 60)));
      return `90+${extra}'`;
    }
    return "90'";
  }
  return `${min}'`;
}

function LineupCol({
  entries, color, align = "left",
}: {
  entries: { playerId: string; shirtNumber: number; name: string; position: string; rating: number; goals: number; yellow: boolean; sentOff: boolean }[];
  color: string;
  align?: "left" | "right";
}) {
  return (
    <ul className={`space-y-0.5 ${align === "right" ? "text-right" : ""}`}>
      {entries.map((e) => (
        <li key={e.playerId} className="flex items-center gap-1 text-white/70"
            style={{ flexDirection: align === "right" ? "row-reverse" : "row" }}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
          <span className="font-bold text-white/90">{e.shirtNumber}</span>
          <span className="truncate">{e.name}</span>
          {e.goals > 0 && <span className="text-gold">⚽{e.goals}</span>}
          {e.yellow && <span className="text-yellow-400">▮</span>}
          {e.sentOff && <span className="text-red-500">■</span>}
          <span className="w-6 shrink-0 text-gold/90">{e.rating.toFixed(1)}</span>
        </li>
      ))}
    </ul>
  );
}

function StatsBlock({ stats, home, away }: { stats: MatchStats; home: string; away: string }) {
  const rows: [string, number, number][] = [
    ["Possession %", stats.possessionHome, stats.possessionAway],
    ["Shots", stats.shotsHome, stats.shotsAway],
    ["On target", stats.shotsOnTargetHome, stats.shotsOnTargetAway],
    ["Passes", stats.passesAttemptedHome, stats.passesAttemptedAway],
    ["Pass acc %",
      stats.passesAttemptedHome ? Math.round((stats.passesCompletedHome / stats.passesAttemptedHome) * 100) : 0,
      stats.passesAttemptedAway ? Math.round((stats.passesCompletedAway / stats.passesAttemptedAway) * 100) : 0],
    ["Tackles", stats.tacklesHome, stats.tacklesAway],
    ["Fouls", stats.foulsHome, stats.foulsAway],
    ["Corners", stats.cornersHome, stats.cornersAway],
  ];
  return (
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-[10px] font-bold text-white/60">
        <span>{home}</span>
        <span>{away}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(([label, h, a]) => (
          <div key={label}>
            <div className="flex justify-between text-[11px] text-white/70">
              <span className="font-semibold">{h}</span>
              <span className="text-white/45">{label}</span>
              <span className="font-semibold">{a}</span>
            </div>
            <div className="mt-0.5 flex h-1 overflow-hidden rounded-full bg-white/10">
              <div className="bg-gold" style={{ width: `${pct(h, a)}%` }} />
              <div className="flex-1 bg-white/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsOverlay({
  stats, onClose, home, away,
}: { stats: MatchStats; onClose: () => void; home: string; away: string }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-navy p-5 border border-white/15" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-center font-bold text-gold">Match Stats</h3>
        <StatsBlock stats={stats} home={home} away={away} />
        <button className="btn-dark mt-4 w-full text-xs" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function RatingsStrip({
  home, away,
}: {
  home: { playerId: string; name: string; rating: number; goals: number }[];
  away: { playerId: string; name: string; rating: number; goals: number }[];
}) {
  const best = (list: typeof home) =>
    [...list].sort((a, b) => b.rating - a.rating).slice(0, 3);
  return (
    <div className="grid grid-cols-2 gap-2 text-[10px]">
      {[best(home), best(away)].map((list, idx) => (
        <div key={idx} className="rounded-lg bg-card p-2">
          <div className="stat-label mb-1">{idx === 0 ? "Home stars" : "Away stars"}</div>
          {list.map((p) => (
            <div key={p.playerId} className="flex justify-between text-white/70">
              <span className="truncate">{p.name}</span>
              <span className="font-bold text-gold">{p.rating.toFixed(1)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function pct(h: number, a: number): number {
  const t = h + a;
  return t === 0 ? 50 : Math.round((h / t) * 100);
}
