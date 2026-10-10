"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, ArrowRight, BrainCircuit, ChartNoAxesCombined, ShieldAlert,
  Sparkles, Swords, UserRoundCog,
} from "lucide-react";
import { buildOppositionReport } from "@/engine/oppositionAnalysis";
import { emptyOpponentMatchPlan } from "@/engine/matchPlan";
import OpponentPlanEditor from "@/components/OpponentPlanEditor";
import { getMatchContext, useGameStore } from "@/store/gameStore";
import type { OpponentMatchPlan } from "@/types";

export default function OppositionPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-navy text-white/60">Building scouting report…</div>}>
      <OppositionScreen />
    </Suspense>
  );
}

function OppositionScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const fixtureId = params.get("fixture") ?? "";
  const save = useGameStore((state) => state.save);
  const queue = useGameStore((state) => state.weekQueue);
  const advanceWeek = useGameStore((state) => state.advanceWeek);
  const updateOpponentPlan = useGameStore((state) => state.updateOpponentPlan);
  const [starting, setStarting] = useState(false);

  const context = useMemo(
    () => (save && fixtureId ? getMatchContext(save, fixtureId) : null),
    [save, fixtureId],
  );
  const [plan, setPlan] = useState<OpponentMatchPlan>(() => {
    const initialTeam = context ? (context.home.isUserTeam ? context.home : context.away) : null;
    return initialTeam?.opponentPlan ?? emptyOpponentMatchPlan(fixtureId);
  });
  const opponentTeam = context
    ? context.home.isUserTeam ? context.away : context.home
    : null;
  const userTeam = context
    ? context.home.isUserTeam ? context.home : context.away
    : null;
  const report = useMemo(
    () => save && context && opponentTeam
      ? buildOppositionReport(save, context.fixture, opponentTeam)
      : null,
    [save, context, opponentTeam],
  );

  useEffect(() => {
    if (!context || !userTeam) return;
    setPlan(userTeam.opponentPlan ?? emptyOpponentMatchPlan(context.fixture.id));
  }, [context, userTeam]);

  if (!save || !context || !opponentTeam || !userTeam || !report) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 bg-navy px-6 text-center">
        <p className="text-sm text-white/60">This opposition report is unavailable.</p>
        <button className="btn-gold" onClick={() => router.replace("/hub")}>Back to Hub</button>
      </main>
    );
  }

  const alreadyQueued = queue.some((fixture) => fixture.id === fixtureId);
  const ownPlanPlayers = [
    ...userTeam.starters.map((player, index) => ({
      player,
      role: userTeam.roles[index],
      shirtNumber: userTeam.displayNumbers[index],
    })),
    ...userTeam.bench.map((player) => ({ player, role: player.primaryPosition, shirtNumber: player.shirtNumber })),
  ];
  const opponentPlanPlayers = [
    ...opponentTeam.starters.map((player, index) => ({
      player,
      role: opponentTeam.roles[index],
      shirtNumber: opponentTeam.displayNumbers[index],
    })),
    ...opponentTeam.bench.map((player) => ({ player, role: player.primaryPosition, shirtNumber: player.shirtNumber })),
  ];
  const changePlan = (next: OpponentMatchPlan) => {
    setPlan(next);
    void updateOpponentPlan(context.fixture.id, next);
  };
  const enterMatch = async () => {
    setStarting(true);
    // Flush the final draft before the worker context is built, even if the
    // manager changed a control and immediately tapped Enter Match.
    await updateOpponentPlan(context.fixture.id, plan);
    if (alreadyQueued) {
      router.push(`/match?fixture=${fixtureId}`);
      return;
    }
    const result = advanceWeek();
    if (result.type === "match") {
      if (result.fixtureId === fixtureId) router.push(`/match?fixture=${fixtureId}`);
      else router.replace(`/opposition?fixture=${result.fixtureId}`);
    } else {
      setStarting(false);
      router.replace("/hub");
    }
  };

  return (
    <main className="flex h-full flex-col overflow-hidden bg-navy">
      <header className="shrink-0 border-b border-white/10 bg-panel px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/hub")} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Opposition Intelligence</div>
            <h1 className="truncate text-lg font-black">{report.opponentName}</h1>
          </div>
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10px] font-bold text-gold">
            {report.venue} · Week {context.fixture.week}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-3 rounded-lg bg-navy/80 px-3 py-2 text-xs">
          <span className="font-semibold">{context.home.name}</span>
          <span className="font-black text-gold">VS</span>
          <span className="font-semibold">{context.away.name}</span>
          <span className="text-white/35">· {context.competitionLabel}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-28">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="card-panel border-gold/25">
            <div className="flex items-center gap-2 text-gold">
              <UserRoundCog size={17} />
              <span className="stat-label text-gold">Head Coach</span>
            </div>
            <div className="mt-2 text-base font-black">{report.coach.name}</div>
            <div className="text-xs text-white/50">{report.coach.nationality} · {report.coach.personality}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <MiniStat label="Reputation" value={`${report.coach.reputation}/100`} />
              <MiniStat label="Flexibility" value={`${report.coach.tacticalFlexibility}/20`} />
            </div>
            <p className="mt-3 rounded-lg bg-navy/60 p-2 text-[11px] leading-relaxed text-white/65">
              {report.coach.adaptability}
            </p>
          </div>

          <div className="card-panel">
            <div className="flex items-center gap-2 text-gold">
              <ChartNoAxesCombined size={17} />
              <span className="stat-label text-gold">Season Snapshot</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              <MiniStat label="P" value={String(report.seasonRecord.played)} />
              <MiniStat label="W" value={String(report.seasonRecord.won)} />
              <MiniStat label="D" value={String(report.seasonRecord.drawn)} />
              <MiniStat label="L" value={String(report.seasonRecord.lost)} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <MiniStat label="GF" value={String(report.seasonRecord.goalsFor)} />
              <MiniStat label="GA" value={String(report.seasonRecord.goalsAgainst)} />
              <MiniStat label="CS" value={String(report.seasonRecord.cleanSheets)} />
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="mr-1 text-[10px] uppercase text-white/35">Last 5</span>
              {report.recentForm.length ? report.recentForm.map((match) => (
                <span
                  key={match.fixtureId}
                  title={`${match.opponent} ${match.score}`}
                  className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-black ${
                    match.result === "W" ? "bg-green-500/20 text-green-400" :
                    match.result === "L" ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/70"
                  }`}
                >
                  {match.result}
                </span>
              )) : <span className="text-[11px] text-white/40">No matches played</span>}
            </div>
          </div>
        </section>

        <section className="card-panel mt-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="stat-label text-gold">Expected Plan</div>
              <div className="mt-1 text-xl font-black">{report.expectedFormation}</div>
            </div>
            <div className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-right">
              <div className="text-[9px] uppercase text-white/40">Identity</div>
              <div className="text-xs font-bold text-gold">{humanize(report.playStyle)}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {report.tacticalDetails.slice(2).map((detail) => (
              <div key={detail.label} className="rounded-lg bg-navy/60 px-2.5 py-2">
                <div className="text-[9px] uppercase tracking-wide text-white/35">{detail.label}</div>
                <div className="mt-0.5 text-xs font-semibold">{detail.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReportList title="Strengths" icon={<Sparkles size={15} />} items={report.strengths} tone="good" />
          <ReportList title="Weaknesses" icon={<ShieldAlert size={15} />} items={report.weaknesses} tone="warn" />
        </section>

        <div className="mt-3">
          <OpponentPlanEditor
            plan={plan}
            ownPlayers={ownPlanPlayers}
            opponents={opponentPlanPlayers}
            onChange={changePlan}
            disabled={context.fixture.played}
          />
          {!context.fixture.played && (
            <p className="mt-1.5 text-right text-[9px] font-semibold text-green-400/70">Saved automatically for this fixture</p>
          )}
        </div>

        <section className="card-panel mt-3">
          <div className="flex items-center gap-2 text-gold">
            <Swords size={16} />
            <span className="stat-label text-gold">Likely Threats</span>
          </div>
          <div className="mt-2 space-y-2">
            {report.likelyThreats.map((threat) => (
              <div key={threat} className="flex gap-2 rounded-lg bg-navy/60 p-2 text-xs text-white/70">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                <span>{threat}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <BrainCircuit size={16} className="text-gold" />
            <h2 className="stat-label text-gold">Danger Players</h2>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {report.dangerousPlayers.map((player, index) => (
              <div key={player.playerId} className="card-panel relative overflow-hidden">
                <span className="absolute right-2 top-2 text-3xl font-black text-white/[0.04]">#{index + 1}</span>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 text-xs font-black" style={{ backgroundColor: report.primaryColor }}>
                    {player.shirtNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{player.name}</div>
                    <div className="text-[10px] text-white/45">{player.likelyRole} · {player.form}</div>
                  </div>
                  <div className="rounded bg-gold/10 px-1.5 py-1 text-xs font-black text-gold">
                    {player.lastRating > 0 ? player.lastRating.toFixed(1) : "—"}
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-white/65">{player.threatLabel}</p>
                <div className="mt-2 flex gap-3 text-[10px] text-white/50">
                  <span>{player.appearances} apps</span><span>{player.goals} goals</span><span>{player.assists} assists</span>
                  {player.previousMeetings > 0 && <span className="text-gold">Seen {player.previousMeetings}×</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {player.keyAttributes.map((attribute) => (
                    <span key={attribute.label} className="rounded bg-white/[0.06] px-1.5 py-1 text-[9px] text-white/60">
                      {attribute.label} <b className="text-white">{attribute.value}</b>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card-panel mt-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="stat-label text-gold">Expected XI</h2>
            <span className="text-[10px] text-white/35">Season statistics</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[11px]">
              <thead className="text-[9px] uppercase text-white/35">
                <tr><th className="py-2">Player</th><th>Role</th><th className="text-center">Apps</th><th className="text-center">G</th><th className="text-center">A</th><th className="text-center">Form</th><th>Key qualities</th></tr>
              </thead>
              <tbody>
                {report.expectedXI.map((player) => (
                  <tr key={player.playerId} className="border-t border-white/[0.06]">
                    <td className="py-2 pr-3 font-semibold">{player.name}</td>
                    <td className="pr-3 text-white/55">{player.likelyRole}</td>
                    <td className="text-center tabular-nums">{player.appearances}</td>
                    <td className="text-center tabular-nums">{player.goals}</td>
                    <td className="text-center tabular-nums">{player.assists}</td>
                    <td className="text-center font-bold text-gold">{player.lastRating > 0 ? player.lastRating.toFixed(1) : "—"}</td>
                    <td className="text-white/50">{player.keyAttributes.slice(0, 2).map((attribute) => `${attribute.label} ${attribute.value}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-panel/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-2">
          <button onClick={() => router.push("/tactics")} className="btn-dark flex-1 py-3 text-xs">Adjust Tactics</button>
          <button onClick={enterMatch} disabled={starting || context.fixture.played} className="btn-gold flex flex-[1.4] items-center justify-center gap-2 py-3 text-xs">
            {starting ? "Preparing…" : context.fixture.played ? "Already played" : "Enter Match"} <ArrowRight size={15} />
          </button>
        </div>
      </footer>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-navy/60 px-2 py-2"><div className="text-[9px] uppercase text-white/35">{label}</div><div className="mt-0.5 font-bold tabular-nums">{value}</div></div>;
}

function ReportList({
  title, icon, items, tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: { title: string; detail: string }[];
  tone: "good" | "warn";
}) {
  return (
    <div className="card-panel">
      <div className={`flex items-center gap-2 ${tone === "good" ? "text-green-400" : "text-amber-400"}`}>
        {icon}<span className="stat-label text-current">{title}</span>
      </div>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.title} className="rounded-lg bg-navy/60 p-2">
            <div className="text-xs font-bold">{item.title}</div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-white/50">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/Style$/, "");
}
