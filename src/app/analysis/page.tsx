"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarDays, ChevronRight, Footprints, Target, Users } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import PlayerHeatmap from "@/components/PlayerHeatmap";
import { summarizeOpponentInstruction } from "@/engine/matchPlan";
import { useGameStore } from "@/store/gameStore";
import {
  MATCH_HEATMAP_COLUMNS,
  MATCH_HEATMAP_ROWS,
  type GameSave,
  type MatchResult,
  type MatchStats,
  type PlayerMatchAnalysis,
} from "@/types";

type ViewMode = "matches" | "players";
type Side = "home" | "away";

interface Appearance {
  result: MatchResult;
  report: PlayerMatchAnalysis;
}

const SUM_FIELDS: (keyof PlayerMatchAnalysis)[] = [
  "minutesPlayed", "touches", "carries", "passesAttempted", "passesCompleted", "passesFailed",
  "keyPasses", "throughBalls", "crossesAttempted", "crossesCompleted", "shots", "shotsOnTarget",
  "goals", "assists", "dribblesAttempted", "dribblesCompleted", "possessionLost", "tacklesAttempted",
  "tacklesWon", "interceptions", "recoveries", "clearances", "blocks", "aerialDuels", "aerialDuelsWon",
  "foulsCommitted", "foulsWon", "offsides", "saves", "yellowCards", "redCards", "distanceCoveredKm", "sprints",
];

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-navy text-white/60">Loading reports…</div>}>
      <AnalysisScreen />
    </Suspense>
  );
}

function AnalysisScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedMatch = params.get("match") ?? "";
  const save = useGameStore((state) => state.save);
  const results = useMemo(
    () => save
      ? Object.values(save.results ?? {}).sort((a, b) =>
          (b.seasonYear ?? 0) - (a.seasonYear ?? 0) || (b.week ?? 0) - (a.week ?? 0) || b.fixtureId.localeCompare(a.fixtureId),
        )
      : [],
    [save],
  );
  const [mode, setMode] = useState<ViewMode>("matches");
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [side, setSide] = useState<Side>("home");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [careerPlayerId, setCareerPlayerId] = useState("");

  useEffect(() => {
    if (!results.length) return;
    const target = results.some((result) => result.fixtureId === requestedMatch)
      ? requestedMatch
      : results[0].fixtureId;
    setSelectedMatchId((current) => current || target);
  }, [results, requestedMatch]);

  const selected = results.find((result) => result.fixtureId === selectedMatchId) ?? results[0];
  const teamPlayers = useMemo(() => {
    if (!selected?.analysis) return [];
    return Object.values(selected.analysis.players)
      .filter((player) => player.side === side)
      .sort((a, b) => Number(b.started) - Number(a.started) || a.minuteOn - b.minuteOn || a.shirtNumber - b.shirtNumber);
  }, [selected, side]);

  useEffect(() => {
    if (!teamPlayers.length) {
      setSelectedPlayerId("");
      return;
    }
    if (!teamPlayers.some((player) => player.playerId === selectedPlayerId)) {
      setSelectedPlayerId(teamPlayers[0].playerId);
    }
  }, [teamPlayers, selectedPlayerId]);

  const playerArchive = useMemo(() => {
    const map = new Map<string, Appearance[]>();
    for (const result of results) {
      for (const report of Object.values(result.analysis?.players ?? {})) {
        const appearances = map.get(report.playerId) ?? [];
        appearances.push({ result, report });
        map.set(report.playerId, appearances);
      }
    }
    return [...map.entries()]
      .map(([playerId, appearances]) => ({
        playerId,
        name: appearances[0]?.report.playerName ?? playerId,
        appearances,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [results]);

  useEffect(() => {
    if (playerArchive.length && !playerArchive.some((player) => player.playerId === careerPlayerId)) {
      setCareerPlayerId(playerArchive[0].playerId);
    }
  }, [playerArchive, careerPlayerId]);

  if (!save) {
    return <main className="flex h-full items-center justify-center bg-navy text-white/60">No active career.</main>;
  }

  const chooseMatch = (fixtureId: string, nextSide?: Side, playerId?: string) => {
    setSelectedMatchId(fixtureId);
    if (nextSide) setSide(nextSide);
    if (playerId) setSelectedPlayerId(playerId);
    setMode("matches");
    router.replace(`/analysis?match=${fixtureId}`, { scroll: false });
  };

  return (
    <main className="flex h-full flex-col overflow-hidden bg-navy">
      <header className="shrink-0 border-b border-white/10 bg-panel px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/hub")} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Back to Hub">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Permanent Career Archive</div>
            <h1 className="text-lg font-black">Match Analysis</h1>
          </div>
          <span className="rounded-full bg-gold/10 px-2.5 py-1 text-[10px] font-bold text-gold">{results.length} reports</span>
        </div>
        <div className="mt-3 grid grid-cols-2 rounded-lg bg-navy p-1">
          <button onClick={() => setMode("matches")} className={`rounded-md py-2 text-xs font-bold ${mode === "matches" ? "bg-gold text-navy" : "text-white/55"}`}>
            Matches
          </button>
          <button onClick={() => setMode("players")} className={`rounded-md py-2 text-xs font-bold ${mode === "players" ? "bg-gold text-navy" : "text-white/55"}`}>
            Player Archive
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {!results.length ? (
          <div className="card-panel py-12 text-center">
            <BarChart3 className="mx-auto text-white/20" size={40} />
            <h2 className="mt-3 font-bold">No completed matches yet</h2>
            <p className="mt-1 text-xs text-white/45">Every user match will be stored here with player actions and heatmaps.</p>
          </div>
        ) : mode === "matches" && selected ? (
          <MatchView
            save={save}
            results={results}
            selected={selected}
            side={side}
            onSide={setSide}
            selectedPlayerId={selectedPlayerId}
            onPlayer={setSelectedPlayerId}
            onMatch={chooseMatch}
          />
        ) : (
          <PlayerArchiveView
            players={playerArchive}
            playerId={careerPlayerId}
            onPlayer={setCareerPlayerId}
            onOpenMatch={chooseMatch}
          />
        )}
      </div>
      <BottomNav />
    </main>
  );
}

function MatchView({
  save,
  results,
  selected,
  side,
  onSide,
  selectedPlayerId,
  onPlayer,
  onMatch,
}: {
  save: GameSave;
  results: MatchResult[];
  selected: MatchResult;
  side: Side;
  onSide: (side: Side) => void;
  selectedPlayerId: string;
  onPlayer: (playerId: string) => void;
  onMatch: (fixtureId: string, side?: Side, playerId?: string) => void;
}) {
  const homeName = selected.homeClubName ?? save.world.clubs[selected.homeClubId]?.name ?? selected.homeClubId;
  const awayName = selected.awayClubName ?? save.world.clubs[selected.awayClubId]?.name ?? selected.awayClubId;
  const reports = Object.values(selected.analysis?.players ?? {})
    .filter((player) => player.side === side)
    .sort((a, b) => Number(b.started) - Number(a.started) || a.minuteOn - b.minuteOn || a.shirtNumber - b.shirtNumber);
  const player = reports.find((report) => report.playerId === selectedPlayerId) ?? reports[0];

  return (
    <>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="stat-label">Match timeline</span>
          <span className="text-[10px] text-white/35">Newest first</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {results.map((result) => (
            <button
              key={result.fixtureId}
              onClick={() => onMatch(result.fixtureId)}
              className={`min-w-[148px] rounded-xl border p-2.5 text-left ${
                result.fixtureId === selected.fixtureId ? "border-gold bg-gold/10" : "border-white/10 bg-card"
              }`}
            >
              <div className="truncate text-[9px] uppercase text-white/40">{result.competitionLabel ?? "Match"} · W{result.week ?? "—"}</div>
              <div className="mt-1 truncate text-xs font-bold">{shortName(result.homeClubName ?? result.homeClubId)} {result.homeGoals}-{result.awayGoals} {shortName(result.awayClubName ?? result.awayClubId)}</div>
              <div className="mt-1 text-[9px] text-white/35">Season {result.seasonYear ?? "archive"}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="card-panel mt-2 border-gold/25">
        <div className="text-center text-[10px] uppercase tracking-widest text-gold">{selected.competitionLabel ?? "Completed match"}</div>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamName name={homeName} align="right" />
          <div className="rounded-xl bg-navy px-4 py-2 text-2xl font-black tabular-nums">{selected.homeGoals} - {selected.awayGoals}</div>
          <TeamName name={awayName} align="left" />
        </div>
        {(selected.homePens !== undefined || selected.awayPens !== undefined) && (
          <div className="mt-1 text-center text-[10px] text-white/45">Penalties {selected.homePens ?? 0}-{selected.awayPens ?? 0}</div>
        )}
        <div className="mt-3"><TeamComparison stats={selected.stats} home={shortName(homeName)} away={shortName(awayName)} /></div>
      </section>

      {!selected.analysis ? (
        <section className="card-panel mt-3 border-amber-400/25 text-center">
          <h2 className="text-sm font-bold text-amber-300">Legacy summary report</h2>
          <p className="mt-2 text-xs leading-relaxed text-white/50">
            This match was recorded before detailed player telemetry was introduced. Its score, team statistics, ratings and events remain available.
          </p>
          <div className="mt-3 max-h-52 space-y-1 overflow-y-auto text-left">
            {selected.events.map((event, index) => <div key={`${event.minute}-${index}`} className="rounded bg-navy/60 px-2 py-1.5 text-[10px] text-white/60">{event.minute}&apos; {event.text}</div>)}
          </div>
        </section>
      ) : (
        <>
          <section className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-card p-1">
            <button onClick={() => onSide("home")} className={`rounded-lg px-2 py-2.5 text-xs font-bold ${side === "home" ? "bg-gold text-navy" : "text-white/55"}`}>{shortName(homeName)}</button>
            <button onClick={() => onSide("away")} className={`rounded-lg px-2 py-2.5 text-xs font-bold ${side === "away" ? "bg-gold text-navy" : "text-white/55"}`}>{shortName(awayName)}</button>
          </section>

          <OpponentPlanReview
            result={selected}
            side={side}
            teamName={side === "home" ? homeName : awayName}
            opponentName={side === "home" ? awayName : homeName}
          />

          <section className="card-panel mt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="stat-label text-gold">Player Reports</span>
              <span className="text-[9px] text-white/35">Tap a player for every action</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {reports.map((report) => (
                <button
                  key={report.playerId}
                  onClick={() => onPlayer(report.playerId)}
                  className={`grid grid-cols-[30px_1fr_auto] items-center gap-2 rounded-lg border px-2 py-2 text-left ${
                    player?.playerId === report.playerId ? "border-gold bg-gold/10" : "border-white/[0.07] bg-navy/60"
                  }`}
                >
                  <span className="text-center text-xs font-black text-white/45">{report.shirtNumber}</span>
                  <span className="min-w-0"><span className="block truncate text-xs font-semibold">{report.playerName}</span><span className="block text-[9px] text-white/40">{report.position} · {report.minutesPlayed}&apos;</span></span>
                  <span className="rounded bg-white/[0.07] px-1.5 py-1 text-xs font-black text-gold">{report.rating.toFixed(1)}</span>
                </button>
              ))}
            </div>
          </section>

          {player && <PlayerDetail player={player} />}

          <section className="card-panel mt-3">
            <div className="stat-label text-gold">Tactical Timeline</div>
            <div className="mt-2 space-y-2">
              {selected.analysis.tacticalChanges.length ? selected.analysis.tacticalChanges.map((change, index) => (
                <div key={`${change.minute}-${index}`} className="rounded-lg bg-navy/60 p-2.5">
                  <div className="flex items-center justify-between text-[10px]"><b className={change.side === "home" ? "text-blue-300" : "text-red-300"}>{change.minute}&apos; · {change.source === "ai" ? "Opposition coach" : "Your bench"}</b><span className="text-white/35">{change.formationBefore} → {change.formationAfter}</span></div>
                  <div className="mt-1 text-xs font-semibold">{change.reason}</div>
                  <div className="mt-1 text-[9px] text-white/45">{change.changes.join(" · ")}</div>
                </div>
              )) : <p className="text-xs text-white/40">No tactical or personnel changes were recorded.</p>}
            </div>
          </section>

          <section className="card-panel mt-3">
            <div className="mb-2 flex items-center justify-between"><span className="stat-label text-gold">Match Timeline</span><span className="text-[9px] text-white/35">Goals, cards, chances & restarts</span></div>
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {selected.events.map((event, index) => (
                <div key={`${event.minute}-${index}`} className="grid grid-cols-[34px_1fr] gap-2 rounded-lg bg-navy/60 px-2.5 py-2 text-[10px]">
                  <b className="text-right tabular-nums text-gold">{event.minute}&apos;</b><span className="text-white/65">{event.text}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function OpponentPlanReview({
  result,
  side,
  teamName,
  opponentName,
}: {
  result: MatchResult;
  side: Side;
  teamName: string;
  opponentName: string;
}) {
  const analysis = result.analysis;
  const plan = analysis?.opponentPlans?.[side];
  const versions = analysis?.opponentPlanChanges?.filter((change) => change.side === side) ?? [];
  if (!analysis || !plan) return null;
  const usedByTarget = new Map<string, (typeof plan.instructions)[number]>();
  for (const version of versions) {
    for (const instruction of version.plan.instructions) usedByTarget.set(instruction.targetPlayerId, instruction);
  }
  for (const instruction of plan.instructions) usedByTarget.set(instruction.targetPlayerId, instruction);
  const usedInstructions = [...usedByTarget.values()];
  return (
    <section className="card-panel mt-3 border-gold/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-gold"><Target size={15} /><span className="stat-label text-gold">Opponent Plan Review</span></div>
          <p className="mt-1 text-[10px] text-white/45">{shortName(teamName)} assignments against {shortName(opponentName)} · {plan.source === "ai" ? "AI coach" : "your bench"}</p>
        </div>
        <span className="rounded-full bg-gold/10 px-2 py-1 text-[9px] font-bold text-gold">
          {usedInstructions.length} targets used{versions.length > 1 ? ` · ${versions.length} versions` : ""}
        </span>
      </div>
      {versions.length > 1 && (
        <details className="mt-3 rounded-lg border border-white/10 bg-navy/50 p-2">
          <summary className="cursor-pointer text-[9px] font-bold uppercase tracking-wide text-white/50">Plan changes used during the match</summary>
          <div className="mt-2 space-y-1.5">
            {versions.map((version, index) => (
              <div key={`${version.minute}-${index}`} className="grid grid-cols-[34px_1fr] gap-2 text-[9px]">
                <b className="text-right text-gold">{version.minute}&apos;</b>
                <span className="text-white/50">
                  {version.plan.instructions.length
                    ? version.plan.instructions.map((instruction) => `${instruction.targetPlayerName}: ${summarizeOpponentInstruction(instruction).join(", ")}`).join(" · ")
                    : "No opponent-specific assignments"}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="mt-3 space-y-2">
        {usedInstructions.length ? usedInstructions.map((instruction) => {
          const target = analysis.players[instruction.targetPlayerId];
          const marker = instruction.markerPlayerId ? analysis.players[instruction.markerPlayerId] : undefined;
          return (
            <article key={instruction.targetPlayerId} className="rounded-lg bg-navy/60 p-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-black">{instruction.targetPlayerName}</div>
                  <div className="mt-0.5 text-[9px] text-gold/75">{summarizeOpponentInstruction(instruction).join(" · ")}</div>
                </div>
                {target && <span className="rounded bg-white/[0.07] px-1.5 py-1 text-[10px] font-black text-gold">{target.rating.toFixed(1)}</span>}
              </div>
              {target ? (
                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  <PlanOutcome label="Touches" value={target.touches} />
                  <PlanOutcome label="Poss. lost" value={target.possessionLost} />
                  <PlanOutcome label="Passes" value={`${target.passesCompleted}/${target.passesAttempted}`} />
                  <PlanOutcome label="Dribbles" value={`${target.dribblesCompleted}/${target.dribblesAttempted}`} />
                  <PlanOutcome label="Crosses" value={`${target.crossesCompleted}/${target.crossesAttempted}`} />
                  <PlanOutcome label="G + A" value={`${target.goals} + ${target.assists}`} />
                </div>
              ) : <p className="mt-2 text-[9px] text-white/35">The targeted player did not record an appearance.</p>}
              {marker && (
                <p className="mt-2 text-[9px] text-white/45">
                  Marker outcome: <b className="text-white/70">{marker.playerName}</b> · {marker.tacklesWon}/{marker.tacklesAttempted} tackles · {marker.interceptions} interceptions · {marker.foulsCommitted} fouls
                </p>
              )}
            </article>
          );
        }) : (
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[10px] text-white/35">No opponent-specific assignments were used by this side.</p>
        )}
      </div>
    </section>
  );
}

function PlanOutcome({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md bg-card px-1.5 py-1.5 text-center"><div className="text-[11px] font-black tabular-nums">{value}</div><div className="text-[7px] uppercase tracking-wide text-white/35">{label}</div></div>;
}

function PlayerDetail({ player }: { player: PlayerMatchAnalysis }) {
  const metrics = actionMetrics(player);
  return (
    <section className="card-panel mt-3 border-gold/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="stat-label text-gold">Individual Analysis</div>
          <h2 className="mt-1 text-lg font-black">{player.playerName}</h2>
          <p className="text-[10px] text-white/45">{player.position} · {player.started ? "Started" : `On ${player.minuteOn}'`} · {player.minutesPlayed} minutes</p>
        </div>
        <div className="rounded-xl bg-gold/10 px-3 py-2 text-center"><div className="text-[9px] uppercase text-white/35">Rating</div><div className="text-xl font-black text-gold">{player.rating.toFixed(1)}</div></div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1.25fr_1fr]">
        <PlayerHeatmap values={player.heatmap} playerName={player.playerName} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-2">
          <BigMetric label="Touches" value={player.touches} />
          <BigMetric label="Distance" value={`${player.distanceCoveredKm.toFixed(1)} km`} />
          <BigMetric label="Goals" value={player.goals} />
          <BigMetric label="Assists" value={player.assists} />
          <BigMetric label="Poss. lost" value={player.possessionLost} />
          <BigMetric label="Sprints" value={player.sprints} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between border-b border-white/[0.06] py-2 text-[11px]">
            <span className="text-white/45">{metric.label}</span><b className="tabular-nums">{metric.value}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlayerArchiveView({
  players,
  playerId,
  onPlayer,
  onOpenMatch,
}: {
  players: { playerId: string; name: string; appearances: Appearance[] }[];
  playerId: string;
  onPlayer: (id: string) => void;
  onOpenMatch: (fixtureId: string, side?: Side, playerId?: string) => void;
}) {
  const selected = players.find((player) => player.playerId === playerId) ?? players[0];
  if (!selected) return <div className="card-panel text-center text-xs text-white/45">Detailed player appearances will appear after your next match.</div>;
  const aggregate = aggregateReports(selected.appearances.map((appearance) => appearance.report));
  return (
    <>
      <section className="card-panel">
        <div className="flex items-center gap-2 text-gold"><Users size={16} /><span className="stat-label text-gold">Career Match Logs</span></div>
        <select value={selected.playerId} onChange={(event) => onPlayer(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-navy px-3 py-3 text-sm font-bold outline-none focus:border-gold">
          {players.map((player) => <option key={player.playerId} value={player.playerId}>{player.name} · {player.appearances.length} matches</option>)}
        </select>
      </section>

      <section className="card-panel mt-3 border-gold/25">
        <div className="flex items-start justify-between">
          <div><div className="stat-label text-gold">All Recorded Appearances</div><h2 className="mt-1 text-xl font-black">{selected.name}</h2><p className="text-[10px] text-white/45">{selected.appearances.length} detailed match reports retained</p></div>
          <Footprints size={28} className="text-gold/50" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <BigMetric label="Minutes" value={aggregate.minutesPlayed} />
          <BigMetric label="Goals" value={aggregate.goals} />
          <BigMetric label="Assists" value={aggregate.assists} />
          <BigMetric label="Touches" value={aggregate.touches} />
          <BigMetric label="Passes" value={aggregate.passesCompleted} />
          <BigMetric label="Distance" value={`${aggregate.distanceCoveredKm.toFixed(1)} km`} />
        </div>
        <div className="mt-4"><PlayerHeatmap values={aggregate.heatmap} playerName={`${selected.name}, all matches`} /></div>
        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3">
          {actionMetrics(aggregate).map((metric) => <div key={metric.label} className="flex justify-between border-b border-white/[0.06] py-2 text-[11px]"><span className="text-white/45">{metric.label}</span><b>{metric.value}</b></div>)}
        </div>
      </section>

      <section className="card-panel mt-3">
        <div className="mb-2 flex items-center justify-between"><span className="stat-label text-gold">Every Appearance</span><span className="text-[9px] text-white/35">Open full match report</span></div>
        <div className="space-y-2">
          {selected.appearances.map(({ result, report }) => (
            <button key={result.fixtureId} onClick={() => onOpenMatch(result.fixtureId, report.side, report.playerId)} className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-white/[0.07] bg-navy/60 p-2.5 text-left hover:border-gold/40">
              <span className="min-w-0"><span className="block truncate text-xs font-bold">{shortName(result.homeClubName ?? result.homeClubId)} {result.homeGoals}-{result.awayGoals} {shortName(result.awayClubName ?? result.awayClubId)}</span><span className="block truncate text-[9px] text-white/40">{result.competitionLabel ?? "Match"} · Season {result.seasonYear ?? "—"}, week {result.week ?? "—"}</span></span>
              <span className="text-right text-[10px] text-white/50">{report.minutesPlayed}&apos;<br />{report.goals}G {report.assists}A</span>
              <span className="flex items-center gap-1 rounded bg-gold/10 px-2 py-1 text-xs font-black text-gold">{report.rating.toFixed(1)} <ChevronRight size={12} /></span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function aggregateReports(reports: PlayerMatchAnalysis[]): PlayerMatchAnalysis {
  const first = reports[0];
  const aggregate: PlayerMatchAnalysis = {
    ...first,
    started: reports.some((report) => report.started),
    minuteOn: 0,
    minuteOff: 0,
    rating: reports.reduce((sum, report) => sum + report.rating, 0) / Math.max(1, reports.length),
    heatmap: Array(MATCH_HEATMAP_COLUMNS * MATCH_HEATMAP_ROWS).fill(0),
  };
  const numeric = aggregate as unknown as Record<string, number>;
  for (const field of SUM_FIELDS) numeric[field] = 0;
  for (const report of reports) {
    const source = report as unknown as Record<string, number>;
    for (const field of SUM_FIELDS) numeric[field] += source[field] ?? 0;
    report.heatmap.forEach((value, index) => { aggregate.heatmap[index] = (aggregate.heatmap[index] ?? 0) + value; });
  }
  aggregate.rating = Number(aggregate.rating.toFixed(2));
  aggregate.distanceCoveredKm = Number(aggregate.distanceCoveredKm.toFixed(2));
  return aggregate;
}

function actionMetrics(player: PlayerMatchAnalysis): { label: string; value: string | number }[] {
  return [
    { label: "Shots", value: `${player.shotsOnTarget}/${player.shots} on target` },
    { label: "Dribbles", value: `${player.dribblesCompleted}/${player.dribblesAttempted}` },
    { label: "Successful passes", value: player.passesCompleted },
    { label: "Unsuccessful passes", value: player.passesFailed },
    { label: "Pass accuracy", value: player.passesAttempted ? `${Math.round(player.passesCompleted / player.passesAttempted * 100)}%` : "—" },
    { label: "Key passes", value: player.keyPasses },
    { label: "Through balls", value: player.throughBalls },
    { label: "Crosses", value: `${player.crossesCompleted}/${player.crossesAttempted}` },
    { label: "Carries", value: player.carries },
    { label: "Tackles", value: `${player.tacklesWon}/${player.tacklesAttempted}` },
    { label: "Interceptions", value: player.interceptions },
    { label: "Recoveries", value: player.recoveries },
    { label: "Clearances", value: player.clearances },
    { label: "Blocks", value: player.blocks },
    { label: "Aerial duels", value: `${player.aerialDuelsWon}/${player.aerialDuels}` },
    { label: "Fouls / won", value: `${player.foulsCommitted} / ${player.foulsWon}` },
    { label: "Offsides", value: player.offsides },
    { label: "Saves", value: player.saves },
  ];
}

function TeamComparison({ stats, home, away }: { stats: MatchStats; home: string; away: string }) {
  const rows: [string, number | string, number | string][] = [
    ["Possession", `${stats.possessionHome}%`, `${stats.possessionAway}%`],
    ["Shots", stats.shotsHome, stats.shotsAway],
    ["On target", stats.shotsOnTargetHome, stats.shotsOnTargetAway],
    ["Passes", `${stats.passesCompletedHome}/${stats.passesAttemptedHome}`, `${stats.passesCompletedAway}/${stats.passesAttemptedAway}`],
    ["Tackles", stats.tacklesHome, stats.tacklesAway],
    ["Crosses", stats.crossesHome, stats.crossesAway],
    ["Corners", stats.cornersHome, stats.cornersAway],
    ["Fouls", stats.foulsHome, stats.foulsAway],
  ];
  return (
    <div>
      <div className="grid grid-cols-[1fr_1.2fr_1fr] text-[9px] font-bold uppercase text-white/35"><span className="text-right">{home}</span><span /><span>{away}</span></div>
      {rows.map(([label, homeValue, awayValue]) => <div key={label} className="grid grid-cols-[1fr_1.2fr_1fr] border-t border-white/[0.05] py-1.5 text-xs"><b className="text-right tabular-nums">{homeValue}</b><span className="text-center text-[10px] text-white/40">{label}</span><b className="tabular-nums">{awayValue}</b></div>)}
    </div>
  );
}

function BigMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-navy/60 p-2 text-center"><div className="text-sm font-black tabular-nums text-gold">{value}</div><div className="mt-0.5 text-[8px] uppercase tracking-wide text-white/35">{label}</div></div>;
}

function TeamName({ name, align }: { name: string; align: "left" | "right" }) {
  return <div className={`min-w-0 text-sm font-bold ${align === "right" ? "text-right" : "text-left"}`}><span className="line-clamp-2">{name}</span></div>;
}

function shortName(name: string): string {
  const words = name.split(" ");
  return words.length > 2 ? words.slice(0, 2).join(" ") : name;
}
