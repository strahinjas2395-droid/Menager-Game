"use client";

import { useRef } from "react";

/**
 * StepDots — a slider made of tappable dots on a line.
 * Replaces <input type="range"> where the steps are discrete and few
 * (tactics instructions, settings volumes).
 */
export interface StepDotsProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  startLabel?: string;
  endLabel?: string;
  ariaLabel?: string;
}

function roundTo(value: number, step: number): number {
  const decimals = step < 1 ? String(step).split(".")[1]?.length ?? 0 : 0;
  return Number(value.toFixed(decimals));
}

export default function StepDots({
  value,
  min,
  max,
  step = 1,
  onChange,
  startLabel,
  endLabel,
  ariaLabel,
}: StepDotsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const steps: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) steps.push(roundTo(v, step));
  const span = max - min || 1;

  const pickAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const idx = Math.round(t * (steps.length - 1));
    onChange(steps[idx]);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const i = steps.findIndex((s) => Math.abs(s - value) < 1e-9);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(steps[Math.max(0, (i < 0 ? 0 : i) - 1)]);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(steps[Math.min(steps.length - 1, (i < 0 ? 0 : i) + 1)]);
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(steps[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(steps[steps.length - 1]);
    }
  };

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          pickAt(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) pickAt(e.clientX);
        }}
        className="relative h-9 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
      >
        {/* line */}
        <span className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/15" />
        {/* filled portion */}
        <span
          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gold/70"
          style={{ width: `${((value - min) / span) * 100}%` }}
        />
        {/* dots */}
        {steps.map((s) => {
          const active = Math.abs(s - value) < 1e-9;
          const left = ((s - min) / span) * 100;
          return (
            <span
              key={s}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-150 ${
                active
                  ? "h-4 w-4 bg-gold shadow-[0_0_0_3px_rgba(26,26,46,1),0_0_10px_rgba(240,165,0,0.55)]"
                  : "h-2.5 w-2.5 border border-white/25 bg-white/40 hover:bg-white/70"
              }`}
              style={{ left: `${left}%` }}
            />
          );
        })}
      </div>
      {(startLabel || endLabel) && (
        <div className="mt-0.5 flex justify-between text-[9px] text-white/35">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </div>
      )}
    </div>
  );
}
