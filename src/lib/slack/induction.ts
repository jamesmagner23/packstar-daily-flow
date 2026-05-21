// Phase 3 — Induction photo submission handler.
// Trigger: DM with file attachment + caption that looks like a site induction
// ("induction", "inducted", or a known site name in the caption).
//
// Mirrors the photo-ticket flow but writes person_inductions + uploads to
// the induction-evidence bucket. Claude extracts: site name (matched against
// sites table), completed date, optional expiry.

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmAdmin, dmUser, siteOrigin } from "./post";

const MODEL = "claude-sonnet-4-5";
const CONFIDENCE_THRESHOLD = 0.8;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

const INDUCTION_KEYWORDS = [
  "induction", "inducted", "site induction", "hammertech", "3d safety",
  "checkrite", "simpel",
];

export function looksLikeInductionCaption(text: string, knownSiteNames: string[] = []): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  if (INDUCTION_KEYWORDS.some((kw) => t.includes(kw))) return true;
  return knownSiteNames.some((n) => n && t.includes(n.toLowerCase()));
}

const EXTRACTION_SYSTEM_PROMPT = `You extract site induction details from a screenshot or photo of a
construction site induction certificate / completion screen (e.g. HammerTech,
3D Safety, Checkrite, Simpel, or an in-person induction card).

Output ONLY a single JSON object matching the schema below. No prose, no
markdown fences.

Schema:
{
  "site_name": "<the site / project name as printed, e.g. 'MVRC' or 'Melbourne Victory Recreation Centre'>",
  "site_name_confidence": <float 0..1>,
  "completed_date": "<YYYY-MM-DD or null>",
  "completed_date_confidence": <float 0..1>,
  "expires_date": "<YYYY-MM-DD or null — null if no expiry shown>",
  "expires_date_confidence": <float 0..1>,
  "notes": "<short free text, e.g. 'HammerTech completion screen', 'No expiry visible'>"
}

Date format strictly YYYY-MM-DD. Convert DD/MM/YYYY → YYYY-MM-DD.
If no explicit expiry, set expires_date null and expires_date_confidence 1.0.

If the image does NOT show a readable completion date but the caption supplies
a natural-language date ("today", "yesterday", "this morning", "last friday"),
resolve it against the supplied "Today (Melbourne)" date and use that as
completed_date with confidence 0.85. Never invent dates with no source.`;

function melbToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

type Extracted = {
  site_name: string;
  site_name_confidence: number;
  completed_date: string | null;
  completed_date_confidence: number;
  expires_date: string | null;
  expires_date_confidence: number;
  notes: string;
};

type SlackFile = {
  id: string;
  name?: string;
  mimetype?: string;
  url_private?: string;
  filetype?: string;
};

type PersonRow = { id: string; name: string };

async function resolveSender(slackUserId: string): Promise<PersonRow | null> {
  const { data: crewDirect } = await supabaseAdmin
    .from("crew_members")
    .select("id, name")
    .eq("slack_user_id", slackUserId)
    .eq("active", true)
    .maybeSingle();
  return crewDirect ?? null;
}

async function downloadSlackFile(file: SlackFile) {
  if (!file.url_private) return null;
  try {
    const res = await fetch(file.url_private, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const mime = file.mimetype ?? res.headers.get("content-type") ?? "application/octet-stream";
    return { bytes: buf, mime };
  } catch (e) {
    console.error("[slack-induction] download threw:", (e as Error).message);
    return null;
  }
}

function mimeToExt(mime: string): string {
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("webp")) return "webp";
  return "bin";
}

