"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import { useGameStore } from "@/store/gameStore";
import { NATIONALITIES, NATIONALITY_FLAGS } from "@/database/nameGenerator";
import {
  askingPriceFor, completeTransfer, makeBid, negotiateContract, offerFrom,
} from "@/engine/transferEngine";
import { PrimaryPosition, type Player, type TransferOffer } from "@/types";

type Tab = "search" | "offers";

export default function TransfersPage() {
  const save = useGameStore((s) => s.save);
  const replaceSave = useGameStore((s) => s.replaceSave);

  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [maxAge, setMaxAge] = useState(40);
  const [natFilter, setNatFilter] = useState("ALL");
  const [limit, setLimit] = useState(40);

  const [negotiating, setNegotiating] = useState<Player | null>(null);
  const [bidAmount, setBidAmount] = useState(0);
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(3);
  const [negStep, setNegStep] = useState<"bid" | "contract" | "done">("bid");
  const [negMsg, setNegMsg] = useState<string | null>(null);

  const windowOpen = save?.season.transferWindowOpen ?? false;

  const results = useMemo<Player[]>(() => {
    if (!save) return [];
    const q = query.trim().toLowerCase();
    const list = Object.values(save.world.players).filter((p) => {
      if (p.contract.clubId === save.userClubId) return false;
      if (q && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) return false;
      if (posFilter !== "ALL" && p.primaryPosition !== posFilter) return false;
      if (p.age > maxAge) return false;
      if (natFilter !== "ALL" && p.nationality !== natFilter) return false;
      return true;
    });
    list.sort((a, b) => b.reputation - a.reputation);
    return list.slice(0, limit);
  }, [save, query, posFilter, maxAge, natFilter, limit]);

  if (!save) {
    return <main className="flex h-full items-center justify-center bg-navy text-white/60">No career.</main>;
  }

  const club = save.world.clubs[save.userClubId]!;

  const openNegotiation = (p: Player) => {
    setNegotiating(p);
    setBidAmount(Math.round(askingPriceFor(p, save.world)));
    setWage(Math.round((p.contract.weeklyWage * 1.25) / 1000) * 1000);
    setYears(3);
    setNegStep("bid");
    setNegMsg(null);
  };

  const submitBid = () => {
    if (!negotiating) return;
    const res = makeBid(negotiating, bidAmount, save.world, save.userClubId);
    if (res.accepted) {
      setNegStep("contract");
      setNegMsg("Bid accepted! Agree personal terms with the player.");
    } else {
      setNegMsg(res.reason);
      if (res.counterAmount) {
        setBidAmount(res.counterAmount);
        const offer = offerFrom(
          negotiating.id, negotiating.contract.clubId, save.userClubId, bidAmount, save.season.currentWeek,
        );
        offer.status = "rejected";
        offer.counterAmount = res.counterAmount;
        save.offers.unshift(offer);
      }
    }
  };

  const submitContract = async () => {
    if (!negotiating) return;
    const res = negotiateContract(negotiating, offeredWageSafe(), years, save.world, save.userClubId);
    if (!res.accepted) {
      setNegMsg(res.reason);
      setWage(res.wageDemand);
      return;
    }
    const sellerId = negotiating.contract.clubId;
    const out = completeTransfer(save.world, negotiating.id, bidAmount, offeredWageSafe(), years, save.userClubId);
    if (!out.ok) {
      setNegMsg(out.error ?? "Transfer failed");
      return;
    }
    const offer = offerFrom(
      negotiating.id, sellerId, save.userClubId, bidAmount, save.season.currentWeek,
    );
    offer.status = "accepted";
    save.offers.unshift(offer);
    save.inbox.unshift({
      id: `msg-tr-${Date.now()}`,
      week: save.season.currentWeek,
      subject: `Signed: ${negotiating.firstName} ${negotiating.lastName}!`,
      body: `${club.name} have completed the signing of ${negotiating.firstName} ${negotiating.lastName} for €${(bidAmount / 1_000_000).toFixed(1)}M on €${(wage / 1000).toFixed(1)}k/w for ${years} year(s).`,
      read: false,
    });
    setNegStep("done");
    setNegMsg("Welcome to the club! Deal complete.");
    await replaceSave(save);
  };

  const offeredWageSafe = () => wage;

  const closeNeg = async () => {
    setNegotiating(null);
    await replaceSave(save);
  };

  const squadOf = (clubId: string) =>
    (save.world.clubs[clubId]?.playerIds ?? []).map((id) => save.world.players[id]);

  return (
    <main className="flex h-full flex-col bg-navy">
      <TopBar />
      <div className="flex-1 overflow-y-auto px-4 py-3 pb-24">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">Transfers</h1>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${windowOpen ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/50"}`}>
            {windowOpen ? "Window OPEN" : "Window closed"}
          </span>
        </div>

        <div className="mb-3 flex gap-2">
          {(["search", "offers"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${tab === t ? "bg-gold text-navy" : "bg-card text-white/60 border border-white/10"}`}
            >
              {t}
              {t === "offers" && save.offers.length > 0 && ` (${save.offers.length})`}
            </button>
          ))}
        </div>

        {tab === "search" && (
          <>
            <div className="card-panel space-y-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-navy px-3 py-2">
                <Search size={14} className="text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search player name…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-white/30"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)}
                  className="rounded-lg border border-white/10 bg-navy px-2 py-1.5 text-xs">
                  <option value="ALL">All positions</option>
                  {Object.values(PrimaryPosition).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select value={natFilter} onChange={(e) => setNatFilter(e.target.value)}
                  className="rounded-lg border border-white/10 bg-navy px-2 py-1.5 text-xs">
                  <option value="ALL">All nations</option>
                  {NATIONALITIES.map((n) => (
                    <option key={n} value={n}>{NATIONALITY_FLAGS[n]} {n}</option>
                  ))}
                </select>
                <label className="flex flex-1 items-center gap-2 text-[11px] text-white/60">
                  Max age
                  <input type="range" min={17} max={40} value={maxAge}
                    onChange={(e) => setMaxAge(Number(e.target.value))} />
                  <span className="w-5 font-bold text-gold">{maxAge}</span>
                </label>
              </div>
            </div>

            {!windowOpen && (
              <p className="mt-3 rounded-lg bg-yellow-500/10 p-2.5 text-[11px] text-yellow-300">
                ⚠ The transfer window is closed. You can scout players now, but deals can only
                be completed during windows (weeks 1-4 and 19-22).
              </p>
            )}

            <div className="mt-3 space-y-1.5">
              {results.map((p) => {
                const own = save.world.clubs[p.contract.clubId];
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-card px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="text-[10px] text-white/45">{NATIONALITY_FLAGS[p.nationality]}</span>
                      </div>
                      <div className="truncate text-[11px] text-white/45">
                        {p.primaryPosition} · {p.age}y · {own?.shortName ?? "Free"} ·{" "}
                        <span className="text-gold">€{(askingPriceFor(p, save.world) / 1_000_000).toFixed(1)}M</span>
                        <span className="ml-1 text-white/35">ask</span>
                      </div>
                    </div>
                    <button
                      disabled={!windowOpen}
                      onClick={() => openNegotiation(p)}
                      className="rounded-lg bg-gold px-3 py-1.5 text-[11px] font-bold text-navy disabled:opacity-30"
                    >
                      Make Offer
                    </button>
                  </div>
                );
              })}
              {results.length === 0 && (
                <p className="text-center text-xs text-white/40">No players match your filters.</p>
              )}
              {limit < 200 && results.length >= limit && (
                <button onClick={() => setLimit((l) => l + 40)} className="btn-dark w-full py-2 text-xs">
                  Load more
                </button>
              )}
            </div>
          </>
        )}

        {tab === "offers" && (
          <div className="space-y-1.5">
            {save.offers.length === 0 && (
              <p className="text-center text-xs text-white/40">No offers made yet.</p>
            )}
            {save.offers.map((o: TransferOffer) => {
              const p = save.world.players[o.playerId];
              return (
                <div key={o.id} className="rounded-xl border border-white/10 bg-card px-3 py-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="font-semibold">{p ? `${p.firstName} ${p.lastName}` : o.playerId}</span>
                    <span className={`font-bold ${o.status === "accepted" ? "text-green-400" : o.status === "rejected" ? "text-red-400" : "text-yellow-300"}`}>
                      {o.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-white/45">
                    €{(o.amount / 1_000_000).toFixed(1)}M · week {o.week}
                    {o.counterAmount ? ` · counter €${(o.counterAmount / 1_000_000).toFixed(1)}M` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* negotiation modal */}
      {negotiating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5" onClick={() => void closeNeg()}>
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-navy p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold">{negotiating.firstName} {negotiating.lastName}</h3>
                <p className="text-xs text-white/50">
                  {negotiating.primaryPosition} · {negotiating.age}y · value €
                  {(negotiating.contract.transferValue / 1_000_000).toFixed(1)}M
                </p>
              </div>
              <button onClick={() => void closeNeg()} className="text-white/50"><X size={16} /></button>
            </div>

            {negStep === "bid" && (
              <div className="mt-4">
                <label className="stat-label">Transfer bid (€M)</label>
                <input
                  type="range"
                  min={Math.round(negotiating.contract.transferValue * 0.4 / 1e6)}
                  max={Math.round(negotiating.contract.transferValue * 3 / 1e6)}
                  step={0.5}
                  value={bidAmount / 1e6}
                  onChange={(e) => setBidAmount(Math.round(Number(e.target.value) * 1e6))}
                  className="mt-2"
                />
                <p className="mt-1 text-center text-lg font-black text-gold">
                  €{(bidAmount / 1_000_000).toFixed(1)}M
                </p>
                <button onClick={submitBid} className="btn-gold mt-3 w-full text-sm">Submit Bid</button>
              </div>
            )}

            {negStep === "contract" && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="stat-label">Weekly wage (€k)</label>
                  <input
                    type="range"
                    min={Math.round(negotiating.contract.weeklyWage * 0.5 / 1000)}
                    max={Math.round(negotiating.contract.weeklyWage * 4 / 1000)}
                    step={1}
                    value={Math.round(wage / 1000)}
                    onChange={(e) => setWage(Number(e.target.value) * 1000)}
                    className="mt-2"
                  />
                  <p className="text-center text-sm font-bold">€{(wage / 1000).toFixed(1)}k/w</p>
                </div>
                <div>
                  <label className="stat-label">Contract length</label>
                  <div className="mt-1.5 flex gap-2">
                    {[1, 2, 3, 4, 5].map((y) => (
                      <button key={y} onClick={() => setYears(y)}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${years === y ? "bg-gold text-navy" : "bg-card border border-white/10 text-white/60"}`}>
                        {y}y
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => void submitContract()} className="btn-gold w-full text-sm">
                  Agree Personal Terms
                </button>
              </div>
            )}

            {negStep === "done" && (
              <button onClick={() => void closeNeg()} className="btn-gold mt-4 w-full text-sm">Nice!</button>
            )}

            {negMsg && <p className="mt-3 rounded-lg bg-card p-2 text-center text-xs text-white/70">{negMsg}</p>}
            <p className="mt-2 text-center text-[10px] text-white/40">
              Your budget: €{(club.budget / 1_000_000).toFixed(1)}M
            </p>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}
