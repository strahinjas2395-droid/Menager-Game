import { MATCH_HEATMAP_COLUMNS, MATCH_HEATMAP_ROWS } from "@/types";

export default function PlayerHeatmap({
  values,
  playerName,
}: {
  values: number[];
  playerName: string;
}) {
  const cells = Array.from(
    { length: MATCH_HEATMAP_COLUMNS * MATCH_HEATMAP_ROWS },
    (_, index) => Math.max(0, values[index] ?? 0),
  );
  const max = Math.max(1, ...cells);
  return (
    <div>
      <div
        className="relative aspect-[100/65] w-full overflow-hidden rounded-xl border-2 border-white/25 bg-[#174f36] shadow-inner"
        role="img"
        aria-label={`${playerName} positional heatmap, attacking from left to right`}
      >
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${MATCH_HEATMAP_COLUMNS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${MATCH_HEATMAP_ROWS}, minmax(0, 1fr))`,
          }}
        >
          {cells.map((value, index) => {
            const intensity = value / max;
            const alpha = value === 0 ? 0 : 0.12 + Math.pow(intensity, 0.68) * 0.78;
            return (
              <span
                key={index}
                title={`${value} position samples`}
                style={{
                  background: `radial-gradient(circle, rgba(255,71,87,${alpha.toFixed(3)}) 0%, rgba(240,165,0,${(alpha * 0.78).toFixed(3)}) 56%, rgba(240,165,0,0) 100%)`,
                }}
              />
            );
          })}
        </div>
        <span className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-white/35" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-[28%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/45" />
        <span className="pointer-events-none absolute -left-px top-1/2 h-[48%] w-[16%] -translate-y-1/2 border border-l-0 border-white/35" />
        <span className="pointer-events-none absolute -right-px top-1/2 h-[48%] w-[16%] -translate-y-1/2 border border-r-0 border-white/35" />
        <span className="pointer-events-none absolute -left-px top-1/2 h-[22%] w-[6%] -translate-y-1/2 border border-l-0 border-white/35" />
        <span className="pointer-events-none absolute -right-px top-1/2 h-[22%] w-[6%] -translate-y-1/2 border border-r-0 border-white/35" />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[9px] uppercase tracking-wide text-white/35">
        <span>Own goal</span><span className="text-gold/70">Attacking direction →</span><span>Opposition goal</span>
      </div>
    </div>
  );
}
