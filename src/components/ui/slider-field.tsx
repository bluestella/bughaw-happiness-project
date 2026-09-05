"use client";

import { useState } from "react";
import { InfoTip } from "@/components/ui/tooltip";

/**
 * A labeled range slider paired with an editable text value. The number can be
 * set either by dragging the slider or by typing into the textbox. Typed values
 * are clamped to `min` but may exceed `max` (the slider pegs at its end), so
 * the range bounds stay a convenience, not a hard limit.
 */
export function SliderField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  help,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  help?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit(raw: string) {
    const n = parseFloat(raw);
    if (!isNaN(n)) onChange(Math.max(min, n));
  }

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-center gap-3 mb-2">
        <label className="text-[13px] text-ink-soft leading-snug" htmlFor={id}>
          {label}
          {help && (
            <span className="ml-1 inline-flex align-middle">
              <InfoTip text={help} label={`About ${label}`} />
            </span>
          )}
        </label>
        <span className="relative shrink-0">
          {prefix && (
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-ink-soft pointer-events-none">
              {prefix}
            </span>
          )}
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={draft ?? String(value)}
            onFocus={(e) => {
              setDraft(String(value));
              e.target.select();
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              commit(e.target.value);
            }}
            onBlur={(e) => {
              commit(e.target.value);
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
            className={`w-28 border border-line rounded-md py-1 text-right font-mono text-[13px] font-semibold bg-white focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20 ${
              prefix ? "pl-6 pr-2" : "px-2"
            } ${suffix ? "pr-8" : ""}`}
            aria-label={`${label} (type a value)`}
          />
          {suffix && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-ink-soft pointer-events-none">
              {suffix}
            </span>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => {
          setDraft(null);
          onChange(+e.target.value);
        }}
        aria-label={`${label} (slider)`}
      />
    </div>
  );
}
