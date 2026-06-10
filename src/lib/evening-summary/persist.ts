import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeReport, type ComputedReport } from "./compute";

/**
 * Recompute revenue/cost/margin/productivity for a daily_report and persist
 * the totals back to the row. Idempotent — safe to call multiple times.
 */
export async function persistComputedReport(reportId: string): Promise<ComputedReport> {
  const computed = await computeReport(reportId);
  const { error } = await supabaseAdmin
    .from("daily_reports")
    .update({
      revenue_aud: computed.revenue_aud,
      cost_aud: computed.cost_aud,
      margin_aud: computed.margin_aud,
      productivity_pct: computed.productivity_pct,
    })
    .eq("id", reportId);
  if (error) throw new Error(`persistComputedReport update failed: ${error.message}`);
  return computed;
}

/**
 * Send a one-line Slack DM to James after a wrap is complete. Looks up his
 * slack_user_id from the supervisors table (name ILIKE 'James%' on the same
 * project). Best-effort — failures are logged, not thrown.
 */
export async function notifyDirectorOnWrap(args: {
  reportId: string;
  projectId: string;
  supervisorName: string;
  productivityPct: number;
  marginAud: number;
  variationCount: number;
  siteOrigin: string;
}): Promise<void> {
  try {
    const { data: director } = await supabaseAdmin
      .from("supervisors")
      .select("slack_user_id, name")
      .eq("project_id", args.projectId)
      .ilike("name", "James%")
      .maybeSingle();

    const slackUserId = director?.slack_user_id ?? process.env.DIRECTOR_SLACK_USER_ID;
    if (!slackUserId) {
      console.log("[notifyDirectorOnWrap] no director slack user id, skipping DM");
      return;
    }

    const supFirst = (args.supervisorName ?? "").split(/\s+/)[0] ?? "Crew";
    const variationLine = args.variationCount === 0
      ? "No variations flagged."
      : `${args.variationCount} variation${args.variationCount === 1 ? "" : "s"} flagged.`;
    const link = `${args.siteOrigin.replace(/\/$/, "")}/reports/${args.reportId}`;
    const margin = Math.round(args.marginAud ?? 0);
    const absFmt = Math.abs(margin).toLocaleString("en-AU");
    const pnlLine = margin >= 0 ? `Profit $${absFmt}.` : `Loss -$${absFmt}.`;
    const text = `${supFirst}'s wrap is in. ${pnlLine} ${variationLine} <${link}|View report>`;

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel: slackUserId, text }),
    });
    const data: any = await res.json();
    if (!data.ok) console.error("[notifyDirectorOnWrap] DM failed:", data.error);
  } catch (e) {
    console.error("[notifyDirectorOnWrap] threw:", (e as Error).message);
  }
}
