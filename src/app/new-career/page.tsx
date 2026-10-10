"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Crown, Star } from "lucide-react";
import { Difficulty, GameMode } from "@/types";
import { LEAGUES_DATA, slugify } from "@/database/leagueGenerator";
import { NATIONALITIES, NATIONALITY_FLAGS } from "@/database/nameGenerator";
import { useGameStore } from "@/store/gameStore";

type Step = 1 | 2 | 3 | 4;

const DIFFICULTIES: { id: Difficulty; label: string; desc: string }[] = [
  { id: Difficulty.Beginner, label: "Beginner", desc: "Opposition coaches react late, read only the score and make basic substitutions." },
  { id: Difficulty.Amateur, label: "Amateur", desc: "Slow tactical reactions with limited formation changes and squad management." },
  { id: Difficulty.SemiPro, label: "Semi-Pro", desc: "Balanced match-day coaching with occasional tactical adaptation." },
  { id: Difficulty.Professional, label: "Professional", desc: "Coaches read match trends, alter systems and target tiring players." },
  { id: Difficulty.WorldClass, label: "World Class", desc: "Fast, informed reactions using pressure, territory and chance trends." },
  { id: Difficulty.Legendary, label: "Legendary", desc: "Elite coaches anticipate danger and make precise tactical or personnel changes." },
  { id: Difficulty.Ultimate, label: "Ultimate", desc: "Near-immediate expert analysis, optimal substitutions and ruthless game management." },
];

function Stars({ rep }: { rep: number }) {
  const n = Math.max(1, Math.min(5, Math.round((rep - 55) / 7)));
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          className={i < n ? "fill-gold text-gold" : "text-white/20"}
        />
      ))}
    </span>
  );
}

export default function NewCareerPage() {
  return (
    <Suspense fallback={<main className="flex h-full items-center justify-center bg-navy text-sm text-white/50">Loading career setup…</main>}>
      <NewCareerSetup />
    </Suspense>
  );
}

