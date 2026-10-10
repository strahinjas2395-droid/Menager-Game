"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Download, Trash2, Upload } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useGameStore } from "@/store/gameStore";
import StepDots from "@/components/StepDots";
import { downloadSave, importDatabase } from "@/database/storage";
import { difficultyLabel } from "@/utils/difficulty";
import type { GameSettings } from "@/types";

export default function SettingsPage() {
  const save = useGameStore((s) => s.save);
  const replaceSave = useGameStore((s) => s.replaceSave);
  const deleteCareer = useGameStore((s) => s.deleteCareer);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const settings: GameSettings = save?.settings ?? {
    soundVolume: 0.7,
    musicVolume: 0.4,
    vibration: true,
    autoPressConference: false,
  };

  const update = async (patch: Partial<GameSettings>) => {
    if (!save) return;
    await replaceSave({ ...save, settings: { ...save.settings, ...patch } });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const lockLandscape = async () => {
    try {
      const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await so?.lock?.("landscape");
      setMsg("Landscape locked (mobile only).");
    } catch {
      setMsg("Orientation lock not supported on this device.");
    }
    setTimeout(() => setMsg(null), 2500);
  };

  const onImport = async (file: File) => {
    try {
      const text = await file.text();
      const imported = importDatabase(text);
      await replaceSave(imported);
      setMsg("Save imported successfully!");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Import failed");
    }
    setTimeout(() => setMsg(null), 3000);
  };

  return (
    <main className="flex h-full flex-col bg-navy">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h1 className="text-lg font-bold">Settings</h1>
        <Link href="/" className="text-xs text-white/50 hover:text-gold">Main menu</Link>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        <section className="card-panel space-y-4">
          <span className="stat-label">Match</span>
          <div className="flex items-center justify-between rounded-lg bg-navy px-3 py-2 text-xs">
            <span>Match pace</span>
            <span className="font-bold text-gold">Fixed · 8 min per half</span>
          </div>
          <VolumeRow label="Sound volume" value={settings.soundVolume}
            onChange={(v) => void update({ soundVolume: v })} />
          <VolumeRow label="Music volume" value={settings.musicVolume}
            onChange={(v) => void update({ musicVolume: v })} />
          <ToggleRow label="Vibration on goal" value={settings.vibration}
            onChange={(v) => void update({ vibration: v })} />
          <ToggleRow label="Auto press conferences" value={settings.autoPressConference}
            onChange={(v) => void update({ autoPressConference: v })} />
        </section>

        <section className="card-panel mt-3 space-y-2">
          <span className="stat-label">Tactical language AI</span>
          <p className="text-[11px] leading-relaxed text-white/50">
            Instructions use a compact MiniLM semantic model in your browser. On first use it downloads the roughly 23 MB quantized model and small WASM runtime, then the browser cache reuses them. No account, API key, subscription or dedicated GPU is required.
          </p>
          <p className="rounded-lg border border-white/10 bg-navy px-3 py-2 text-[10px] leading-relaxed text-white/35">
            Your instruction and squad context stay on this device during inference. Every result is validated and cached in the career save; if the local model cannot load, the game clearly labels its limited basic fallback.
          </p>
        </section>

        <section className="card-panel mt-3 space-y-3">
          <span className="stat-label">Display</span>
          <button onClick={toggleFullscreen} className="btn-dark w-full text-xs">Toggle Fullscreen</button>
          <button onClick={() => void lockLandscape()} className="btn-dark w-full text-xs">Lock Landscape (match)</button>
        </section>

        <section className="card-panel mt-3 space-y-3">
          <span className="stat-label">Save data</span>
          <p className="text-[11px] text-white/45">
            Auto-saves after every match. You can also export/import a JSON save file.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={!save}
              onClick={() => save && downloadSave(save)}
              className="btn-dark flex items-center justify-center gap-1.5 py-2 text-xs disabled:opacity-40"
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="btn-dark flex items-center justify-center gap-1.5 py-2 text-xs"
            >
              <Upload size={14} /> Import
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
          <button
            disabled={!save}
            onClick={() => {
              if (confirm("Delete your career? This cannot be undone.")) void deleteCareer();
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-500/40 py-2.5 text-xs font-bold text-red-400 disabled:opacity-40"
          >
            <Trash2 size={14} /> Delete save data
          </button>
        </section>

        <section className="card-panel mt-3 text-[11px] text-white/45">
          <span className="stat-label">Difficulty</span>
          <p className="mt-1">
            {save ? difficultyLabel(save.difficulty) : "—"} (locked during a career)
          </p>
        </section>

        {msg && (
          <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/85 px-4 py-2 text-xs">
            {msg}
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

function VolumeRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  // snap to the nearest 10% dot
  const snapped = Math.round(value * 10) / 10;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="font-bold text-gold">{Math.round(snapped * 100)}%</span>
      </div>
      <div className="mt-0.5">
        <StepDots
          value={snapped}
          min={0}
          max={1}
          step={0.1}
          onChange={onChange}
          startLabel="Mute"
          endLabel="Max"
          ariaLabel={label}
        />
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span>{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`h-5 w-9 rounded-full p-0.5 transition ${value ? "bg-gold" : "bg-white/20"}`}
      >
        <span className={`block h-4 w-4 rounded-full bg-white transition ${value ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );
}