async function callClaude(bytes: Uint8Array, mime: string, caption: string): Promise<Extracted | null> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64 = Buffer.from(bytes).toString("base64");
  const contentBlock: any =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mime, data: base64 } };
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: [{ type: "text", text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Today (Melbourne): ${melbToday()}\nCaption from the crew member: "${caption}"`,
            },
          ],
        },
      ],
    });
    const text = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned) as Extracted;
  } catch (e) {
    console.error("[slack-induction] anthropic failed:", (e as Error).message);
    return null;
  }
}

function minConfidence(x: Extracted): number {
  return Math.min(
    x.site_name_confidence ?? 0,
    x.completed_date_confidence ?? 0,
    x.expires_date_confidence ?? 0,
  );
}

async function matchSite(name: string): Promise<{ id: string; name: string } | null> {
  if (!name) return null;
  // Try exact ilike first, then trigram fuzzy.
  const { data: exact } = await supabaseAdmin
    .from("sites")
    .select("id, name")
    .ilike("name", name)
    .eq("active", true)
    .maybeSingle();
  if (exact) return exact;
  const { data: fuzzy } = await supabaseAdmin
    .from("sites")
    .select("id, name")
    .ilike("name", `%${name.split(/\s+/)[0]}%`)
    .eq("active", true)
    .limit(1);
  return fuzzy?.[0] ?? null;
}

export async function handleInductionPhoto(event: any, _channel: string, slackUserId: string) {
  const caption: string = (event.text ?? "").trim();
  const files: SlackFile[] = Array.isArray(event.files) ? event.files : [];
  if (files.length === 0) return;

  const person = await resolveSender(slackUserId);
  if (!person) {
    await dmUser(slackUserId, "I don't have you in the crew register yet. Ask admin to add you.");
    return;
  }

  const file = files[0];
  const mime = file.mimetype ?? "";
  if (!mime.startsWith("image/") && mime !== "application/pdf") {
    await dmUser(slackUserId, "Send the induction as a photo (jpg/png) or PDF.");
    return;
  }

  const downloaded = await downloadSlackFile(file);
  if (!downloaded) {
    await dmUser(slackUserId, "Couldn't pull that photo down. Try sending it again.");
    return;
  }

  const ext = mimeToExt(downloaded.mime);
  const ts = Date.now();
  const pendingPath = `${person.id}/pending-${ts}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("induction-evidence")
    .upload(pendingPath, downloaded.bytes, { contentType: downloaded.mime, upsert: false });
  if (upErr) {
    console.error("[slack-induction] upload failed:", upErr.message);
    await dmUser(slackUserId, "Bot's having a moment storing that. Try again in a minute.");
    return;
  }

  const extracted = await callClaude(downloaded.bytes, downloaded.mime, caption);
  if (!extracted) {
    await flagLow(person, slackUserId, caption, pendingPath, "extraction failed");
    return;
  }

  const site = await matchSite(extracted.site_name);
  const conf = minConfidence(extracted);
  if (!site || !extracted.completed_date || conf < CONFIDENCE_THRESHOLD) {
    await flagLow(
      person,
      slackUserId,
      caption,
      pendingPath,
      !site
        ? `unknown site "${extracted.site_name}"`
        : !extracted.completed_date
          ? "no completion date readable"
          : `low confidence ${conf.toFixed(2)}`,
    );
    return;
  }

  const finalPath = `${person.id}/${site.id}-${extracted.completed_date}.${ext}`;
  let evidencePath = pendingPath;
  if (finalPath !== pendingPath) {
    const { error: mvErr } = await supabaseAdmin.storage
      .from("induction-evidence")
      .move(pendingPath, finalPath);
    if (!mvErr) evidencePath = finalPath;
  }

  const { error: piErr } = await supabaseAdmin
    .from("person_inductions")
    .upsert(
      {
        person_id: person.id,
        site_id: site.id,
        status: "completed",
        completed_date: extracted.completed_date,
        expires_date: extracted.expires_date,
        evidence_url: evidencePath,
      },
      { onConflict: "person_id,site_id" },
    );
  if (piErr) {
    console.error("[slack-induction] upsert failed:", piErr.message);
    await dmUser(slackUserId, "Got the photo but couldn't save it. Admin's been notified.");
    await dmAdmin(`${person.name} submitted ${site.name} induction but DB write failed: ${piErr.message}. Photo: ${evidencePath}`);
    return;
  }

  const expiryStr = extracted.expires_date ?? "no expiry";
  await dmUser(
    slackUserId,
    `Logged ${site.name} induction (completed ${extracted.completed_date}, expires ${expiryStr}). Admin's been notified.`,
  );
  await dmAdmin(
    `${person.name} submitted ${site.name} induction, completed ${extracted.completed_date}, expires ${expiryStr}. Review: ${siteOrigin()}/crew/${person.id}`,
  );
}

async function flagLow(
  person: PersonRow,
  slackUserId: string,
  caption: string,
  pendingPath: string,
  reason: string,
) {
  await dmUser(slackUserId, "Got the photo but couldn't pull the details cleanly. Admin will sort it.");
  const { data: signed } = await supabaseAdmin.storage
    .from("induction-evidence")
    .createSignedUrl(pendingPath, SIGNED_URL_TTL_SECONDS);
  const url = signed?.signedUrl ?? "(signed URL unavailable)";
  await dmAdmin(
    `${person.name} submitted an induction photo but extraction was low-confidence (${reason}). Manual entry needed. Photo: ${url}. Caption: "${caption}"`,
  );
}
