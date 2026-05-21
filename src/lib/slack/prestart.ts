// Phase 4 — Plant pre-start handler.
// Handles photo+caption ("pre-start") submissions and reactive
// "pre-start [asset]" / "status [asset]" queries.

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmAdmin, dmUser, postToSlack, siteOrigin } from "./post";

const MODEL = "claude-sonnet-4-5";

const PRESTART_KEYWORDS = ["pre-start", "prestart", "all good", "started", "pre start"];

export function looksLikePrestartCaption(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return PRESTART_KEYWORDS.some((kw) => t.includes(kw));
}

// "pre-start EX01", "where's EX01", "status EX01"
export const PRESTART_QUERY_PATTERN = /^\s*(?:pre[-\s]?start|where(?:'s)?|status)\s+([a-z0-9-]+)\s*$/i;

function melbToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

type PersonRow = { id: string; name: string; default_supervisor_id: string | null };

async function resolveSender(slackUserId: string): Promise<PersonRow | null> {
  const { data } = await supabaseAdmin
    .from("crew_members")
    .select("id, name, default_supervisor_id")
    .eq("slack_user_id", slackUserId)
    .eq("active", true)
    .maybeSingle();
  return data as PersonRow | null;
}

async function resolveAssetForOperator(personId: string): Promise<any | null> {
  // Find an asset allocated to this operator today.
  const today = melbToday();
  const { data: allocs } = await supabaseAdmin
    .from("daily_allocations")
    .select("plant_asset_ids")
    .eq("person_id", personId)
    .eq("allocation_date", today);
  const assetIds = Array.from(new Set((allocs ?? []).flatMap((a: any) => (a.plant_asset_ids ?? []) as string[])));
  if (assetIds.length === 0) return null;
  const { data: items } = await supabaseAdmin
    .from("plant_items").select("id, plant_id_code, description").in("id", assetIds);
  return items?.[0] ?? null;
}

async function resolveAssetByText(text: string): Promise<any | null> {
  // Try exact plant_id_code first, then fuzzy on description.
  const tokens = text.split(/\s+/).filter(Boolean);
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
    .or(`plant_id_code.ilike.%${text}%,description.ilike.%${text}%`)
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
    const mime = file.mimetype ?? "image/jpeg";
    return { bytes: buf, mime };
  } catch {
    return null;
  }
}

function mimeExt(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("heic")) return "heic";
  return "jpg";
}

async function extractChecklist(
  caption: string,
  template: Array<{ id: string; label: string; type: string }>,
  bytes: Uint8Array | null,
  mime: string | null,
): Promise<{ responses: Record<string, any>; issues: string | null }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const schemaDesc = template.map((t) => `- ${t.id} (${t.type}): ${t.label}`).join("\n");
  const sys = `You parse a plant pre-start submission from a crew member.

Checklist items:
${schemaDesc}

Default pass_fail items to true unless the operator flags an issue. For number
items, return the numeric value if mentioned, else null. For text items, copy
the relevant snippet or null.

Output ONLY JSON:
{
  "responses": { "<item_id>": <value> },
  "issues": "<short summary of any issues raised, or null>"
}`;

  const content: any[] = [];
  if (bytes && mime?.startsWith("image/")) {
    content.push({ type: "image", source: { type: "base64", media_type: mime, data: Buffer.from(bytes).toString("base64") } });
  }
  content.push({ type: "text", text: `Caption: "${caption || "(no caption)"}"` });

  try {
    const r = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [{ type: "text", text: sys }],
      messages: [{ role: "user", content }],
    });
    const text = r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return { responses: parsed.responses ?? {}, issues: parsed.issues ?? null };
  } catch (e) {
    console.error("[prestart] extraction failed:", (e as Error).message);
    // Fallback: assume all pass, no issues.
    const responses: Record<string, any> = {};
    for (const t of template) {
      if (t.type === "pass_fail") responses[t.id] = true;
      else responses[t.id] = null;
    }
    return { responses, issues: null };
  }
}

