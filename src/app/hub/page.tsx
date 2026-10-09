"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowRight, CalendarDays, ChevronsRight, Inbox, Mail, Shield, Trophy, Users,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import { leagueTableOf, useGameStore } from "@/store/gameStore";
import { userFixturesForWeek, fixturesForWeek } from "@/engine/seasonManager";
import { CUP_ROUND_NAMES, CUP_ID } from "@/engine/cupEngine";
import { CONTINENTAL_ID } from "@/engine/continentalEngine";
import { CompetitionType, type Fixture } from "@/types";

export default function HubPage() {
  const router = useRouter();
  const save = useGameStore((s) => s.save);
  const advanceWeek = useGameStore((s) => s.advanceWeek);
  const weekQueue = useGameStore((s) => s.weekQueue);
  const markAllInboxRead = useGameStore((s) => s.markAllInboxRead);
  const [toast, setToast] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const club = save ? save.world.clubs[save.userClubId] : null;
  const league = club ? save?.world.leagues[club.leagueId] : null;

  const nextMatch = useMemo<Fixture | null>(() => {
    if (!save) return null;
    if (weekQueue.length > 0) return weekQueue[0];
    const upcoming = Object.values(save.world.fixtures)
      .filter(
        (f) =>
          !f.played &&
          (f.homeClubId === save.userClubId || f.awayClubId === save.userClubId),
      )
      .sort((a, b) => a.week - b.week);
    return upcoming[0] ?? null;
  }, [save, weekQueue]);

  const table = useMemo(
    () => (save && league ? leagueTableOf(save, league.id) : []),
    [save, league],
  );

  const unread = save?.inbox.filter((m) => !m.read).length ?? 0;

  if (!save || !club || !league) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 bg-navy">
        <p className="text-white/60">No active career.</p>
        <Link href="/" className="btn-gold">Main Menu</Link>
      </main>
    );
  }

  const squad = club.playerIds.map((id) => save.world.players[id]).filter(Boolean);
  const avgAge = squad.length
    ? (squad.reduce((s, p) => s + p.age, 0) / squad.length).toFixed(1)
    : "-";

  const onAdvance = () => {
    setAdvancing(true);
    // small delay so the button feedback paints
    setTimeout(() => {
      const res = advanceWeek();
      setAdvancing(false);
      if (res.type === "match") {
        router.push(`/match?fixture=${res.fixtureId}`);
      } else if (res.type === "seasonEnd") {
        setToast("Season complete! A new campaign begins.");
        setTimeout(() => setToast(null), 3500);
      } else {
        setToast(`Week simulated — no match for ${club.shortName}. Rest week!`);
        setTimeout(() => setToast(null), 3000);
      }
    }, 80);
  };

  const oppOf = (f: Fixture) =>
    save.world.clubs[f.homeClubId === save.userClubId ? f.awayClubId : f.homeClubId];

  const cupStatus = () => {
    if (save.cup.championId === save.userClubId) return "🏆 Champions!";
    if (save.cup.championId) return "Eliminated";
    const stillIn = Object.values(save.world.fixtures).some(
      (f) =>
        f.competitionId === CUP_ID &&
        (f.homeClubId === save.userClubId || f.awayClubId === save.userClubId),
    );
    if (!stillIn && save.cup.round > 1) return "Eliminated";
    return CUP_ROUND_NAMES[save.cup.round] ?? "—";
  };

  const contStatus = () => {
    if (save.continental.championId === save.userClubId) return "🏆 Champions!";
    if (save.continental.championId) return "Finished";
    const g = save.continental.groups.find((x) => x.clubIds.includes(save.userClubId));
    if (g) {
      const groupPlayed = Object.values(save.world.fixtures).some(
        (f) => f.competitionId === CONTINENTAL_ID && f.group === g.name && f.played,
      );
      return `Group ${g.name}${groupPlayed ? "" : " (draw)"}`;
    }
    const inKO = Object.values(save.world.fixtures).some(
      (f) =>
        f.competitionId === CONTINENTAL_ID &&
        f.round > 10 &&
        (f.homeClubId === save.userClubId || f.awayClubId === save.userClubId),
    );
    if (inKO) return ["", "Round of 16", "Quarter Final", "Semi Final", "Final"][save.continental.koRound] ?? "Knockout";
    const everQualified = save.continental.groups.some((x) => x.clubIds.includes(save.userClubId));
    return everQualified ? "Knockout stage" : "Not qualified";
  };

  const top5 = table.slice(0, 5);
  const bottom3 = table.slice(-3);
  const userPos = table.findIndex((r) => r.clubId === save.userClubId) + 1;

  return (
    <main className="flex h-full flex-col bg-navy">
      <TopBar />
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {/* NEXT MATCH */}
        <section className="card-panel animate-fadein border-gold/40">
          <div className="mb-2 flex items-center justify-between">
            <span className="stat-label text-gold">Next Match</span>
            <span className="flex items-center gap-1 text-[11px] text-white/50">
              <CalendarDays size={12} /> Week {nextMatch?.week ?? save.season.currentWeek}
            </span>
          </div>
          {nextMatch ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <TeamCol
                  name={save.world.clubs[nextMatch.homeClubId]?.name ?? "?"}
                  color={save.world.clubs[nextMatch.homeClubId]?.primaryColor}
                  home
                />
                <div className="text-center">
                  <div className="text-lg font-black text-white/80">VS</div>
                  <div className="text-[10px] text-white/40">
                    {nextMatch.competitionType === CompetitionType.League
                      ? "League"
                      : nextMatch.competitionType === CompetitionType.Cup
                        ? "Cup"
                        : "Continental"}
                  </div>
                </div>
                <TeamCol
                  name={save.world.clubs[nextMatch.awayClubId]?.name ?? "?"}
                  color={save.world.clubs[nextMatch.awayClubId]?.primaryColor}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/squad" className="btn-dark py-2 text-center text-xs">Select Squad</Link>
                <Link href="/tactics" className="btn-dark py-2 text-center text-xs">Tactics</Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-white/50">Season complete — no fixtures.</p>
          )}
        </section>

        {/* card grid */}
        <section className="mt-3 grid grid-cols-2 gap-3">
          <Link href={`/standings?league=${league.id}`} className="card-panel block transition hover:border-gold/40">
            <span className="stat-label">League Table</span>
            <div className="mt-1 text-sm font-bold text-gold">
              {userPos > 0 ? `${ordinal(userPos)} of 20` : "—"}
            </div>
            <table className="mt-2 w-full text-[10px]">
              <tbody>
                {[...new Set([...top5.map((r) => r.clubId), ...bottom3.map((r) => r.clubId)])].map(
                  (id) => {
                    const row = table.find((r) => r.clubId === id)!;
                    const c = save.world.clubs[id];
                    const isUser = id === save.userClubId;
                    return (
                      <tr key={id} className={isUser ? "text-gold" : "text-white/60"}>
                        <td className="w-4 py-0.5">{table.indexOf(row) + 1}</td>
                        <td className="truncate py-0.5">{c?.shortName}</td>
                        <td className="py-0.5 text-right">{row.points}</td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
            <span className="mt-1 block text-[10px] text-white/40">Full table →</span>
          </Link>

          <div className="card-panel">
            <span className="stat-label">Cup</span>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-white/90">
              <Shield size={14} className="text-gold" /> {cupStatus()}
            </div>
            <div className="mt-3 stat-label">Continental</div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-white/90">
              <Trophy size={14} className="text-gold" /> {contStatus()}
            </div>
          </div>

          <Link href="/squad" className="card-panel block transition hover:border-gold/40">
            <span className="stat-label">Squad</span>
            <div className="mt-1 text-sm font-bold">{squad.length} players</div>
            <div className="text-[11px] text-white/50">Avg age {avgAge}</div>
          </Link>

          <Link href="/transfers" className="card-panel block transition hover:border-gold/40">
            <span className="stat-label">Transfers</span>
            <div className={`mt-1 text-sm font-bold ${save.season.transferWindowOpen ? "text-green-400" : "text-white/70"}`}>
              {save.season.transferWindowOpen ? "Window OPEN" : "Window closed"}
            </div>
            <div className="text-[11px] text-white/50">Open market →</div>
          </Link>
        </section>

        {/* INBOX */}
        <section className="card-panel mt-3">
          <div className="flex items-center justify-between">
            <span className="stat-label flex items-center gap-1.5">
              <Inbox size={13} /> Inbox
              {unread > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {unread}
                </span>
              )}
            </span>
            {unread > 0 && (
              <button onClick={markAllInboxRead} className="text-[11px] text-white/45 hover:text-gold">
                Mark all read
              </button>
            )}
          </div>
          <div className="mt-2 space-y-2">
            {save.inbox.slice(0, 3).map((m) => (
              <div key={m.id} className="flex gap-2 rounded-lg bg-navy/60 p-2">
                <Mail size={13} className={`mt-0.5 shrink-0 ${m.read ? "text-white/30" : "text-gold"}`} />
                <div className="min-w-0">
                  <p className={`truncate text-xs ${m.read ? "text-white/60" : "font-semibold text-white"}`}>
                    {m.subject}
                  </p>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-[10px] leading-snug text-white/40">
                    {m.body}
                  </p>
                </div>
              </div>
            ))}
            {save.inbox.length === 0 && (
              <p className="text-xs text-white/40">No messages.</p>
            )}
          </div>
        </section>
      </div>

      {/* ADVANCE */}
      <div className="fixed inset-x-0 bottom-14 z-30 mx-auto max-w-lg px-4 pb-2">
        <button
          onClick={onAdvance}
          disabled={advancing}
          className="btn-gold flex w-full items-center justify-center gap-2 py-3.5"
        >
          {advancing ? "Simulating…" : "Advance to Match Day"}
          <ChevronsRight size={18} />
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-32 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/85 px-4 py-2 text-xs text-white shadow-xl">
          {toast}
        </div>
      )}

      <BottomNav />
    </main>
  );
}

function TeamCol({ name, color, home }: { name: string; color?: string; home?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${home ? "" : "flex-row-reverse text-right"}`}>
      <span className="h-7 w-7 shrink-0 rounded-full border border-white/40" style={{ background: color ?? "#555" }} />
      <span className="truncate text-sm font-semibold leading-tight">{name}</span>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
