import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/setup/")({
  head: () => ({ meta: [{ title: "Project setup — PACC HQ" }] }),
  component: SetupPage,
});

const TABS = ["Contract", "Portions", "BOQ", "Pits", "Crew", "Plant", "Variation clauses", "Triggers", "Supervisors"] as const;

function SetupPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<typeof TABS[number]>("Contract");
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ["project-active"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*").eq("active", true).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: portions = [] } = useQuery({
    queryKey: ["setup-portions", project?.id],
    enabled: !!project?.id,
    queryFn: async () => (await supabase.from("separable_portions").select("*").eq("project_id", project!.id)).data ?? [],
  });
  const { data: boq = [] } = useQuery({
    queryKey: ["setup-boq", project?.id],
    enabled: !!project?.id,
    queryFn: async () => (await supabase.from("boq_lines").select("*").eq("project_id", project!.id).limit(500)).data ?? [],
  });
  const { data: pits = [] } = useQuery({
    queryKey: ["setup-pits", project?.id],
    enabled: !!project?.id,
    queryFn: async () => (await supabase.from("pits").select("*").eq("project_id", project!.id).limit(500)).data ?? [],
  });
  const { data: crew = [] } = useQuery({
    queryKey: ["setup-crew", project?.id],
    enabled: !!project?.id,
    queryFn: async () => (await supabase.from("crew_members").select("*").eq("project_id", project!.id)).data ?? [],
  });
  const { data: plant = [] } = useQuery({
    queryKey: ["setup-plant", project?.id],
    enabled: !!project?.id,
    queryFn: async () => (await supabase.from("plant_items").select("*").eq("project_id", project!.id)).data ?? [],
  });
  const { data: clauses = [] } = useQuery({
    queryKey: ["setup-clauses", project?.id],
    enabled: !!project?.id,
    queryFn: async () => (await supabase.from("variation_clauses").select("*").eq("project_id", project!.id)).data ?? [],
  });
  const { data: triggers = [] } = useQuery({
    queryKey: ["setup-triggers", project?.id],
    enabled: !!project?.id,
    queryFn: async () => (await supabase.from("variation_triggers").select("*").eq("project_id", project!.id)).data ?? [],
  });
  const { data: supers = [] } = useQuery({
    queryKey: ["setup-supers", project?.id],
    enabled: !!project?.id,
    queryFn: async () => (await supabase.from("supervisors").select("*").eq("project_id", project!.id)).data ?? [],
  });

  const importJson = useMutation({
    mutationFn: async (json: any) => {
      // Upsert project
      const projPayload: any = {
        code: json.code ?? json.project_code ?? "PROJECT",
        name: json.name ?? json.project_name ?? "Untitled project",
        head_contractor: json.head_contractor ?? "—",
        principal: json.principal,
        package: json.package,
        contract_date: json.contract_date,
        contract_type: json.contract_type,
        site_address: json.site_address,
        working_days: json.working_days,
        working_hours_start: json.working_hours_start,
        working_hours_end: json.working_hours_end,
        defects_liability_period_months: json.defects_liability_period_months,
        max_daily_delay_costs_aud: json.max_daily_delay_costs_aud,
        max_total_delay_costs_pct_of_contract: json.max_total_delay_costs_pct_of_contract,
        liquidated_damages_cap_pct_of_contract: json.liquidated_damages_cap_pct_of_contract,
        pacc_rep: json.pacc_rep,
        head_contractor_rep: json.head_contractor_rep,
        additional_qualifying_causes_of_delay: json.additional_qualifying_causes_of_delay,
        payment_claim_dates: json.payment_claim_dates,
        payment_claim_method: json.payment_claim_method,
        raw_contract_json: json,
        active: true,
      };
      let projectId = project?.id;
      if (projectId) {
        await supabase.from("projects").update(projPayload).eq("id", projectId);
      } else {
        const { data } = await supabase.from("projects").insert(projPayload).select("id").single();
        projectId = data!.id;
      }
      const pid = projectId!;

      const insertList = async (table: string, rows: any[]) => {
        if (!rows?.length) return;
        await supabase.from(table as any).delete().eq("project_id", pid);
        await supabase.from(table as any).insert(rows.map((r) => ({ ...r, project_id: pid })));
      };

      await insertList("separable_portions", json.separable_portions ?? []);
      await insertList("boq_lines", json.boq_lines ?? json.boq ?? []);
      await insertList("pits", (json.pits ?? []).map((p: any) => typeof p === "string" ? { pit_id: p } : p));
      await insertList("variation_clauses", json.variation_clauses ?? []);
      await insertList("variation_triggers", json.variation_triggers ?? []);
    },
    onSuccess: () => {
      setMsg("Contract imported.");
      qc.invalidateQueries();
    },
    onError: (e: any) => setMsg(`Import failed: ${e.message ?? e}`),
    onSettled: () => setImporting(false),
  });

  const onFile = async (file: File) => {
    setImporting(true);
    setMsg(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      importJson.mutate(json);
    } catch (e: any) {
      setMsg(`Could not parse JSON: ${e.message}`);
      setImporting(false);
    }
  };

  return (
    <SiteShell section="Project setup">
      <header className="mb-8 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="t-eyebrow">Configuration</div>
          <h1 className="t-display mt-2">{project?.name ?? "No project yet"}</h1>
          {project && <p className="t-lead mt-3">{project.code} · {project.head_contractor}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="text-xs uppercase tracking-[0.16em] font-semibold bg-[color:var(--brand)] text-white px-4 py-2 hover:bg-[color:var(--brand-deep)] transition disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import contract JSON"}
          </button>
          {msg && <p className="text-xs text-meta">{msg}</p>}
        </div>
      </header>

      <nav className="hairline pt-4 flex gap-6 flex-wrap mb-8">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs uppercase tracking-[0.16em] font-semibold pb-2 ${
              tab === t ? "text-[color:var(--brand)] border-b-2 border-[color:var(--brand)]" : "text-meta"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Contract" && project && (
        <>
          <ProjectTypeToggle project={project} onChange={() => qc.invalidateQueries()} />
          <KeyValue rows={[
            ["Code", project.code],
            ["Project type", project.project_type === "piling_labour" ? "Piling — labour hire" : "Drainage"],
            ["Head contractor", project.head_contractor],
            ["Principal", project.principal],
            ["Package", project.package],
            ["Contract date", shortDate(project.contract_date)],
            ["Contract type", project.contract_type],
            ["Site address", project.site_address],
            ["Working hours", `${project.working_hours_start ?? "?"} – ${project.working_hours_end ?? "?"}`],
            ["Defects liability", project.defects_liability_period_months ? `${project.defects_liability_period_months} months` : "—"],
            ["LD cap", project.liquidated_damages_cap_pct_of_contract ? `${project.liquidated_damages_cap_pct_of_contract}%` : "—"],
          ]} />
        </>
      )}

      {tab === "Portions" && <SimpleTable rows={portions} cols={[["code","Code"],["name","Name"],["commencement","Start",shortDate],["completion","Finish",shortDate],["ld_per_day_aud","LD/day"]]} />}
      {tab === "BOQ" && <SimpleTable rows={boq} cols={[["ref","Ref"],["category","Category"],["description","Description"],["unit","Unit"],["rate","Rate"]]} />}
      {tab === "Pits" && <SimpleTable rows={pits} cols={[["pit_id","Pit"],["separable_portion_code","SP"],["status","Status"]]} />}
      {tab === "Crew" && <SimpleTable rows={crew} cols={[["name","Name"],["role","Role"],["cost_rate_nt","NT rate"],["cost_rate_ot","OT rate"]]} />}
      {tab === "Plant" && <SimpleTable rows={plant} cols={[["plant_id_code","ID"],["description","Description"],["tonnage_class","Class"],["cost_rate_nt","NT rate"],["cost_rate_ot","OT rate"]]} />}
      {tab === "Variation clauses" && <SimpleTable rows={clauses} cols={[["claim_type","Type"],["clause_ref","Clause"],["notice_deadline_bd","Notice BD"],["full_report_deadline_bd","Full report BD"]]} />}
      {tab === "Triggers" && <SimpleTable rows={triggers} cols={[["claim_type","Type"],["clause_ref","Clause"],["keywords","Keywords",(v:any)=>Array.isArray(v)?v.join(", "):v]]} />}
      {tab === "Supervisors" && <SimpleTable rows={supers} cols={[["name","Name"],["slack_user_id","Slack ID"],["email","Email"],["active","Active",(v:any)=>v?"Yes":"No"]]} />}

      {!project && (
        <p className="text-xs text-meta">Import the MVRC contract JSON to get started. The button is in the top right.</p>
      )}
    </SiteShell>
  );
}