export async function handlePrestartPhoto(event: any, channel: string, slackUserId: string) {
  const caption: string = (event.text ?? "").trim();
  const files = Array.isArray(event.files) ? event.files : [];

  const person = await resolveSender(slackUserId);
  if (!person) {
    await dmUser(slackUserId, "I don't have you in the crew register. Ask admin to add you.");
    return;
  }

  // Try to resolve asset from caption first, then fall back to today's allocation.
  let asset = await resolveAssetByText(caption);
  if (!asset) asset = await resolveAssetForOperator(person.id);
  if (!asset) {
    await dmUser(slackUserId, "Couldn't work out which asset. Mention the asset code, e.g. 'pre-start EX01'.");
    return;
  }

  const { data: tmpl } = await supabaseAdmin
    .from("plant_prestart_templates")
    .select("checklist_items")
    .eq("asset_id", asset.id)
    .maybeSingle();
  const template = ((tmpl?.checklist_items as any[]) ?? []).map((c) => ({ id: c.id, label: c.label, type: c.type }));

  // Upload photo if present.
  let photoUrl: string | null = null;
  if (files.length > 0) {
    const dl = await downloadSlackFile(files[0]);
    if (dl) {
      const path = `${asset.id}/${melbToday()}-${person.id}.${mimeExt(dl.mime)}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("plant-prestart-evidence")
        .upload(path, dl.bytes, { contentType: dl.mime, upsert: true });
      if (!upErr) {
        const { data: pub } = supabaseAdmin.storage.from("plant-prestart-evidence").getPublicUrl(path);
        photoUrl = pub.publicUrl;
      } else {
        console.error("[prestart] upload failed:", upErr.message);
      }
    }
  }

  const { responses, issues } = await extractChecklist(
    caption,
    template,
    files.length > 0 ? (await downloadSlackFile(files[0]))?.bytes ?? null : null,
    files.length > 0 ? files[0].mimetype ?? "image/jpeg" : null,
  );

  const { error: upErr } = await supabaseAdmin
    .from("plant_prestart_logs")
    .upsert(
      {
        asset_id: asset.id,
        operator_person_id: person.id,
        prestart_date: melbToday(),
        checklist_responses: responses,
        issues_raised: issues,
        photo_url: photoUrl,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "asset_id,prestart_date" },
    );
  if (upErr) {
    console.error("[prestart] log upsert failed:", upErr.message);
    await dmUser(slackUserId, "Couldn't save that pre-start. Admin's been notified.");
    await dmAdmin(`Pre-start save failed for ${person.name} on ${asset.plant_id_code}: ${upErr.message}`);
    return;
  }

  await dmUser(slackUserId, `Pre-start logged for ${asset.plant_id_code}. Have a good one.`);

  if (issues) {
    const msg = `${person.name} flagged ${issues} on ${asset.plant_id_code} this morning.${photoUrl ? ` Photo: ${photoUrl}` : ""}`;
    if (person.default_supervisor_id) {
      const { data: supSlack } = await supabaseAdmin.rpc("get_supervisor_slack_id", {
        p_supervisor_person_id: person.default_supervisor_id,
      });
      const slackId = (supSlack as unknown as string | null) ?? null;
      if (slackId) await dmUser(slackId, msg);
    }
    await dmAdmin(msg);
  }
}

export async function handlePrestartQuery(text: string, slackUserId: string) {
  const m = text.match(PRESTART_QUERY_PATTERN);
  if (!m) return;
  const assetCode = m[1];

  const { data: asset } = await supabaseAdmin
    .from("plant_items")
    .select("id, plant_id_code, description")
    .ilike("plant_id_code", assetCode)
    .maybeSingle();
  if (!asset) {
    await dmUser(slackUserId, `No asset matches "${assetCode}".`);
    return;
  }

  const today = melbToday();
  const [{ data: lastLog }, { data: lastService }, { data: alloc }] = await Promise.all([
    supabaseAdmin
      .from("plant_prestart_logs")
      .select("prestart_date, operator_person_id, issues_raised, crew_members:operator_person_id(name)")
      .eq("asset_id", asset.id)
      .order("prestart_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("plant_service_logs")
      .select("service_date")
      .eq("asset_id", asset.id)
      .order("service_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("daily_allocations")
      .select("person_id")
      .eq("allocation_date", today)
      .overlaps("plant_asset_ids", [asset.id])
      .limit(1)
      .maybeSingle(),
  ]);

  let currentOp = "(unassigned)";
  if (alloc?.person_id) {
    const { data: c } = await supabaseAdmin.from("crew_members").select("name").eq("id", alloc.person_id).maybeSingle();
    if (c?.name) currentOp = c.name;
  }

  const ll = lastLog as any;
  const lastBit = ll
    ? `last pre-started ${ll.prestart_date} by ${ll.crew_members?.name ?? "—"}, ${ll.issues_raised ? `issues: ${ll.issues_raised}` : "pass"}`
    : "no pre-start on record";
  const svcBit = lastService?.service_date ? `last service ${lastService.service_date}` : "no service on record";

  await postToSlack(
    slackUserId,
    `${asset.plant_id_code} — ${lastBit}. Currently with ${currentOp}. ${svcBit}.`,
  );
}
