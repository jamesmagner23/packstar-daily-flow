// Phase 4 — 9am missing-prestart sweep.
// Two buckets:
//  1. Allocations with plant_asset_ids set but no matching prestart log today.
//  2. PCW-classified allocations today with plant_asset_ids still empty
//     (operator never confirmed which asset).
// Both bucket items are grouped per supervisor and also rolled up to the director.

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

        // PCW classification ids (for bucket 2)
        const { data: pcwClasses } = await supabaseAdmin
          .from("classifications")
          .select("id, classification")
          .ilike("classification", "PCW%");
        const pcwIds = new Set((pcwClasses ?? []).map((c: any) => c.id as string));

        // Today's allocations, planned/wrap actual
        const { data: allAllocs } = await supabaseAdmin
          .from("daily_allocations")
          .select("person_id, plant_asset_ids, classification_id, source")
          .eq("allocation_date", today)
          .in("source", ["planned", "wrap_actual"]);
        const allocs = allAllocs ?? [];

        // Bucket 1: asset set, no log
        const bucket1Src = allocs.filter(
          (r: any) => Array.isArray(r.plant_asset_ids) && r.plant_asset_ids.length > 0,
        );
        const assetIds = Array.from(
          new Set(bucket1Src.flatMap((r: any) => r.plant_asset_ids as string[])),
        );
        let doneSet = new Set<string>();
        if (assetIds.length > 0) {
          const { data: logs } = await supabaseAdmin
            .from("plant_prestart_logs")
            .select("asset_id")
            .eq("prestart_date", today)
            .in("asset_id", assetIds);
          doneSet = new Set((logs ?? []).map((l: any) => l.asset_id));
        }
        const bucket1: { personId: string; assetId: string }[] = [];
        for (const r of bucket1Src) {
          for (const aid of (r as any).plant_asset_ids as string[]) {
            if (!doneSet.has(aid)) bucket1.push({ personId: (r as any).person_id, assetId: aid });
          }
        }

        // Bucket 2: PCW allocation, no asset assigned
        const bucket2: { personId: string }[] = allocs
          .filter(
            (r: any) =>
              pcwIds.has(r.classification_id) &&
              (!Array.isArray(r.plant_asset_ids) || r.plant_asset_ids.length === 0),
          )
          .map((r: any) => ({ personId: r.person_id }));

        if (bucket1.length === 0 && bucket2.length === 0) {
          return Response.json({ ok: true, bucket1: 0, bucket2: 0 });
        }

        // Lookups
        const personIds = Array.from(
          new Set([...bucket1.map((m) => m.personId), ...bucket2.map((m) => m.personId)]),
        );
        const assetIdsM = Array.from(new Set(bucket1.map((m) => m.assetId)));
        const [{ data: crew }, { data: assets }] = await Promise.all([
          supabaseAdmin
            .from("crew_members")
            .select("id, name, default_supervisor_id")
            .in("id", personIds),
          assetIdsM.length
            ? supabaseAdmin
                .from("plant_items")
                .select("id, plant_id_code")
                .in("id", assetIdsM)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const crewMap = new Map((crew ?? []).map((c: any) => [c.id, c]));
        const assetMap = new Map((assets ?? []).map((a: any) => [a.id, a.plant_id_code]));

        // Group per supervisor
        const bySup = new Map<string, { outstanding: string[]; unconfirmed: string[] }>();
        const directorOut: string[] = [];
        const directorUnc: string[] = [];

        for (const m of bucket1) {
          const c: any = crewMap.get(m.personId);
          const line = `${c?.name ?? "(unknown)"} on ${assetMap.get(m.assetId) ?? "(unknown)"}`;
          directorOut.push(line);
          const supId = c?.default_supervisor_id;
          if (!supId) continue;
          if (!bySup.has(supId)) bySup.set(supId, { outstanding: [], unconfirmed: [] });
          bySup.get(supId)!.outstanding.push(line);
        }
        for (const m of bucket2) {
          const c: any = crewMap.get(m.personId);
          const line = `${c?.name ?? "(unknown)"}`;
          directorUnc.push(line);
          const supId = c?.default_supervisor_id;
          if (!supId) continue;
          if (!bySup.has(supId)) bySup.set(supId, { outstanding: [], unconfirmed: [] });
          bySup.get(supId)!.unconfirmed.push(line);
        }

        let supsDmed = 0;
        for (const [supId, { outstanding, unconfirmed }] of bySup) {
          const { data: slackId } = await supabaseAdmin.rpc("get_supervisor_slack_id", {
            p_supervisor_person_id: supId,
          });
          if (!slackId) continue;
          const parts: string[] = [];
          if (outstanding.length) parts.push(`Pre-starts outstanding: ${outstanding.join(", ")}.`);
          if (unconfirmed.length) parts.push(`No asset confirmed and no pre-start: ${unconfirmed.join(", ")}.`);
          await dmUser(slackId as unknown as string, parts.join("\n"));
          supsDmed++;
        }

        const dirParts: string[] = [];
        if (directorOut.length) dirParts.push(`Pre-starts outstanding: ${directorOut.join(", ")}.`);
        if (directorUnc.length) dirParts.push(`No asset confirmed and no pre-start: ${directorUnc.join(", ")}.`);
        if (dirParts.length) await dmAdmin(dirParts.join("\n"));

        return Response.json({
          ok: true,
          bucket1: bucket1.length,
          bucket2: bucket2.length,
          supervisors_dmed: supsDmed,
        });
      },
    },
  },
});
