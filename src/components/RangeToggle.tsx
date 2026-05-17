import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DateRange, RangeKind } from "@/lib/date-range";
import { formatRangeLabel, rangeForKind, shiftRange, toISO, fromISO } from "@/lib/date-range";

type Props = {
  kind: RangeKind;
  range: DateRange;
  onChange: (kind: RangeKind, range: DateRange) => void;
};

const KINDS: { key: RangeKind; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "custom", label: "Custom" },
];

export function RangeToggle({ kind, range, onChange }: Props) {
  const setKind = (k: RangeKind) => {
    onChange(k, k === "custom" ? range : rangeForKind(k, fromISO(range.from)));
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex border border-rule rounded-sm overflow-hidden">
        {KINDS.map((k) => {
          const active = k.key === kind;
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] border-r border-rule last:border-r-0 ${
                active
                  ? "bg-[color:var(--brand)] text-white"
                  : "bg-white text-[color:var(--meta)] hover:text-ink"
              }`}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      {kind === "custom" ? (
        <div className="flex items-center gap-2 text-xs">
          <input
            type="date"
            value={range.from}
            onChange={(e) =>
              onChange("custom", { from: e.target.value, to: range.to < e.target.value ? e.target.value : range.to })
            }
            className="border border-rule px-2 py-1 text-xs"
          />
          <span className="text-meta">to</span>
          <input
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) => onChange("custom", { from: range.from, to: e.target.value })}
            className="border border-rule px-2 py-1 text-xs"
          />
        </div>
      ) : (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(kind, shiftRange(kind, range, -1))}
            className="p-1 text-meta hover:text-ink"
            aria-label="Previous"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-xs font-semibold text-ink min-w-[8rem] text-center">
            {formatRangeLabel(kind, range)}
          </span>
          <button
            type="button"
            onClick={() => onChange(kind, shiftRange(kind, range, 1))}
            className="p-1 text-meta hover:text-ink"
            aria-label="Next"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onChange(kind, rangeForKind(kind, new Date()))}
            className="ml-2 text-[10px] uppercase tracking-[0.14em] font-semibold text-meta hover:text-[color:var(--brand)]"
          >
            Today
          </button>
        </div>
      )}
    </div>
  );
}

// re-export so consumers don't need a second import
export { toISO };
