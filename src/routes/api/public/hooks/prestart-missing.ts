// Phase 4 — Missing pre-start sweep.
// Mode "operator" (9am): DM the operator a reminder with the deep link.
// Mode "supervisor" (10am): DM the supervisor + director the still-outstanding list.
//
// Only one bucket: allocations with plant_asset_ids set but no plant_prestart_log
// for that asset today.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmAdmin, dmUser, siteOrigin } from "@/lib/slack/post";

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

export const Route = createFileRoute("/api/public/hooks/prestart-missing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const mode = (url.searchParams.get("mode") ?? "operator").toLowerCase();
        const today = melbToday();

        const { data: allocs } = await supabaseAdmin
          .from("daily_allocations")
          .select("person_id, plant_asset_ids, source")
          .eq("allocation_date", today)
          .in("source", ["planned", "wrap_actual"]);

        const src = (allocs ?? []).filter(
          (r: any) => Array.isArray(r.plant_asset_ids) && r.plant_asset_ids.length > 0,
        );
        const assetIds = Array.from(new Set(src.flatMap((r: any) => r.plant_asset_ids as string[])));

        let doneSet = new Set<string>();
        if (assetIds.length > 0) {
          const { data: logs } = await supabaseAdmin
            .from("plant_prestart_logs")
            .select("asset_id")
            .eq("prestart_date", today)
            .in("asset_id", assetIds);
          doneSet = new Set((logs ?? []).map((l: any) => l.asset_id));
        }

        const outstanding: { personId: string; assetId: string }[] = [];
        for (const r of src) {
          for (const aid of (r as any).plant_asset_ids as string[]) {
            if (!doneSet.has(aid)) outstanding.push({ personId: (r as any).person_id, assetId: aid });
          }
        }

        if (outstanding.length === 0) {
          return Response.json({ ok: true, mode, outstanding: 0 });
        }

        const personIds = Array.from(new Set(outstanding.map((o) => o.personId)));
        const outAssetIds = Array.from(new Set(outstanding.map((o) => o.assetId)));
        const [{ data: crew }, { data: assets }] = await Promise.all([
          supabaseAdmin
            .from("crew_members")
            .select("id, name, slack_user_id, default_supervisor_id")
            .in("id", personIds),
          supabaseAdmin
            .from("plant_items")
            .select("id, plant_id_code, description")
            .in("id", outAssetIds),
        ]);
        const crewMap = new Map((crew ?? []).map((c: any) => [c.id, c]));
        const assetMap = new Map((assets ?? []).map((a: any) => [a.id, a]));
        const origin = siteOrigin();

        if (mode === "operator") {
          // 9am: nudge each operator
          let sent = 0;
          for (const o of outstanding) {
            const op: any = crewMap.get(o.personId);
            const asset: any = assetMap.get(o.assetId);
            if (!op?.slack_user_id || !asset) continue;
            const desc = asset.description ? ` — ${asset.description}` : "";
            const msg =
              `Hey ${firstName(op.name)}, still need your pre-start on ${asset.plant_id_code}${desc}. ` +
              `${origin}/plant/${asset.id}/prestart`;
            await dmUser(op.slack_user_id, msg);
            sent++;
            await sleep(200);
          }
          return Response.json({ ok: true, mode, sent, outstanding: outstanding.length });
        }

        // mode === "supervisor": 10am follow-up, group per supervisor + director
        const bySup = new Map<string, string[]>();
        const directorLines: string[] = [];
        for (const o of outstanding) {
          const c: any = crewMap.get(o.personId);
          const a: any = assetMap.get(o.assetId);
          const line = `${c?.name ?? "(unknown)"} on ${a?.plant_id_code ?? "(unknown)"}`;
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
          await dmUser(
            slackId as unknown as string,
            `Pre-starts still outstanding: ${lines.join(", ")}.`,
          );
          supsDmed++;
        }

        if (directorLines.length) {
          await dmAdmin(`Pre-starts still outstanding at 10am: ${directorLines.join(", ")}.`);
        }

        return Response.json({
          ok: true,
          mode,
          outstanding: outstanding.length,
          supervisors_dmed: supsDmed,
        });
      },
    },
  },
});
