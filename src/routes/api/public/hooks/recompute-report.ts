import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { persistComputedReport, notifyDirectorOnWrap } from "@/lib/evening-summary/persist";

const MELB_TZ = "Australia/Melbourne";

function melbDateISO(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MELB_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

export const Route = createFileRoute("/api/public/hooks/recompute-report")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const date = url.searchParams.get("date") ?? melbDateISO();
        const supervisorId = url.searchParams.get("supervisor_id") ?? undefined;
        const dryRun = url.searchParams.get("dry_run") === "1";
        const notify = url.searchParams.get("notify") === "1";

        let q = supabaseAdmin
          .from("daily_reports")
          .select("id, supervisor_id, project_id, complete, supervisors(name)")
          .eq("report_date", date);
        if (supervisorId) q = q.eq("supervisor_id", supervisorId);
        const { data: rows, error } = await q;
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        if (!rows || rows.length === 0) {
          return Response.json({ ok: false, error: `no daily_reports for ${date}` }, { status: 404 });
        }

        const results: any[] = [];
        for (const r of rows) {
          try {
            if (dryRun) {
              const { computeReport } = await import("@/lib/evening-summary/compute");
              const computed = await computeReport(r.id);
              results.push({ report_id: r.id, dry_run: true, computed });
              continue;
            }
            const computed = await persistComputedReport(r.id);
            let dm: any = null;
            if (notify) {
              const { count: vfCount } = await supabaseAdmin
                .from("variation_flags")
                .select("id", { count: "exact", head: true })
                .eq("daily_report_id", r.id);
              const siteOrigin = process.env.SITE_ORIGIN ?? `${url.protocol}//${url.host}`;
              await notifyDirectorOnWrap({
                reportId: r.id,
                projectId: r.project_id as string,
                supervisorName: (r as any).supervisors?.name ?? "Crew",
                productivityPct: computed.productivity_pct,
                variationCount: vfCount ?? 0,
                siteOrigin,
              });
              dm = { sent: true, variations: vfCount ?? 0 };
            }
            results.push({ report_id: r.id, computed, dm });
          } catch (e) {
            results.push({ report_id: r.id, error: (e as Error).message });
          }
        }

        return Response.json({ ok: true, date, count: results.length, results });
      },
    },
  },
});