function NewCareerSetup() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const newCareer = useGameStore((s) => s.newCareer);
  const gameMode = searchParams.get("mode") === GameMode.Iconic ? GameMode.Iconic : GameMode.Modern;
  const iconicMode = gameMode === GameMode.Iconic;

  const [step, setStep] = useState<Step>(1);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [managerName, setManagerName] = useState("");
  const [nationality, setNationality] = useState(NATIONALITIES[0]);
  const [difficulty, setDifficulty] = useState(Difficulty.SemiPro);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leagues = useMemo(
    () => [...LEAGUES_DATA].sort((a, b) => b.reputation - a.reputation),
    [],
  );
  const selectedLeague = leagues.find((l) => slugify(l.name) === leagueId);
  const clubs = useMemo(() => selectedLeague?.clubs ?? [], [selectedLeague]);
  const selectedClubName = clubs.find((c) => slugify(c) === clubId);

  const canNext =
    (step === 1 && !!leagueId) ||
    (step === 2 && !!clubId) ||
    (step === 3 && managerName.trim().length >= 2) ||
    step === 4;

  const start = async () => {
    if (!leagueId || !clubId) return;
    setBusy(true);
    setError(null);
    try {
      // let the spinner paint before the (synchronous) world generation
      await new Promise((r) => setTimeout(r, 60));
      await newCareer({
        managerName: managerName.trim(),
        managerNationality: nationality,
        difficulty,
        gameMode,
        leagueId,
        clubId,
      });
      router.push("/hub");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start career");
      setBusy(false);
    }
  };

  return (
    <main className="flex h-full flex-col bg-navy">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button
          onClick={() => (step === 1 ? router.push("/") : setStep((s) => (s - 1) as Step))}
          className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-bold uppercase tracking-widest text-gold">
            {iconicMode ? "Iconic Prime Career" : "Current Era Career"}
          </h1>
          <div className="mt-1 flex gap-1.5">
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={`h-1.5 w-8 rounded-full ${n <= step ? "bg-gold" : "bg-white/15"}`}
              />
            ))}
          </div>
        </div>
        <span className="text-xs text-white/40">Step {step}/4</span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 pb-28">
        <div className={`mb-4 flex items-center gap-3 rounded-xl border p-3 ${
          iconicMode ? "border-purple-300/30 bg-purple-500/10" : "border-gold/30 bg-gold/5"
        }`}>
          <span className={iconicMode ? "text-purple-200" : "text-gold"}>
            {iconicMode ? <Crown size={18} /> : <CalendarDays size={18} />}
          </span>
          <span>
            <span className="block text-xs font-black uppercase tracking-wider">
              {iconicMode ? "Special database · Iconic Prime" : "Contemporary database · Current Era"}
            </span>
            <span className="block text-[11px] text-white/50">
              {iconicMode
                ? "109 mixed-era aliases use bespoke researched prime mechanics."
                : "400 contemporary clubs with 134 active-player-inspired marquee identities."}
            </span>
          </span>
        </div>

        {step === 1 && (
          <div key="s1" className="animate-slidein">
            <h2 className="mb-3 text-lg font-bold">Choose Your League</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {leagues.map((l) => {
                const id = slugify(l.name);
                const selected = leagueId === id;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setLeagueId(id);
                      setClubId(null);
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      selected
                        ? "border-gold bg-gold/10 shadow-[0_0_0_1px_#F0A500]"
                        : "border-white/10 bg-card hover:border-white/30"
                    }`}
                  >
                    <div className="text-lg">{flagFor(l.nation)}</div>
                    <div className="mt-1 truncate text-sm font-bold">{l.name}</div>
                    <div className="text-[11px] text-white/50">
                      {l.nation} · Tier {l.tier}
                    </div>
                    <div className="mt-1.5">
                      <Stars rep={l.reputation} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div key="s2" className="animate-slidein">
            <h2 className="mb-1 text-lg font-bold">Choose Your Club</h2>
            <p className="mb-3 text-xs text-white/50">{selectedLeague?.name}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {clubs.map((name, i) => {
                const id = slugify(name);
                const selected = clubId === id;
                const colors = clubSwatch(selectedLeague?.name ?? "", i);
                return (
                  <button
                    key={id}
                    onClick={() => setClubId(id)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                      selected
                        ? "border-gold bg-gold/10"
                        : "border-white/10 bg-card hover:border-white/30"
                    }`}
                  >
                    <span className="flex shrink-0">
                      <span
                        className="h-6 w-6 rounded-full border border-white/40"
                        style={{ background: colors.primary }}
                      />
                      <span
                        className="-ml-2 h-6 w-6 rounded-full border border-white/40"
                        style={{ background: colors.secondary }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{name}</span>
                      <span className="block text-[11px] text-white/45">
                        Stadium {stadiumHint(name)} · Reputation {repForClub(selectedLeague?.reputation ?? 70, i)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div key="s3" className="animate-slidein space-y-5">
            <h2 className="text-lg font-bold">Create Your Manager</h2>
            <div>
              <label className="stat-label">Manager name</label>
              <input
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="e.g. Alex Ferguson"
                maxLength={30}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-card px-4 py-3 text-sm outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="stat-label">Nationality</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {NATIONALITIES.map((n) => (
                  <button
                    key={n}
                    onClick={() => setNationality(n)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                      nationality === n
                        ? "border-gold bg-gold/15 text-gold"
                        : "border-white/10 bg-card text-white/70"
                    }`}
                  >
                    {NATIONALITY_FLAGS[n]} {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="stat-label">Difficulty</label>
              <div className="mt-1.5 space-y-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDifficulty(d.id)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                      difficulty === d.id
                        ? "border-gold bg-gold/10"
                        : "border-white/10 bg-card"
                    }`}
                  >
                    <span
                      className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                        difficulty === d.id ? "border-gold bg-gold" : "border-white/30"
                      }`}
                    />
                    <span>
                      <span className="block text-sm font-bold">{d.label}</span>
                      <span className="block text-xs text-white/50">{d.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div key="s4" className="animate-slidein">
            <h2 className="mb-3 text-lg font-bold">Confirm</h2>
            <div className="card-panel space-y-3 text-sm">
              <Row label="Database" value={iconicMode ? "Iconic Prime · Special" : "Current Era"} />
              <Row label="League" value={`${selectedLeague?.name ?? ""} (${selectedLeague?.nation ?? ""})`} />
              <Row label="Club" value={selectedClubName ?? ""} />
              <Row label="Manager" value={`${managerName.trim()} (${nationality})`} />
              <Row label="Difficulty" value={DIFFICULTIES.find((item) => item.id === difficulty)?.label ?? difficulty} />
              <Row label="Season" value="2026 · 42 weeks" />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/45">
              You will take charge across league, cup and continental competitions using the {iconicMode
                ? "special mixed-era prime database"
                : "stable contemporary-era offline database"}. The board expects results — good luck, gaffer!
            </p>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </div>
        )}
      </div>

      {/* footer */}
      <footer className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-panel/95 px-4 py-3">
        <div className="mx-auto flex max-w-lg justify-end gap-3">
          {step < 4 ? (
            <button
              disabled={!canNext}
              onClick={() => setStep((s) => (s + 1) as Step)}
              className="btn-gold flex items-center gap-2"
            >
              Next <ArrowRight size={16} />
            </button>
          ) : (
            <button disabled={busy} onClick={() => void start()} className="btn-gold flex items-center gap-2">
              {busy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy border-t-transparent" />
                  Generating world…
                </>
              ) : (
                <>
                  <Check size={16} /> Start Career
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-white/45">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

function flagFor(nation: string): string {
  return NATIONALITY_FLAGS[nation] ?? "\u{1F3F4}";
}

/** deterministic swatch matching generation's golden-angle hues (approximate, UI only) */
function clubSwatch(leagueName: string, index: number): { primary: string; secondary: string } {
  const h = (index * 137.508 + hash(leagueName) % 40 + 360) % 360;
  const h2 = (h + 180) % 360;
  return { primary: hsl(h, 65, 45), secondary: hsl(h2, 50, 85) };
}

function hash(s: string): number {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return x;
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h.toFixed(0)} ${s}% ${l}%)`;
}

function stadiumHint(clubName: string): string {
  const w = clubName.split(" ")[0];
  return `${w} Arena`;
}

function repForClub(leagueRep: number, index: number): number {
  const offset = index < 3 ? 10 : index < 8 ? 3 : index < 14 ? -2 : -10;
  return Math.max(25, Math.min(96, leagueRep + offset));
}
