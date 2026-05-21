// Phase 4 — 6:30am morning pre-start DM.
// Fires ONLY when an allocation has plant_asset_ids set. Single DM with
// a deep link to the web pre-start form. Spaced 200ms apart for rate limits.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmUser, siteOrigin } from "@/lib/slack/post";

function melbToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function firstName(n: string): string {
  return (n ?? "").trim().split(/\s+/)[0] ?? "mate";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const Route = createFileRoute("/api/public/hooks/prestart-morning-dm")({
  server: {
    handlers: {
      POST: async () => {
        const today = melbToday();

        const { data: allocs, error } = await supabaseAdmin
          .from("daily_allocations")
          .select("person_id, job_id, plant_asset_ids, source")
          .eq("allocation_date", today)
          .in("source", ["planned", "wrap_actual"]);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const rows = (allocs ?? []).filter(
          (r: any) => Array.isArray(r.plant_asset_ids) && r.plant_asset_ids.length > 0,
        );
        if (rows.length === 0) return Response.json({ ok: true, sent: 0 });

        const personIds = Array.from(new Set(rows.map((r: any) => r.person_id)));
        const assetIds = Array.from(new Set(rows.flatMap((r: any) => r.plant_asset_ids as string[])));
        const jobIds = Array.from(new Set(rows.map((r: any) => r.job_id).filter(Boolean)));

        const [{ data: crew }, { data: assets }, { data: projects }] = await Promise.all([
          supabaseAdmin.from("crew_members").select("id, name, slack_user_id").in("id", personIds),
          supabaseAdmin.from("plant_items").select("id, plant_id_code, description").in("id", assetIds),
          jobIds.length
            ? supabaseAdmin.from("projects").select("id, name").in("id", jobIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const crewMap = new Map((crew ?? []).map((c: any) => [c.id, c]));
        const assetMap = new Map((assets ?? []).map((a: any) => [a.id, a]));
        const jobMap = new Map((projects ?? []).map((p: any) => [p.id, p.name]));
        const origin = siteOrigin();

        let sent = 0;
        for (const r of rows as any[]) {
          const op: any = crewMap.get(r.person_id);
          if (!op?.slack_user_id) continue;
          const jobName = jobMap.get(r.job_id) ?? "today's job";
          for (const aid of r.plant_asset_ids as string[]) {
            const asset: any = assetMap.get(aid);
            if (!asset) continue;
            const link = `${origin}/plant/${asset.id}/prestart`;
            const desc = asset.description ? ` — ${asset.description}` : "";
            const msg =
              `Morning ${firstName(op.name)}. Today at ${jobName} on ${asset.plant_id_code}${desc}. ` +
              `Pre-start before you start: ${link}`;
            await dmUser(op.slack_user_id, msg);
            sent++;
            await sleep(200);
          }
        }

        return Response.json({ ok: true, sent });
      },
    },
  },
});
