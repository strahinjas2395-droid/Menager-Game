"use client";

import Link from "next/link";

export default function CreditsPage() {
  return (
    <main className="flex h-full flex-col bg-navy">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h1 className="text-lg font-bold">Credits</h1>
        <Link href="/" className="text-xs text-white/50 hover:text-gold">Back</Link>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-8 text-center">
        <h2 className="text-xl font-black tracking-widest text-gold">FOOTBALL MANAGER CONTINENTAL</h2>
        <p className="mt-1 text-sm text-white/50">A browser football management game</p>

        <div className="mx-auto mt-8 max-w-md space-y-4 text-left text-sm leading-relaxed text-white/70">
          <p>
            20 fictional nations, 20 leagues, 400 clubs and a fully generated world of
            ~10,000 players — every name invented for this universe.
          </p>
          <p>
            Features: live dot-view matches with a seeded simulation engine, 32 formations,
            tactical instructions, league / cup / continental competitions, transfers,
            promotion &amp; relegation, and multi-season careers.
          </p>
          <p className="text-white/45">
            Built with Next.js, TypeScript, Tailwind CSS, Zustand and Phaser 3.
          </p>
        </div>

        <div className="mt-10 text-[11px] text-white/30">
          Fictional game · no real clubs or players were harmed.
        </div>
      </div>
    </main>
  );
}
