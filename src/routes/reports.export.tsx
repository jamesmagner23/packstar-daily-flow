import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import {
  type DateRange,
  type RangeKind,
  getWeekRange,
  getMonthRange,
  rangeForKind,
  formatRangeLabel,
} from "@/lib/date-range";

export const Route = createFileRoute("/reports/export")({
  head: () => ({ meta: [{ title: "Export reports — PACC HQ" }] }),
  component: ExportReports,
});

type Kind = "project" | "crew" | "plant" | "all";

function ExportReports() {
  const [kind, setKind] = useState<Kind>("project");
  const [rangeKind, setRangeKind] = useState<RangeKind>("week");
  const [range, setRange] = useState<DateRange>(() => getWeekRange());
  const [projectId, setProjectId] = useState<string>("");
  const [crewName, setCrewName] = useState<string>("");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-all-active"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, code, name").eq("active", true).order("code");
      return data ?? [];
    },
  });

  const { data: crews = [] } = useQuery({
    queryKey: ["crew-all", projectId],
    queryFn: async () => {
      let q = supabase.from("crew_members").select("name, project_id").eq("active", true).order("name");
      if (projectId) q = q.eq("project_id", projectId);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Default project once loaded
  useMemo(() => {
    if (!projectId && projects.length > 0) setProjectId(projects[0].id as string);
  }, [projects, projectId]);

  function setRangeKindAndRange(k: RangeKind) {
    setRangeKind(k);
    if (k === "week") setRange(getWeekRange());
    else if (k === "month") setRange(getMonthRange());
    else setRange(rangeForKind(k));
  }

  const url = useMemo(() => {
    const params = new URLSearchParams({ kind, from: range.from, to: range.to });
    if ((kind === "project" || kind === "crew" || kind === "plant") && projectId) {
      params.set("projectId", projectId);
    }
    if (kind === "crew" && crewName) params.set("crewName", crewName);
    return `/api/public/reports/pdf?${params.toString()}`;
  }, [kind, range, projectId, crewName]);

  const needsProject = kind === "project" || kind === "crew" || kind === "plant";
  const showCrew = kind === "crew";

  return (
    <SiteShell section="Reports">
      <header className="mb-10">
        <div className="t-eyebrow">Export</div>
        <h1 className="t-display mt-2">Printable reports</h1>
        <p className="t-lead mt-3">Download a PDF for any range — by project, crew, or plant & hire.</p>
        <Link to="/reports" className="t-eyebrow text-meta mt-4 inline-block">← Back to reports</Link>
      </header>

      <div className="hairline pt-6 space-y-8 max-w-3xl">
        {/* Type */}
        <Field label="Report type">
          <div className="flex flex-wrap gap-2">
            {(["project", "crew", "plant", "all"] as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-3 py-1.5 text-xs border ${
                  kind === k ? "border-[color:var(--brand)] text-[color:var(--brand)]" : "border-rule text-meta hover:text-foreground"
                }`}
              >
                {labelForKind(k)}
              </button>
            ))}
          </div>
        </Field>

        {/* Range */}
        <Field label="Range">
          <div className="flex flex-wrap items-center gap-3">
            {(["week", "month"] as RangeKind[]).map((rk) => (
              <button
                key={rk}
                onClick={() => setRangeKindAndRange(rk)}
                className={`px-3 py-1.5 text-xs border ${
                  rangeKind === rk ? "border-[color:var(--brand)] text-[color:var(--brand)]" : "border-rule text-meta hover:text-foreground"
                }`}
              >
                {rk === "week" ? "This week" : "This month"}
              </button>
            ))}
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={range.from}
                onChange={(e) => { setRange({ ...range, from: e.target.value }); setRangeKind("custom"); }}
                className="border border-rule px-2 py-1 bg-white"
              />
              <span className="text-meta">→</span>
              <input
                type="date"
                value={range.to}
                onChange={(e) => { setRange({ ...range, to: e.target.value }); setRangeKind("custom"); }}
                className="border border-rule px-2 py-1 bg-white"
              />
            </div>
            <span className="t-eyebrow text-meta">{formatRangeLabel(rangeKind, range)}</span>
          </div>
        </Field>

        {/* Project */}
        {needsProject && (
          <Field label="Project">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="border border-rule px-2 py-1.5 text-xs bg-white min-w-72"
            >
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
              ))}
            </select>
          </Field>
        )}

        {/* Crew member */}
        {showCrew && (
          <Field label="Crew member (optional)">
            <select
              value={crewName}
              onChange={(e) => setCrewName(e.target.value)}
              className="border border-rule px-2 py-1.5 text-xs bg-white min-w-72"
            >
              <option value="">All crew</option>
              {crews.map((c: any) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}

        <div className="hairline pt-6 flex items-center gap-4">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-[color:var(--brand)] text-white text-xs uppercase tracking-wider hover:opacity-90"
          >
            Download PDF
          </a>
          <a href={url} className="t-eyebrow text-meta hover:text-foreground">Open in new tab</a>
        </div>
      </div>
    </SiteShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="t-eyebrow text-meta">{label}</div>
      {children}
    </div>
  );
}

function labelForKind(k: Kind): string {
  if (k === "project") return "By project";
  if (k === "crew") return "By crew";
  if (k === "plant") return "Plant & hire";
  return "All projects";
}
