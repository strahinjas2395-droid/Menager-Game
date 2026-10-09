import type { TacticalInstructionInterpretation } from "@/types";

/** Inspectable result shared by pre-match and live tactical editors. */
export default function InstructionInterpretationView({
  text,
  interpretation,
  stale,
  compact = false,
}: {
  text: string;
  interpretation?: TacticalInstructionInterpretation;
  stale: boolean;
  compact?: boolean;
}) {
  const bodyText = compact ? "text-[9px]" : "text-[10px]";
  if (!text.trim()) {
    return <p className={`mt-2 ${bodyText} text-white/35`}>No instruction — follows the configured team system.</p>;
  }
  if (!interpretation) {
    return (
      <div className={`mt-2 rounded-lg border border-white/10 bg-navy/70 px-2.5 py-2 ${bodyText} text-white/45`}>
        {stale
          ? "Text changed — ask AI to reinterpret it, or Apply/Save to do that automatically."
          : "Not interpreted yet — Apply/Save will ask AI first."}
      </div>
    );
  }

  const isAI = interpretation.source === "ai";
  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-2 ${isAI ? "border-gold/25 bg-gold/5" : "border-amber-400/30 bg-amber-400/5"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[8px] font-black uppercase tracking-wide ${isAI ? "text-gold" : "text-amber-300"}`}>
          {isAI ? "AI understood" : "Basic offline fallback"}
        </span>
        <span className="truncate text-[8px] text-white/25">{isAI ? interpretation.model : "re-interpret when online"}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {interpretation.understood.length ? interpretation.understood.map((label, index) => (
          <span key={`${label}-${index}`} className={`${compact ? "text-[8px]" : "text-[9px]"} rounded-full border border-gold/25 bg-gold/10 px-2 py-1 font-semibold text-gold`}>
            {label}
          </span>
        )) : (
          <span className={`${compact ? "text-[8px]" : "text-[9px]"} text-white/40`}>No supported tactical behavior was inferred.</span>
        )}
      </div>
      {interpretation.unsupported.length > 0 && (
        <div className="mt-2 border-t border-red-300/15 pt-1.5">
          <div className="text-[8px] font-black uppercase tracking-wide text-red-300/80">Could not apply</div>
          {interpretation.unsupported.map((item, index) => (
            <p key={`${item}-${index}`} className={`${compact ? "text-[8px]" : "text-[9px]"} mt-0.5 leading-relaxed text-red-200/70`}>• {item}</p>
          ))}
        </div>
      )}
    </div>
  );
}
