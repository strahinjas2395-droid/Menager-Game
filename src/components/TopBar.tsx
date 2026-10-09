"use client";

import { useGameStore } from "@/store/gameStore";
import { NATIONALITY_FLAGS } from "@/database/nameGenerator";

export default function TopBar({ budget = true }: { budget?: boolean }) {
  const save = useGameStore((s) => s.save);
  if (!save) return null;
  const club = save.world.clubs[save.userClubId];
  const flag = NATIONALITY_FLAGS[club ? save.world.leagues[club.leagueId]?.nation ?? "" : ""] ?? "";

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-panel/95 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2 overflow-hidden">
        {club && (
          <span
            className="inline-block h-4 w-4 shrink-0 rounded-full border border-white/40"
            style={{ background: club.primaryColor }}
          />
        )}
        <span className="truncate text-sm font-bold text-white">
          {club?.name ?? "No club"}
        </span>
        <span className="shrink-0 text-xs text-white/40">
          {flag} S{save.season.seasonYear} · Wk {save.season.currentWeek}/{save.season.totalWeeks}
        </span>
      </div>
      {budget && club && (
        <span className="shrink-0 text-xs font-semibold text-gold">
          €{(club.budget / 1_000_000).toFixed(1)}M
        </span>
      )}
    </header>
  );
}
