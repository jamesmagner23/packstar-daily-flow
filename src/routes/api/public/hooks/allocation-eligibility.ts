// Phase 3 — Allocation eligibility hook.
// Called by the daily_allocations AFTER INSERT/UPDATE trigger
// (trigger_allocation_eligibility_check → pg_net.http_post).
//
// Contract:
//   POST /api/public/hooks/allocation-eligibility
//   body: {
//     allocation_id, person_id, job_id, classification_id,
//     supervisor_id, allocation_date
//   }
//
// Flow:
//   1. Resolve site for job (sites.job_id = allocation.job_id).
//      No site → silently noop (job not yet linked to a site).
//   2. Call check_eligibility(person, site, 'general', allocation_date).
//   3. If eligible → noop.
//   4. If NOT eligible → debounce on (person_id, site_id, allocation_date)
//      via eligibility_alert_log; if already alerted, noop.
//   5. DM supervisor via get_supervisor_slack_id; fall back to
//      DIRECTOR_SLACK_USER_ID with "(supervisor unset)" prefix.
//   6. Always 200 OK so a notification failure never blocks the
//      allocation write (trigger already swallows on its side).

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmUser, dmAdmin, siteOrigin } from "@/lib/slack/post";

const Payload = z.object({
  allocation_id: z.string().uuid().optional(),
  person_id: z.string().uuid(),
  job_id: z.string().uuid(),
  classification_id: z.string().uuid().nullable().optional(),
  supervisor_id: z.string().uuid().nullable().optional(),
  allocation_date: z.string().min(1),
});

type EligibilityResult = {
  eligible: boolean;
  missing_competencies: Array<{ code: string; name: string; reason: string }>;
  induction_status: string;
  earliest_eligible_date: string;
};

function formatMissing(result: EligibilityResult): string {
  const bits: string[] = [];
  if (result.induction_status !== "completed") {
    bits.push(
      result.induction_status === "booked"
        ? `induction booked but not completed (earliest ${result.earliest_eligible_date})`
        : `no site induction (earliest ${result.earliest_eligible_date})`,
    );
  }
  for (const c of result.missing_competencies ?? []) {
    bits.push(`missing ${c.name}`);
  }
  return bits.length ? bits.join("; ") : "ineligible";
}

export const Route = createFileRoute("/api/public/hooks/allocation-eligibility")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        let parsed: z.infer<typeof Payload>;
        try {
          const body = await request.json();
          parsed = Payload.parse(body);
        } catch (e) {
          console.error("[alloc-eligibility] bad payload:", (e as Error).message);
          // Return 200 so pg_net doesn't retry; trigger already swallows.
          return Response.json({ ok: false, reason: "bad_payload" });
        }

        // 1. Resolve site for the project (job_id → projects.id → sites.job_id)
        const { data: site, error: siteErr } = await supabaseAdmin
          .from("sites")
          .select("id, name")
          .eq("job_id", parsed.job_id)
          .eq("active", true)
          .maybeSingle();
        if (siteErr) {
          console.error("[alloc-eligibility] site lookup failed:", siteErr.message);
          return Response.json({ ok: false, reason: "site_lookup_failed" });
        }
        if (!site) {
          // Project has no linked site yet — nothing to check.
          return Response.json({ ok: true, reason: "no_site_for_job" });
        }

        // 2. check_eligibility
        const { data: rawResult, error: elErr } = await supabaseAdmin.rpc(
          "check_eligibility",
          {
            p_person_id: parsed.person_id,
            p_site_id: site.id,
            p_task_type: "general",
            p_on_date: parsed.allocation_date,
          },
        );
        if (elErr) {
          console.error("[alloc-eligibility] check_eligibility failed:", elErr.message);
          return Response.json({ ok: false, reason: "rpc_failed" });
        }
        const result = rawResult as unknown as EligibilityResult;
        if (result?.eligible) {
          return Response.json({ ok: true, eligible: true });
        }

        // 3. Debounce on (person, site, date)
        const { data: existing } = await supabaseAdmin
          .from("eligibility_alert_log")
          .select("person_id")
          .eq("person_id", parsed.person_id)
          .eq("site_id", site.id)
          .eq("allocation_date", parsed.allocation_date)
          .maybeSingle();
        if (existing) {
          return Response.json({ ok: true, debounced: true });
        }

        // 4. Resolve crew name + supervisor slack id (parallel)
        const [{ data: person }, supSlackRes] = await Promise.all([
          supabaseAdmin
            .from("crew_members")
            .select("name")
            .eq("id", parsed.person_id)
            .maybeSingle(),
          parsed.supervisor_id
            ? supabaseAdmin.rpc("get_supervisor_slack_id", {
                p_supervisor_person_id: parsed.supervisor_id,
              })
            : Promise.resolve({ data: null as string | null, error: null }),
        ]);

        const personName = person?.name ?? "(unknown crew)";
        const supSlackId = (supSlackRes as { data: string | null }).data ?? null;
        const reason = formatMissing(result);
        const reviewLink = `${siteOrigin()}/crew/${parsed.person_id}`;

        const baseMsg =
          `⚠ Eligibility issue: ${personName} allocated to ${site.name} ` +
          `on ${parsed.allocation_date} — ${reason}. ` +
          `Review: ${reviewLink}`;

        if (supSlackId) {
          await dmUser(supSlackId, baseMsg);
        } else {
          await dmAdmin(`(supervisor unset) ${baseMsg}`);
        }

        // 5. Record dedupe row
        const { error: logErr } = await supabaseAdmin
          .from("eligibility_alert_log")
          .insert({
            person_id: parsed.person_id,
            site_id: site.id,
            allocation_date: parsed.allocation_date,
          });
        if (logErr) {
          console.error("[alloc-eligibility] dedupe insert failed:", logErr.message);
        }

        return Response.json({
          ok: true,
          eligible: false,
          alerted: true,
          supervisor_dm: !!supSlackId,
          reason,
        });
      },
    },
  },
});
