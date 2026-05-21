// Phase 4.1 — handle an operator's reply identifying which plant asset
// they're on today. Triggered when a PCW-classified crew member has an
// allocation row for today with empty plant_asset_ids.

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmAdmin, dmUser } from "./post";
import { handlePrestartPhoto } from "./prestart";

const MODEL = "claude-sonnet-4-5";

function melbToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export type PendingAssignment = {
  person: { id: string; name: string; default_supervisor_id: string | null };
  allocation: { id: string; job_id: string | null };
};

/**
 * If the sender is a crew member with a PCW-classified allocation today that
 * still has no plant_asset_ids set, return the pending context. Otherwise null.
 */
export async function getPendingAssignment(slackUserId: string): Promise<PendingAssignment | null> {
  const { data: person } = await supabaseAdmin
    .from("crew_members")
    .select("id, name, default_supervisor_id")
    .eq("slack_user_id", slackUserId)
    .eq("active", true)
    .maybeSingle();
  if (!person) return null;

  const today = melbToday();
  const { data: allocs } = await supabaseAdmin
    .from("daily_allocations")
    .select("id, job_id, plant_asset_ids, classification_id")
    .eq("person_id", person.id)
    .eq("allocation_date", today);

  const candidates = (allocs ?? []).filter(
    (a: any) => !a.plant_asset_ids || a.plant_asset_ids.length === 0,
  );
  if (candidates.length === 0) return null;

  const classIds = Array.from(
    new Set(candidates.map((a: any) => a.classification_id).filter(Boolean)),
  );
  if (classIds.length === 0) return null;

  const { data: classes } = await supabaseAdmin
    .from("classifications")
    .select("id, classification")
    .in("id", classIds as string[]);
  const pcwIds = new Set(
    (classes ?? [])
      .filter((c: any) => /^pcw/i.test(c.classification ?? ""))
      .map((c: any) => c.id),
  );

  const pending = candidates.find((a: any) => pcwIds.has(a.classification_id));
  if (!pending) return null;

  return { person: person as any, allocation: { id: pending.id, job_id: pending.job_id } };
}

async function resolveAssetByText(text: string): Promise<any | null> {
  const cleaned = text.trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const { data } = await supabaseAdmin
      .from("plant_items")
      .select("id, plant_id_code, description")
      .ilike("plant_id_code", tok)
      .maybeSingle();
    if (data) return data;
  }
  const { data: fuzzy } = await supabaseAdmin
    .from("plant_items")
    .select("id, plant_id_code, description")
    .or(`plant_id_code.ilike.%${cleaned}%,description.ilike.%${cleaned}%`)
    .limit(1);
  return fuzzy?.[0] ?? null;
}

async function downloadSlackFile(file: any): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!file?.url_private) return null;
  try {
    const res = await fetch(file.url_private, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return { bytes: buf, mime: file.mimetype ?? "image/jpeg" };
  } catch {
    return null;
  }
}

async function resolveAssetFromPhoto(file: any): Promise<any | null> {
  const dl = await downloadSlackFile(file);
  if (!dl?.mime?.startsWith("image/")) return null;

  const { data: items } = await supabaseAdmin
    .from("plant_items")
    .select("id, plant_id_code, description")
    .eq("active", true);
  const codes = (items ?? []).map((i: any) => i.plant_id_code as string);
  if (codes.length === 0) return null;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 30,
      system: [{
        type: "text",
        text:
          `You're identifying a piece of construction plant (excavator, truck, loader, etc.) from a photo. ` +
          `Find the fleet/asset code stencilled on the body or on an asset-ID plate. ` +
          `Known codes in our fleet: ${codes.join(", ")}. ` +
          `Reply with ONLY the exact matching code from that list, or "NONE" if you can't see one.`,
      }],
      messages: [{
        role: "user",
        content: [{
          type: "image",
          source: { type: "base64", media_type: dl.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: Buffer.from(dl.bytes).toString("base64") },
        }],
      }],
    });
    const text = r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim().toUpperCase();
    if (!text || text === "NONE") return null;
    return (items ?? []).find((i: any) => (i.plant_id_code as string).toUpperCase() === text) ?? null;
  } catch (e) {
    console.error("[asset-assign] vision call failed:", (e as Error).message);
    return null;
  }
}

export async function handleAssetAssignment(
  event: any,
  channel: string,
  slackUserId: string,
  pending: PendingAssignment,
): Promise<void> {
  const text = (event.text ?? "").trim();
  const files = Array.isArray(event.files) ? event.files : [];

  let asset = await resolveAssetByText(text);
  if (!asset && files.length > 0) {
    asset = await resolveAssetFromPhoto(files[0]);
  }

  if (!asset) {
    await dmUser(slackUserId, "Can't find that one. Check the asset plate or try again — send the code (e.g. EX02) or a clear photo of the plate.");
    return;
  }

  // Conflict check — anyone else holding this asset today?
  const today = melbToday();
  const { data: conflicts } = await supabaseAdmin
    .from("daily_allocations")
    .select("id, person_id")
    .eq("allocation_date", today)
    .overlaps("plant_asset_ids", [asset.id])
    .neq("person_id", pending.person.id);

  if (conflicts && conflicts.length > 0) {
    const otherId = (conflicts[0] as any).person_id;
    const { data: otherPerson } = await supabaseAdmin
      .from("crew_members").select("name").eq("id", otherId).maybeSingle();
    const otherName = otherPerson?.name ?? "another op";
    await dmUser(slackUserId,
      `Heads up — ${asset.plant_id_code} already shows assigned to ${otherName} today. Flagged the supervisor to sort it.`);
    const msg = `Plant conflict: ${pending.person.name} and ${otherName} both claim ${asset.plant_id_code} today.`;
    if (pending.person.default_supervisor_id) {
      const { data: supSlack } = await supabaseAdmin.rpc("get_supervisor_slack_id", {
        p_supervisor_person_id: pending.person.default_supervisor_id,
      });
      const slackId = (supSlack as unknown as string | null) ?? null;
      if (slackId) await dmUser(slackId, msg);
    }
    await dmAdmin(msg);
    return;
  }

  // Backfill the allocation
  const { error: updErr } = await supabaseAdmin
    .from("daily_allocations")
    .update({ plant_asset_ids: [asset.id] })
    .eq("id", pending.allocation.id);
  if (updErr) {
    console.error("[asset-assign] allocation update failed:", updErr.message);
    await dmUser(slackUserId, "Couldn't save that — admin's been pinged.");
    await dmAdmin(`Failed to assign ${asset.plant_id_code} to ${pending.person.name}: ${updErr.message}`);
    return;
  }

  // Confirm + run pre-start in the same flow. handlePrestartPhoto will now
  // resolve the asset via today's allocation and log the checklist.
  await dmUser(slackUserId, `Got it — you're on ${asset.plant_id_code}${asset.description ? ` (${asset.description})` : ""}.`);
  await handlePrestartPhoto(event, channel, slackUserId);
}
