import { aud, pct } from "@/lib/format";
import type { KpiTotals } from "@/lib/reports-aggregate";

const TONES: Record<string, string> = {
  revenue: "oklch(0.55 0.15 160)",
  cost: "oklch(0.50 0.05 250)",
  margin: "oklch(0.60 0.18 50)",
  gp: "oklch(0.58 0.16 290)",
  brand: "var(--brand)",
  marginTarget: "oklch(0.60 0.18 50)",
};

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONES;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="t-stat" style={{ color: TONES[tone] }}>{value}</div>
      <div className="t-stat-label">{label}</div>
      {hint ? <div className="text-[10px] uppercase tracking-wider text-meta">{hint}</div> : null}
    </div>
  );
}

export function KpiBand({ kpis }: { kpis: KpiTotals }) {
  const has = kpis.reportCount > 0;
  return (
    <div className="hairline pt-6 grid grid-cols-2 md:grid-cols-6 gap-x-6 gap-y-8 md:gap-8">
      <Stat label="Revenue" value={has ? aud(kpis.revenue) : "—"} tone="revenue" />
      <Stat label="Cost" value={has ? aud(kpis.cost) : "—"} tone="cost" />
      <Stat label="Margin (GP)" value={has ? aud(kpis.margin) : "—"} tone="margin" />
      <Stat label="GP %" value={kpis.gpPct == null ? "—" : pct(kpis.gpPct)} tone="gp" />
      <Stat
        label="Revenue vs target"
        value={kpis.productivityPct == null ? "—" : pct(kpis.productivityPct)}
        tone="brand"
        hint="Productivity"
      />
      <Stat
        label="Margin vs target"
        value={kpis.marginVsTargetPct == null ? "—" : pct(kpis.marginVsTargetPct)}
        tone="marginTarget"
        hint="Profitability"
      />
    </div>
  );
}
