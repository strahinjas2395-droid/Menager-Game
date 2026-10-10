"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import {
  BOOLEAN_INSTRUCTIONS,
  CHOICE_INSTRUCTIONS,
  INSTRUCTION_CATEGORIES,
  instructionApplies,
  type InstructionCategory,
} from "@/engine/instructionCatalog";
import type { TacticalDirectives } from "@/types";

interface Props {
  scope: "team" | "player";
  value?: TacticalDirectives;
  onChange: (value: TacticalDirectives) => void;
  position?: string;
  compact?: boolean;
}

const hasOwn = (value: TacticalDirectives | undefined, key: string) =>
  Object.prototype.hasOwnProperty.call(value ?? {}, key);

export default function StructuredInstructionEditor({
  scope,
  value = {},
  onChange,
  position,
  compact = false,
}: Props) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const activeCount = [...BOOLEAN_INSTRUCTIONS, ...CHOICE_INSTRUCTIONS]
    .filter((entry) => hasOwn(value, entry.key)).length;

  const matchingCategories = useMemo(() => {
    const map = new Map<InstructionCategory, {
      booleans: typeof BOOLEAN_INSTRUCTIONS[number][];
      choices: typeof CHOICE_INSTRUCTIONS[number][];
    }>();
    for (const category of INSTRUCTION_CATEGORIES) {
      const matches = (entry: {
        label: string;
        description: string;
        category: InstructionCategory;
        options?: readonly { label: string; description: string }[];
        onDescription?: string;
        offDescription?: string;
      }) => {
        const searchable = [
          entry.label,
          entry.description,
          entry.onDescription,
          entry.offDescription,
          ...(entry.options ?? []).flatMap((entryOption) => [entryOption.label, entryOption.description]),
        ].filter(Boolean).join(" ").toLowerCase();
        return entry.category === category && (!normalized || searchable.includes(normalized));
      };
      const booleans = BOOLEAN_INSTRUCTIONS.filter((entry) =>
        matches(entry) && instructionApplies(entry, scope, position));
      const choices = CHOICE_INSTRUCTIONS.filter((entry) =>
        matches(entry) && instructionApplies(entry, scope, position));
      if (booleans.length || choices.length) map.set(category, { booleans, choices });
    }
    return map;
  }, [normalized, position, scope]);

  const setDirective = (key: string, next: string) => {
    const updated = { ...value } as Record<string, unknown>;
    if (next === "inherit") delete updated[key];
    else if (next === "true") updated[key] = true;
    else if (next === "false") updated[key] = false;
    else updated[key] = next;
    onChange(updated as TacticalDirectives);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-navy/55 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gold">
            Full instruction catalogue
          </p>
          <p className="mt-0.5 text-[8px] leading-relaxed text-white/35">
            {scope === "player"
              ? "Explicit choices override role, team plan and interpreted text."
              : "Explicit choices override interpreted team text; players may override them."}
          </p>
        </div>
        <button
          type="button"
          disabled={!activeCount}
          onClick={() => onChange({})}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[8px] font-bold text-white/45 disabled:opacity-30"
        >
          <RotateCcw size={10} /> Reset {activeCount || ""}
        </button>
      </div>

      <label className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/10 bg-card px-2">
        <Search size={11} className="text-white/30" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find movement, crossing, pressing, keeper…"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[9px] text-white outline-none placeholder:text-white/25"
        />
      </label>

      <div className={`${compact ? "mt-2 space-y-1" : "mt-2 space-y-1.5"}`}>
        {[...matchingCategories].map(([category, entries], categoryIndex) => {
          const categoryActive = [...entries.booleans, ...entries.choices]
            .filter((entry) => hasOwn(value, entry.key)).length;
          return (
            <details
              key={category}
              open={Boolean(normalized) || (!compact && categoryIndex === 0)}
              className="group rounded-lg border border-white/[0.07] bg-card/80"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between px-2.5 py-2 text-[9px] font-black uppercase tracking-wider text-white/65">
                <span>{category}</span>
                <span className={categoryActive ? "text-gold" : "text-white/25"}>
                  {categoryActive ? `${categoryActive} set` : `${entries.booleans.length + entries.choices.length}`}
                </span>
              </summary>
              <div className="border-t border-white/[0.06] px-2 pb-2">
                {entries.booleans.map((entry) => {
                  const current = hasOwn(value, entry.key)
                    ? String((value as Record<string, unknown>)[entry.key])
                    : "inherit";
                  return (
                    <label key={entry.key} className="flex items-center gap-2 border-b border-white/[0.05] py-1.5 last:border-0">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[9px] font-bold text-white/75">{entry.label}</span>
                        {!compact && <span className="block text-[8px] leading-snug text-white/30">{entry.description}</span>}
                      </span>
                      <select
                        aria-label={entry.label}
                        value={current}
                        onChange={(event) => setDirective(entry.key, event.target.value)}
                        className={`w-[86px] shrink-0 rounded-md border px-1.5 py-1 text-[8px] font-bold outline-none ${
                          current === "inherit"
                            ? "border-white/10 bg-navy text-white/40"
                            : current === "true"
                              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                              : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                        }`}
                      >
                        <option value="inherit">Inherit</option>
                        <option value="true">Do it</option>
                        <option value="false">Don't</option>
                      </select>
                    </label>
                  );
                })}
                {entries.choices.map((entry) => {
                  const current = typeof (value as Record<string, unknown>)[entry.key] === "string"
                    ? String((value as Record<string, unknown>)[entry.key])
                    : "inherit";
                  return (
                    <label key={entry.key} className="flex items-center gap-2 border-b border-white/[0.05] py-1.5 last:border-0">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[9px] font-bold text-white/75">{entry.label}</span>
                        {!compact && <span className="block text-[8px] leading-snug text-white/30">{entry.description}</span>}
                      </span>
                      <select
                        aria-label={entry.label}
                        value={current}
                        onChange={(event) => setDirective(entry.key, event.target.value)}
                        className={`w-[108px] shrink-0 rounded-md border px-1.5 py-1 text-[8px] font-bold outline-none ${
                          current === "inherit" ? "border-white/10 bg-navy text-white/40" : "border-gold/30 bg-gold/10 text-gold"
                        }`}
                      >
                        <option value="inherit">Inherit</option>
                        {entry.options.map((entryOption) => (
                          <option key={entryOption.value} value={entryOption.value}>{entryOption.label}</option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </details>
          );
        })}
        {!matchingCategories.size && (
          <p className="py-3 text-center text-[9px] text-white/35">No instruction matches “{query}”.</p>
        )}
      </div>
    </div>
  );
}
