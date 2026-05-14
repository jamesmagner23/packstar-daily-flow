import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeReport } from "@/lib/evening-summary/compute";
import { renderHtml, buildSubject, type VariationFlag } from "@/lib/evening-summary/render";

const DEFAULT_RECIPIENT = "james.magner@paccvictoria.com";
const DEFAULT_PROJECT_SHORT = "MVRC";

function melbDateISO(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; provider: string; id?: string; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const from = process.env.REPORT_SENDER_EMAIL ?? "PACC Reports <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
      });
      const data: any = await res.json();
      if (!res.ok) return { ok: false, provider: "resend", error: data?.message ?? `HTTP ${res.status}` };
      return { ok: true, provider: "resend", id: data?.id };
    } catch (e) {
      return { ok: false, provider: "resend", error: (e as Error).message };
    }
  }
  return { ok: false, provider: "none", error: "No email provider configured. Set RESEND_API_KEY or wire Lovable Email." };
}

export const Route = createFileRoute("/api/public/hooks/run-evening-summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const dateParam = url.searchParams.get("date") ?? melbDateISO();
        const supervisorIdParam = url.searchParams.get("supervisor_id");
        const dryRun = url.searchParams.get("dry_run") === "1";
        const recipient = process.env.REPORT_RECIPIENT_EMAIL ?? DEFAULT_RECIPIENT;

        // Locate the daily_report
        let q = supabaseAdmin.from("daily_reports").select("*").eq("report_date", dateParam);
        if (supervisorIdParam) q = q.eq("supervisor_id", supervisorIdParam);
        const { data: reports, error: repErr } = await q;
        if (repErr) return Response.json({ ok: false, error: repErr.message }, { status: 500 });
        if (!reports || reports.length === 0) {
          return Response.json({ ok: false, error: `No daily_report for date=${dateParam}${supervisorIdParam ? " supervisor_id=" + supervisorIdParam : ""}` }, { status: 404 });
        }
        if (reports.length > 1 && !supervisorIdParam) {
          return Response.json({ ok: false, error: "Multiple reports on this date. Pass supervisor_id." }, { status: 400 });
        }
        const report = reports[0];

        // Project + supervisor + variation_flags in parallel
        const [{ data: project }, { data: supervisor }, { data: flags }] = await Promise.all([
          supabaseAdmin.from("projects").select("name, code").eq("id", report.project_id).single(),
          supabaseAdmin.from("supervisors").select("name").eq("id", report.supervisor_id).single(),
          supabaseAdmin.from("variation_flags")
            .select("id, claim_type, clause_ref, trigger_phrase, status, deadline_at, notice_deadline_bd, duration_impact_hours, symal_rep_saw")
            .eq("daily_report_id", report.id)
            .order("created_at", { ascending: true }),
        ]);

        // Compute
        const computed = await computeReport(report.id);

        // Persist computed numbers
        await supabaseAdmin.from("daily_reports").update({
          revenue_aud: computed.revenue_aud,
          cost_aud: computed.cost_aud,
          margin_aud: computed.margin_aud,
          productivity_pct: computed.productivity_pct,
        }).eq("id", report.id);

        const dashboardBaseUrl = url.origin;
        const renderInput = {
          projectName: project?.name ?? "Project",
          projectShortCode: deriveShortCode(project?.code, project?.name) ?? DEFAULT_PROJECT_SHORT,
          reportDate: dateParam,
          supervisorName: supervisor?.name ?? "Supervisor",
          computed,
          variationFlags: (flags ?? []) as VariationFlag[],
          productivityNote: report.productivity_note ?? null,
          rawTranscript: report.raw_transcript ?? null,
          dashboardBaseUrl,
        };

        const subject = buildSubject(renderInput);
        const html = renderHtml(renderInput);

        if (dryRun) {
          return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "x-summary-subject": subject } });
        }

        const sendResult = await sendEmail({ to: recipient, subject, html });
        if (sendResult.ok) {
          await supabaseAdmin.from("daily_reports").update({ email_sent_at: new Date().toISOString() }).eq("id", report.id);
        }

        return Response.json({
          ok: sendResult.ok,
          provider: sendResult.provider,
          message_id: sendResult.id,
          error: sendResult.error,
          subject,
          recipient,
          report_id: report.id,
          computed: {
            revenue_aud: computed.revenue_aud,
            cost_aud: computed.cost_aud,
            margin_aud: computed.margin_aud,
            productivity_pct: computed.productivity_pct,
          },
          variation_flag_count: flags?.length ?? 0,
          html_preview_url: `${url.origin}${url.pathname}?date=${dateParam}${supervisorIdParam ? "&supervisor_id=" + supervisorIdParam : ""}&dry_run=1`,
        });
      },
    },
  },
});

function deriveShortCode(code?: string | null, name?: string | null): string | null {
  if (name) {
    // "Moonee Valley Racecourse Civil Works" -> "MVRC"
    const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]?.toUpperCase()).join("");
    if (initials.length >= 3 && initials.length <= 6) return initials;
  }
  if (code) return code.split("-")[0] ?? code;
  return null;
}