function KeyValue({ rows }: { rows: [string, any][] }) {
  return (
    <div className="hairline pt-4 grid md:grid-cols-2 gap-x-12 gap-y-3">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-2 gap-4 py-2 border-b border-rule">
          <span className="t-stat-label self-center">{k}</span>
          <span className="text-xs">{v ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

type Col = [string, string] | [string, string, (v: any) => string];
function SimpleTable({ rows, cols }: { rows: any[]; cols: Col[] }) {
  if (!rows.length) return <p className="text-xs text-meta">Nothing yet.</p>;
  return (
    <div className="hairline pt-4 overflow-x-auto">
      <table className="w-full text-left">
        <thead><tr className="t-stat-label">{cols.map((c) => <th key={c[1]} className="py-2 font-semibold">{c[1]}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-rule">
              {cols.map((c) => <td key={c[0]} className="py-3 text-xs">{c[2] ? c[2](r[c[0]]) : (r[c[0]] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectTypeToggle({ project, onChange }: { project: any; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const current = project.project_type ?? "drainage";
  async function setType(t: "drainage" | "piling_labour") {
    if (t === current) return;
    setBusy(true);
    await supabase.from("projects").update({ project_type: t }).eq("id", project.id);
    setBusy(false);
    onChange();
  }
  return (
    <div className="hairline pt-4 mb-6 flex items-center gap-3">
      <span className="t-stat-label">Project type</span>
      <div className="inline-flex border border-rule rounded overflow-hidden">
        {([["drainage", "Drainage"], ["piling_labour", "Piling — labour hire"]] as const).map(([k, l]) => (
          <button
            key={k}
            disabled={busy}
            onClick={() => setType(k)}
            className={`text-xs uppercase tracking-[0.14em] font-semibold px-3 py-1.5 ${current === k ? "bg-[color:var(--brand)] text-white" : "text-meta hover:text-ink"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

