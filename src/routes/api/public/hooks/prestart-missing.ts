// Phase 4 — 9am missing-prestart sweep.
// For today's allocations with plant_asset_ids but no matching log,
// DM each operator's supervisor (grouped) and the director.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmAdmin, dmUser } from "@/lib/slack/post";

function melbToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export const Route = createFileRoute("/api/public/hooks/prestart-missing")({
  server: {
    handlers: {
      POST: async () => {
        const today = melbToday();
        const { data: allocs } = await supabaseAdmin
          .from("daily_allocations")
          .select("person_id, plant_asset_ids")
          .eq("allocation_date", today)
          .not("plant_asset_ids", "is", null);
        const rows = (allocs ?? []).filter((r: any) => Array.isArray(r.plant_asset_ids) && r.plant_asset_ids.length > 0);
        if (rows.length === 0) return Response.json({ ok: true, count: 0 });

        const assetIds = Array.from(new Set(rows.flatMap((r: any) => r.plant_asset_ids as string[])));
        const { data: logs } = await supabaseAdmin
          .from("plant_prestart_logs")
          .select("asset_id")
          .eq("prestart_date", today)
          .in("asset_id", assetIds);
        const doneSet = new Set((logs ?? []).map((l: any) => l.asset_id));

        const missing: { personId: string; assetId: string }[] = [];
        for (const r of rows) {
          for (const aid of (r as any).plant_asset_ids as string[]) {
            if (!doneSet.has(aid)) missing.push({ personId: (r as any).person_id, assetId: aid });
          }
        }
        if (missing.length === 0) return Response.json({ ok: true, count: 0 });

        const personIds = Array.from(new Set(missing.map((m) => m.personId)));
        const assetIdsM = Array.from(new Set(missing.map((m) => m.assetId)));
        const [{ data: crew }, { data: assets }] = await Promise.all([
          supabaseAdmin.from("crew_members").select("id, name, default_supervisor_id").in("id", personIds),
          supabaseAdmin.from("plant_items").select("id, plant_id_code").in("id", assetIdsM),
        ]);
        const crewMap = new Map((crew ?? []).map((c: any) => [c.id, c]));
        const assetMap = new Map((assets ?? []).map((a: any) => [a.id, a.plant_id_code]));

        // Group by supervisor
        const bySup = new Map<string, string[]>();
        const directorLines: string[] = [];
        for (const m of missing) {
          const c: any = crewMap.get(m.personId);
          const line = `${c?.name ?? "(unknown)"} on ${assetMap.get(m.assetId) ?? "(unknown)"}`;
          directorLines.push(line);
          const supId = c?.default_supervisor_id;
          if (!supId) continue;
          if (!bySup.has(supId)) bySup.set(supId, []);
          bySup.get(supId)!.push(line);
        }

        let supsDmed = 0;
        for (const [supId, lines] of bySup) {
          const { data: slackId } = await supabaseAdmin.rpc("get_supervisor_slack_id", {
            p_supervisor_person_id: supId,
          });
          if (!slackId) continue;
          await dmUser(slackId as unknown as string, `Pre-starts outstanding: ${lines.join(", ")}.`);
          supsDmed++;
        }

        if (directorLines.length > 0) {
          await dmAdmin(`Pre-starts outstanding: ${directorLines.join(", ")}.`);
        }

        return Response.json({ ok: true, missing: missing.length, supervisors_dmed: supsDmed });
      },
    },
  },
});
