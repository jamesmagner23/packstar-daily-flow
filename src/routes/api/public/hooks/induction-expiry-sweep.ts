// Phase 3 — Induction expiry sweep.
// Cron-triggered (pg_cron): runs daily at 21:00 UTC (7am AEDT).
//
// Walks person_inductions.expires_date within the next 30 days, groups by
// band (7d / 30d), debounces via induction_expiry_notice_log (PK on
// person_induction_id + sent_on so we only send once per day per induction),
// and DMs the admin a grouped summary. Supervisor DMs are sent per crew
// member when default_supervisor_id is set and resolves to a slack id.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmAdmin, dmUser, siteOrigin } from "@/lib/slack/post";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function bandFor(daysOut: number): "7d" | "30d" | null {
  if (daysOut <= 7) return "7d";
  if (daysOut <= 30) return "30d";
  return null;
}

type IndRow = {
  id: string;
  person_id: string;
  site_id: string;
  expires_date: string;
};

export const Route = createFileRoute("/api/public/hooks/induction-expiry-sweep")({
  server: {
    handlers: {
      POST: async () => {
        const today = todayISO();
        const horizon = shiftDays(today, 30);

        const { data: rows, error } = await supabaseAdmin
          .from("person_inductions")
          .select("id, person_id, site_id, expires_date")
          .eq("status", "completed")
          .not("expires_date", "is", null)
          .gte("expires_date", today)
          .lte("expires_date", horizon);
        if (error) {
          console.error("[induction-sweep] query failed:", error.message);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const inductions = (rows ?? []) as IndRow[];
        if (inductions.length === 0) {
          return Response.json({ ok: true, count: 0 });
        }

        // Filter out anything already alerted today.
        const { data: alreadySent } = await supabaseAdmin
          .from("induction_expiry_notice_log")
          .select("person_induction_id")
          .eq("sent_on", today)
          .in("person_induction_id", inductions.map((i) => i.id));
        const sentSet = new Set((alreadySent ?? []).map((r: any) => r.person_induction_id));

        const dueRows = inductions
          .map((r) => {
            const days = Math.round(
              (new Date(`${r.expires_date}T00:00:00Z`).getTime() -
                new Date(`${today}T00:00:00Z`).getTime()) /
                (1000 * 60 * 60 * 24),
            );
            const band = bandFor(days);
            return { ...r, days, band };
          })
          .filter((r) => r.band !== null && !sentSet.has(r.id));

        if (dueRows.length === 0) {
          return Response.json({ ok: true, count: 0, note: "all debounced" });
        }

        // Batch resolve crew + sites.
        const personIds = Array.from(new Set(dueRows.map((r) => r.person_id)));
        const siteIds = Array.from(new Set(dueRows.map((r) => r.site_id)));
        const [{ data: crew }, { data: sites }] = await Promise.all([
          supabaseAdmin
            .from("crew_members")
            .select("id, name, active, default_supervisor_id, slack_user_id")
            .in("id", personIds),
          supabaseAdmin.from("sites").select("id, name").in("id", siteIds),
        ]);
        const crewById = new Map((crew ?? []).map((c: any) => [c.id, c]));
        const siteById = new Map((sites ?? []).map((s: any) => [s.id, s]));

        type Enriched = (typeof dueRows)[number] & {
          personName: string;
          siteName: string;
          supId: string | null;
        };
        const enriched: Enriched[] = dueRows
          .filter((r) => (crewById.get(r.person_id) as any)?.active)
          .map((r) => ({
            ...r,
            personName: (crewById.get(r.person_id) as any)?.name ?? "(unknown)",
            siteName: (siteById.get(r.site_id) as any)?.name ?? "(unknown site)",
            supId: (crewById.get(r.person_id) as any)?.default_supervisor_id ?? null,
          }));

        if (enriched.length === 0) {
          return Response.json({ ok: true, count: 0, note: "all inactive" });
        }

        // Admin DM — grouped by band.
        const lines: string[] = ["Inductions expiring soon:"];
        for (const band of ["7d", "30d"] as const) {
          const group = enriched.filter((r) => r.band === band).sort((a, b) => a.days - b.days);
          if (group.length === 0) continue;
          lines.push("");
          lines.push(band === "7d" ? "Within 7 days:" : "Within 30 days:");
          for (const r of group) {
            lines.push(`- ${r.personName} — ${r.siteName}, ${r.days} day${r.days === 1 ? "" : "s"} (${r.expires_date})`);
          }
        }
        lines.push("");
        lines.push(`Open /sites or /crew to action: ${siteOrigin()}/sites`);
        await dmAdmin(lines.join("\n"));

        // Per-supervisor DMs — only for 7d band, grouped by supervisor.
        const sevenDay = enriched.filter((r) => r.band === "7d" && r.supId);
        const bySup = new Map<string, Enriched[]>();
        for (const r of sevenDay) {
          if (!bySup.has(r.supId!)) bySup.set(r.supId!, []);
          bySup.get(r.supId!)!.push(r);
        }
        for (const [supId, list] of bySup) {
          const { data: supSlack } = await supabaseAdmin.rpc("get_supervisor_slack_id", {
            p_supervisor_person_id: supId,
          });
          const slackId = (supSlack as unknown as string | null) ?? null;
          if (!slackId) continue;
          const msg =
            `Heads up — your crew has inductions expiring within 7 days:\n` +
            list.map((r) => `- ${r.personName} — ${r.siteName} (${r.expires_date})`).join("\n");
          await dmUser(slackId, msg);
        }

        // Record dedupe rows.
        const logRows = enriched.map((r) => ({
          person_induction_id: r.id,
          expires_date: r.expires_date,
          band: r.band!,
          sent_on: today,
        }));
        const { error: logErr } = await supabaseAdmin
          .from("induction_expiry_notice_log")
          .insert(logRows);
        if (logErr) console.error("[induction-sweep] dedupe insert failed:", logErr.message);

        return Response.json({
          ok: true,
          count: enriched.length,
          supervisors_dmed: bySup.size,
        });
      },
    },
  },
});
