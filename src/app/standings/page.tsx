"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import { leagueTableOf, useGameStore } from "@/store/gameStore";
import { CUP_ID, CUP_ROUND_NAMES } from "@/engine/cupEngine";
import { CONTINENTAL_ID } from "@/engine/continentalEngine";
import type { Fixture } from "@/types";

export default function StandingsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-navy text-white/60">Loading…</div>}>
      <StandingsScreen />
    </Suspense>
  );
}

type View = "league" | "cup" | "continental" | "fixtures";

function StandingsScreen() {
  const params = useSearchParams();
  const save = useGameStore((s) => s.save);
  const [view, setView] = useState<View>("league");
  const [leagueId, setLeagueId] = useState<string>(params.get("league") ?? "");

  const userLeagueId = save?.world.clubs[save.userClubId]?.leagueId ?? "";
  const activeLeague = leagueId || userLeagueId;

  const table = useMemo(
    () => (save && activeLeague ? leagueTableOf(save, activeLeague) : []),
    [save, activeLeague],
  );

  const userFixtures = useMemo(() => {
    if (!save) return [] as Fixture[];
    return Object.values(save.world.fixtures)
      .filter(
        (f) => f.homeClubId === save.userClubId || f.awayClubId === save.userClubId,
      )
      .sort((a, b) => a.week - b.week || a.round - b.round);
  }, [save]);

  if (!save) {
    return <main className="flex h-full items-center justify-center bg-navy text-white/60">No career.</main>;
  }

  const leagues = Object.values(save.world.leagues).sort(
    (a, b) => b.reputation - a.reputation,
  );
  const cupFx = Object.values(save.world.fixtures)
    .filter((f) => f.competitionId === CUP_ID)
    .sort((a, b) => a.round - b.round);
  const contFx = Object.values(save.world.fixtures)
    .filter((f) => f.competitionId === CONTINENTAL_ID)
    .sort((a, b) => a.round - b.round || a.week - b.week);
  const contGroup = save.continental.groups.find((g) => g.clubIds.includes(save.userClubId));

  const nameOf = (id: string) => save.world.clubs[id]?.shortName ?? id;
  const scoreOf = (f: Fixture) =>
    f.played
      ? `${f.homeGoals} - ${f.awayGoals}${f.homePens != null ? ` (${f.homePens}-${f.awayPens})` : ""}`
      : `Wk ${f.week}`;

  return (
    <main className="flex h-full flex-col bg-navy">
      <TopBar budget={false} />
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-24">
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {(["league", "cup", "continental", "fixtures"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${
                view === v ? "bg-gold text-navy" : "border border-white/10 bg-card text-white/60"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {view === "league" && (
          <>
            <select
              value={activeLeague}
              onChange={(e) => setLeagueId(e.target.value)}
              className="mb-3 w-full rounded-lg border border-white/15 bg-card px-3 py-2 text-sm outline-none focus:border-gold"
            >
              {leagues.map((l) => (
                <option key={l.id} value={l.id} className="bg-card">
                  {l.nationFlag} {l.name} ({l.nation})
                </option>
              ))}
            </select>

            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-xs">
                <thead className="bg-card text-[10px] uppercase tracking-wide text-white/45">
                  <tr>
                    <th className="px-1.5 py-2 text-left">#</th>
                    <th className="py-2 text-left">Club</th>
                    <th className="px-1 py-2 text-right">P</th>
                    <th className="px-1 py-2 text-right">W</th>
                    <th className="px-1 py-2 text-right">D</th>
                    <th className="px-1 py-2 text-right">L</th>
                    <th className="px-1 py-2 text-right">GD</th>
                    <th className="px-1.5 py-2 text-right font-bold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row, i) => {
                    const club = save.world.clubs[row.clubId];
                    const isUser = row.clubId === save.userClubId;
                    return (
                      <tr
                        key={row.clubId}
                        className={`border-t border-white/5 ${
                          isUser ? "bg-gold/15 font-bold text-gold"
                            : i < 4 ? "bg-green-500/5"
                              : i >= 17 ? "bg-red-500/5" : ""
                        }`}
                      >
                        <td className="px-1.5 py-1.5 text-white/50">{i + 1}</td>
                        <td className="py-1.5">
                          <span className="flex items-center gap-1.5">
                            <span className="h-3 w-3 shrink-0 rounded-full border border-white/30"
                              style={{ background: club?.primaryColor }} />
                            <span className="truncate">{club?.shortName}</span>
                          </span>
                        </td>
                        <td className="px-1 py-1.5 text-right text-white/60">{row.played}</td>
                        <td className="px-1 py-1.5 text-right text-white/60">{row.won}</td>
                        <td className="px-1 py-1.5 text-right text-white/60">{row.drawn}</td>
                        <td className="px-1 py-1.5 text-right text-white/60">{row.lost}</td>
                        <td className="px-1 py-1.5 text-right text-white/60">
                          {row.goalDifference > 0 ? "+" : ""}{row.goalDifference}
                        </td>
                        <td className="px-1.5 py-1.5 text-right">{row.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-white/40">
              Top 4 qualify for the Continental Championship · bottom 3 relegated (two-tier nations)
            </p>
          </>
        )}

        {view === "cup" && (
          <div className="space-y-1.5">
            <p className="text-xs text-white/50">
              {save.cup.championId
                ? `Champion: ${nameOf(save.cup.championId)}`
                : `Current round: ${CUP_ROUND_NAMES[save.cup.round] ?? "—"}`}
            </p>
            {cupFx.map((f) => (
              <FixtureRow key={f.id} f={f} save={save} label={`${CUP_ROUND_NAMES[f.round] ?? "Cup"}`} score={scoreOf(f)} />
            ))}
            {cupFx.length === 0 && <p className="text-center text-xs text-white/40">No cup fixtures.</p>}
          </div>
        )}

        {view === "continental" && (
          <div className="space-y-1.5">
            {contGroup && (
              <div className="card-panel mb-2">
                <span className="stat-label">Group {contGroup.name}</span>
                <table className="mt-2 w-full text-xs">
                  <tbody>
                    {groupRows(save, contGroup.clubIds).map((r, i) => (
                      <tr key={r.clubId} className={r.clubId === save.userClubId ? "text-gold" : "text-white/70"}>
                        <td className="py-1 w-4">{i + 1}</td>
                        <td className="py-1 truncate">{nameOf(r.clubId)}</td>
                        <td className="py-1 text-right">{r.played}</td>
                        <td className="py-1 text-right font-bold">{r.points}</td>
                        <td className="py-1 text-right text-white/50">GD {r.goalDifference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-white/50">
              {save.continental.championId
                ? `Champion: ${nameOf(save.continental.championId)}`
                : save.continental.koRound >= 1
                  ? ["", "Round of 16", "Quarter Finals", "Semi Finals", "Final"][save.continental.koRound]
                  : "Group stage"}
            </p>
            {contFx.map((f) => (
              <FixtureRow
                key={f.id}
                f={f}
                save={save}
                label={f.round <= 6 ? `Group ${f.group} · MD${f.round}` : (["", "R16", "QF", "SF", "Final"][f.round - 10] ?? "KO")}
                score={scoreOf(f)}
              />
            ))}
            {contFx.length === 0 && <p className="text-center text-xs text-white/40">Not qualified / no fixtures.</p>}
          </div>
        )}

        {view === "fixtures" && (
          <div className="space-y-1.5">
            {userFixtures.map((f) => (
              <FixtureRow
                key={f.id}
                f={f}
                save={save}
                label={`Wk ${f.week} · ${f.competitionType === "League" ? "League" : f.competitionType === "Cup" ? "Cup" : "Cont."}`}
                score={scoreOf(f)}
                showClubs
              />
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

function groupRows(save: NonNullable<ReturnType<typeof useGameStore.getState>["save"]>, clubIds: string[]) {
  const fx = Object.values(save.world.fixtures).filter(
    (f) => f.competitionId === CONTINENTAL_ID && f.group && clubIds.includes(f.homeClubId),
  );
  const rows = clubIds.map((id) => ({
    clubId: id, played: 0, points: 0, goalDifference: 0, goalsFor: 0,
  }));
  const byId = new Map(rows.map((r) => [r.clubId, r]));
  for (const f of fx) {
    if (!f.played) continue;
    const h = byId.get(f.homeClubId);
    const a = byId.get(f.awayClubId);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.goalsFor += f.homeGoals;
    const gd = f.homeGoals - f.awayGoals;
    h.goalDifference += gd;
    a.goalDifference -= gd;
    if (f.homeGoals > f.awayGoals) h.points += 3;
    else if (f.homeGoals < f.awayGoals) a.points += 3;
    else { h.points += 1; a.points += 1; }
  }
  rows.sort((x, y) => y.points - x.points || y.goalDifference - x.goalDifference || y.goalsFor - x.goalsFor);
  return rows;
}

function FixtureRow({
  f, save, label, score, showClubs,
}: {
  f: Fixture;
  save: NonNullable<ReturnType<typeof useGameStore.getState>["save"]>;
  label: string;
  score: string;
  showClubs?: boolean;
}) {
  const isUser = f.homeClubId === save.userClubId || f.awayClubId === save.userClubId;
  const home = save.world.clubs[f.homeClubId];
  const away = save.world.clubs[f.awayClubId];
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
        isUser ? "border-gold/40 bg-gold/5" : "border-white/10 bg-card"
      }`}
    >
      <div className="min-w-0">
        <div className="truncate font-semibold">
          {showClubs ? `${home?.shortName} vs ${away?.shortName}` : label}
        </div>
        <div className="text-[10px] text-white/40">{showClubs ? `${label} · ${home?.name}` : `${home?.shortName} v ${away?.shortName}`}</div>
      </div>
      <div className={`shrink-0 pl-2 font-bold ${f.played ? "text-white/85" : "text-gold"}`}>{score}</div>
    </div>
  );
}
