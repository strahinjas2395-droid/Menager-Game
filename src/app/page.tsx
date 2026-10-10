"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, Crown, Sparkles } from "lucide-react";
import { GameMode } from "@/types";
import { useGameStore } from "@/store/gameStore";

export default function MainMenu() {
  const init = useGameStore((s) => s.init);
  const saveExists = useGameStore((s) => s.saveExists);
  const save = useGameStore((s) => s.save);
  const ready = useGameStore((s) => s.ready);
  const [show, setShow] = useState(false);

  useEffect(() => {
    void init();
    const t = setTimeout(() => setShow(true), 50);
    return () => clearTimeout(t);
  }, [init]);

  const savedMode = save?.gameMode ?? GameMode.Iconic;
  const continueLabel = savedMode === GameMode.Iconic ? "Continue Iconic Prime" : "Continue Current Era";
  const canContinue = ready && saveExists;

  return (
    <main className="flex h-full flex-col items-center overflow-y-auto bg-navy px-5 py-7">
      <div className={`mt-auto text-center ${show ? "animate-fadein" : "opacity-0"}`}>
        <h1 className="text-4xl font-black tracking-[0.2em] text-gold sm:text-5xl">
          FOOTBALL MANAGER
        </h1>
        <p className="mt-2 text-lg font-light tracking-[0.55em] text-gold/70">CONTINENTAL</p>
        <div className="mx-auto mt-4 h-px w-40 bg-gold/40" />
      </div>

      <div
        className={`my-7 flex w-full max-w-sm flex-col gap-3 ${show ? "animate-fadein" : "opacity-0"}`}
        style={{ animationDelay: "150ms" }}
      >
        <p className="mb-1 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
          Start a new career database
        </p>

        <Link
          href={`/new-career?mode=${GameMode.Modern}`}
          className="group rounded-2xl border border-gold/70 bg-gold/10 p-4 transition hover:border-gold hover:bg-gold/15"
        >
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-gold p-2 text-navy"><CalendarDays size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-black text-gold">Current Era</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-white/60">
                Contemporary squads with 134 active-player-inspired marquee identities in a stable offline snapshot.
              </span>
            </span>
          </div>
        </Link>

        <Link
          href={`/new-career?mode=${GameMode.Iconic}`}
          className="group relative overflow-hidden rounded-2xl border border-purple-300/35 bg-gradient-to-br from-purple-500/15 to-card p-4 transition hover:border-purple-300/65"
        >
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-gold/35 bg-navy/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-gold">
            <Sparkles size={9} /> Special mode
          </span>
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-purple-300/15 p-2 text-purple-200"><Crown size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block pr-24 text-base font-black text-purple-100">Iconic Prime</span>
              <span className="mt-1 block text-xs leading-relaxed text-white/60">
                Mixed-era legends restored to their researched peak movement and technique.
              </span>
            </span>
          </div>
        </Link>

        <Link
          href="/hub"
          className={`btn-dark mt-1 block text-center ${!canContinue ? "pointer-events-none opacity-40" : ""}`}
          aria-disabled={!canContinue}
          tabIndex={canContinue ? undefined : -1}
        >
          {continueLabel}
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/settings" className="btn-dark block text-center">Settings</Link>
          <Link href="/credits" className="btn-dark block text-center">Credits</Link>
        </div>
      </div>

      <p className="mt-auto text-center text-[11px] text-white/30">
        20 leagues · 400 clubs · two deterministic databases
      </p>
    </main>
  );
}
