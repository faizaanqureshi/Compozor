"use client";

import { cn } from "@/lib/utils";
import { RANGE_PRESETS, type RangePreset } from "@/lib/admin";

export function RangeToggle({
  value,
  onChange,
}: {
  value: RangePreset;
  onChange: (range: RangePreset) => void;
}) {
  return (
    <div className="inline-flex w-fit shrink-0 items-center self-start rounded-full border border-border p-0.5 text-xs font-medium">
      {RANGE_PRESETS.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => onChange(r.value)}
          className={cn(
            "rounded-full px-3 py-1 transition-colors",
            value === r.value
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
