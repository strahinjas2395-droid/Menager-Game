"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useGameStore } from "@/store/gameStore";

export default function MainMenu() {
  const init = useGameStore((s) => s.init);
  const saveExists = useGameStore((s) => s.saveExists);
  const ready = useGameStore((s) => s.ready);
  const [show, setShow] = useState(false);

  useEffect(() => {
    void init();
    const t = setTimeout(() => setShow(true), 50);
    return () => clearTimeout(t);
  }, [init]);

  return (
    <main className="flex h-full flex-col items-center justify-center bg-navy px-6">
      <div className={`mb-10 text-center ${show ? "animate-fadein" : "opacity-0"}`}>
        <h1 className="text-4xl font-black tracking-[0.2em] text-gold sm:text-5xl">
          FOOTBALL MANAGER
        </h1>
        <p className="mt-2 text-lg font-light tracking-[0.55em] text-gold/70">CONTINENTAL</p>
        <div className="mx-auto mt-5 h-px w-40 bg-gold/40" />
      </div>

      <div
        className={`flex w-72 flex-col gap-4 ${show ? "animate-fadein" : "opacity-0"}`}
        style={{ animationDelay: "150ms" }}
      >
        <Link href="/new-career" className="btn-gold block text-center">
          New Career
        </Link>
        <Link
          href="/hub"
          className={`btn-dark block text-center ${!ready || !saveExists ? "pointer-events-none opacity-40" : ""}`}
          aria-disabled={!saveExists}
        >
          Continue
        </Link>
        <Link href="/settings" className="btn-dark block text-center">
          Settings
        </Link>
        <Link href="/credits" className="btn-dark block text-center">
          Credits
        </Link>
      </div>

      <p className="absolute bottom-6 text-[11px] text-white/30">
        20 leagues · 400 clubs · ~10,000 players
      </p>
    </main>
  );
}
