"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pause, Play, FastForward, Gauge } from "lucide-react";
import MatchCanvas, { type MatchScene } from "@/components/MatchCanvas";
import { getMatchContext, useGameStore, type MatchContext } from "@/store/gameStore";
import type { MatchSnapshot, Side } from "@/engine/matchSimulator";
import type { MatchEvent, MatchResult, MatchStats } from "@/types";
import { CompetitionType, MatchEventType } from "@/types";
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
    (save?.settings.defaultMatchSpeed as 1 | 2 | 4 | 8) ?? 4,
  );
  const speedRef = useRef<1 | 2 | 4 | 8>(speed);
  speedRef.current = speed;
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [pendingSub, setPendingSub] = useState<{ off: number; on: number; dirty: boolean }>({ off: 0, on: 0, dirty: false });
  // knockout drama
  const [etGoals, setEtGoals] = useState<{ h: number; a: number } | null>(null);
  const [pens, setPens] = useState<{ home: number; away: number } | null>(null);
  const [showStats, setShowStats] = useState(false);

  const isKnockout = ctx?.fixture.competitionType !== CompetitionType.League;

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

  const resumeSecondHalf = () => {
    setHalfTime(false);
    setPaused(false);
    post({ type: "resumeHalf" });
    post({ type: "speed", value: speed });
    if (pendingSub.dirty && ctx) {
      const userSide: Side = ctx.home.isUserTeam ? "home" : "away";
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

      {/* pitch */}
      <div className="relative flex-shrink px-2 py-2">
        <MatchCanvas
          sceneRef={sceneRef}
          homeColor={homeClub.primaryColor}
          awayColor={awayClub.primaryColor}
          homeNumbers={ctx.home.starters.map((p) => p.shirtNumber)}
          awayNumbers={ctx.away.starters.map((p) => p.shirtNumber)}
        />
        {paused && !halfTime && !fullTime && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-black/70 px-4 py-2 text-sm font-bold">PAUSED</span>
          </div>
        )}
      </div>

      {/* controls + events */}
      <div className="flex flex-1 min-h-0 flex-col gap-2 px-3 pb-1 sm:flex-row">
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-card/70 p-2">
          <div className="stat-label mb-1">Commentary</div>
          <ul className="space-y-1">
            {[...events]
              .slice(-6)
              .reverse()
              .map((e, i) => (
                <li key={`${e.minute}-${i}-${e.text}`} className="text-[11px] leading-snug text-white/75">
                  <span className="font-bold text-gold">{e.minute}&apos;</span> {e.text}
                </li>
              ))}
            {events.length === 0 && <li className="text-[11px] text-white/40">Kick off pending…</li>}
          </ul>
        </div>

        <div className="flex flex-row items-center justify-center gap-2 sm:flex-col sm:justify-start">
          <button
            onClick={togglePause}
            disabled={halfTime || fullTime}
            className="btn-dark flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-30"
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <div className="flex gap-1.5">
            {([1, 2, 4, 8] as const).map((s) => (
              <button
                key={s}
                onClick={() => changeSpeed(s)}
                className={`rounded-lg px-2.5 py-2 text-xs font-bold transition ${
                  speed === s ? "bg-gold text-navy" : "bg-card text-white/60 border border-white/10"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
          <button
            onClick={skip}
            disabled={halfTime || fullTime}
            className="btn-dark flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-30"
            title="Skip to half / full time"
          >
            <FastForward size={14} /> Skip
          </button>
          <button
            onClick={() => setShowStats((v) => !v)}
            className="btn-dark flex items-center gap-1.5 px-3 py-2 text-xs"
          >
            <Gauge size={14} /> Stats
          </button>
        </div>
      </div>

      {/* lineups */}
      <div className="grid max-h-24 grid-cols-2 gap-2 overflow-y-auto px-3 pb-2 text-[10px]">
        <LineupCol entries={snapshot?.homeLineup ?? []} color={homeClub.primaryColor} />
        <LineupCol entries={snapshot?.awayLineup ?? []} color={awayClub.primaryColor} align="right" />
      </div>

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
                  {(ctx.home.isUserTeam ? ctx.home.starters : ctx.away.starters).map((p, i) => (
                    <option key={p.id} value={i}>#{p.shirtNumber} {p.lastName} (off)</option>
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

            <button onClick={resumeSecondHalf} className="btn-gold mt-4 w-full">
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
