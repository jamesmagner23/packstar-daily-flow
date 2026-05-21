// Phase 4 — 6:30am morning pre-start DM.
// DMs every PCW-classified operator with a daily_allocations row for today.
// If plant_asset_ids is populated, the DM names the asset(s). If not, the
// DM asks the operator to reply with the asset code or a photo of the plate
// (handled by src/lib/slack/asset-assign.ts on the inbound side).
// Spaced 200ms apart for Slack rate limits.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmUser } from "@/lib/slack/post";

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

        // 1. PCW classifications (plant operators)
        const { data: pcwClasses } = await supabaseAdmin
          .from("classifications")
          .select("id, classification")
          .ilike("classification", "PCW%");
        const pcwIds = new Set((pcwClasses ?? []).map((c: any) => c.id as string));
        if (pcwIds.size === 0) return Response.json({ ok: true, sent: 0, reason: "no PCW classifications" });

        // 2. Today's allocations for those classifications
        const { data: allocs, error } = await supabaseAdmin
          .from("daily_allocations")
          .select("id, person_id, job_id, plant_asset_ids, classification_id, source")
          .eq("allocation_date", today)
          .in("source", ["planned", "wrap_actual"])
          .in("classification_id", Array.from(pcwIds));
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        const rows = (allocs ?? []).filter((r: any) => pcwIds.has(r.classification_id));
        if (rows.length === 0) return Response.json({ ok: true, sent: 0 });

        const personIds = Array.from(new Set(rows.map((r: any) => r.person_id)));
        const assetIds = Array.from(new Set(rows.flatMap((r: any) => (r.plant_asset_ids ?? []) as string[])));
        const jobIds = Array.from(new Set(rows.map((r: any) => r.job_id).filter(Boolean)));

        const [{ data: crew }, { data: assets }, { data: projects }] = await Promise.all([
          supabaseAdmin.from("crew_members").select("id, name, slack_user_id").in("id", personIds),
          assetIds.length
            ? supabaseAdmin.from("plant_items").select("id, plant_id_code, description").in("id", assetIds)
            : Promise.resolve({ data: [] as any[] }),
          jobIds.length
            ? supabaseAdmin.from("projects").select("id, name").in("id", jobIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const crewMap = new Map((crew ?? []).map((c: any) => [c.id, c]));
        const assetMap = new Map((assets ?? []).map((a: any) => [a.id, a]));
        const jobMap = new Map((projects ?? []).map((p: any) => [p.id, p.name]));

        let sent = 0;
        for (const r of rows as any[]) {
          const op: any = crewMap.get(r.person_id);
          if (!op?.slack_user_id) continue;
          const jobName = jobMap.get(r.job_id) ?? "today's job";
          const ids = (r.plant_asset_ids ?? []) as string[];

          if (ids.length === 0) {
            const msg =
              `Morning ${firstName(op.name)}. You're on plant at ${jobName} today. ` +
              `Which asset? Reply with the code (e.g. EX02) or a photo of the asset plate and I'll log the pre-start.`;
            await dmUser(op.slack_user_id, msg);
            sent++;
            await sleep(200);
            continue;
          }

          for (const aid of ids) {
            const asset: any = assetMap.get(aid);
            if (!asset) continue;
            const msg =
              `Morning ${firstName(op.name)}. Today: ${jobName}. ` +
              `You're on ${asset.plant_id_code}${asset.description ? ` — ${asset.description}` : ""}. ` +
              `Pre-start when you're ready. Reply with a photo of the asset and any issues, or just "all good" if nothing to flag.`;
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
