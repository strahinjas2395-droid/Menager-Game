"use client";

import type { TacticalEvent } from "@/types";

const COLORS: Record<string, string> = {
  pass: "#93c5fd",
  throughBall: "#f0a500",
  cross: "#c084fc",
  carry: "#5eead4",
  dribble: "#2dd4bf",
  shot: "#fb7185",
  tackle: "#facc15",
  interception: "#4ade80",
  recovery: "#22c55e",
  foul: "#f87171",
  save: "#38bdf8",
  clearance: "#d1d5db",
};

export default function TacticalEventMap({
  events,
  label,
}: {
  events: readonly TacticalEvent[];
  label: string;
}) {
  const visible = events.slice(-140);
  return (
    <figure>
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#17633c]">
        <svg viewBox="0 0 1000 650" role="img" aria-label={label} className="block h-auto w-full">
          <rect x="8" y="8" width="984" height="634" fill="none" stroke="rgba(255,255,255,.58)" strokeWidth="4" />
          <line x1="500" y1="8" x2="500" y2="642" stroke="rgba(255,255,255,.45)" strokeWidth="3" />
          <circle cx="500" cy="325" r="91" fill="none" stroke="rgba(255,255,255,.42)" strokeWidth="3" />
          <rect x="8" y="124" width="165" height="402" fill="none" stroke="rgba(255,255,255,.42)" strokeWidth="3" />
          <rect x="827" y="124" width="165" height="402" fill="none" stroke="rgba(255,255,255,.42)" strokeWidth="3" />
          <rect x="8" y="235" width="58" height="180" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="3" />
          <rect x="934" y="235" width="58" height="180" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="3" />
          {visible.map((event) => {
            const color = COLORS[event.type] ?? "#ffffff";
            const failed = ["failed", "lost", "wide", "blocked"].includes(event.outcome);
            return (
              <g key={event.id} opacity={failed ? 0.45 : 0.82}>
                {event.endX !== undefined && event.endY !== undefined && (
                  <line
                    x1={event.x}
                    y1={event.y}
                    x2={event.endX}
                    y2={event.endY}
                    stroke={color}
                    strokeWidth={event.type === "shot" ? 5 : 2.4}
                    strokeDasharray={failed ? "10 8" : undefined}
                  />
                )}
                <circle
                  cx={event.endX ?? event.x}
                  cy={event.endY ?? event.y}
                  r={event.type === "shot" ? 8 : 5}
                  fill={color}
                  stroke="rgba(0,0,0,.45)"
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[8px] uppercase tracking-wide text-white/40">
        {Object.entries(COLORS).slice(0, 9).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />{humanize(type)}</span>
        ))}
      </figcaption>
    </figure>
  );
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}
