// Phase 2 — Photo + caption ticket submission handler.
// Trigger: DM with file attachment(s) AND caption matching the ticket pattern.

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmAdmin, dmUser, siteOrigin } from "./post";

const MODEL = "claude-sonnet-4-5";
const CONFIDENCE_THRESHOLD = 0.8;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const NON_EXPIRING_CODES = new Set(["WHITE_CARD"]);

const TICKET_KEYWORDS = [
  "ticket", "renewed", "renewal", "new ticket", "licence", "license",
  "white card", "ewp", "hr licence", "mr licence", "first aid", "cpr",
  "confined space", "working at heights", "traffic", "tmi", "tc",
  "excavator", "skid steer", "asbestos", "silica", "voc",
];

export function looksLikeTicketCaption(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return TICKET_KEYWORDS.some((kw) => t.includes(kw));
}

const EXTRACTION_SYSTEM_PROMPT = `You extract Australian construction ticket and licence details from a photo
or PDF of a credential. Output ONLY a single JSON object matching the schema
below. No prose, no markdown fences, no preamble.

Schema:
{
  "ticket_type_code": "<one of the codes below, or null>",
  "ticket_type_name": "<the human-readable competency name>",
  "ticket_type_confidence": <float 0..1>,
  "issued_date": "<YYYY-MM-DD or null>",
  "issued_date_confidence": <float 0..1>,
  "expiry_date": "<YYYY-MM-DD or null>",
  "expiry_date_confidence": <float 0..1>,
  "notes": "<short free text, e.g. 'No expiry — white card is non-expiring' or 'Date partially obscured'>"
}

Known competency codes in this system:
- WHITE_CARD         Construction Induction (White Card)        non-expiring
- HR_LICENCE         Heavy Rigid Licence                        expires
- MR_LICENCE         Medium Rigid Licence                       expires
- EWP_BELOW11        EWP < 11m (Yellow Card)                    expires (typically 5y)
- EWP_LICENCE        WP Licence (>11m)                          expires
- TMI                Traffic Management Implementer             expires (typically 3y)
- TC                 Traffic Controller                         expires (typically 3y)
- CONFINED_SPACE     Confined Space Entry                       expires (typically 2y)
- WORKING_AT_HEIGHTS Working at Heights                         expires (typically 2y)
- FIRST_AID          First Aid (HLTAID011)                      expires (3y)
- CPR                CPR (HLTAID009)                            expires (1y)
- EXCAVATOR_TICKET   Excavator VOC                              varies
- SKID_STEER         Skid Steer VOC                             varies
- ASBESTOS_AWARE     Asbestos Awareness                         varies
- SILICA_AWARE       Silica Awareness                           varies

If the credential is non-expiring (e.g. White Card), set expiry_date to null
and expiry_date_confidence to 1.0.

If the credential type is clearly not in the list, set ticket_type_code to
null and put the closest human name in ticket_type_name. The handler will
flag it for manual admin review.

Date format strictly YYYY-MM-DD. If the date on the card is in DD/MM/YYYY
Australian format, convert it. If a year is two digits, assume 20XX.

Confidence calibration:
- 1.0: the value is clearly printed and unambiguous
- 0.85: confident but minor uncertainty (one blurred digit, slight glare)
- 0.6: partial reading, plausible inference
- 0.3 or below: guessing`;

type Extracted = {
  ticket_type_code: string | null;
  ticket_type_name: string;
  ticket_type_confidence: number;
  issued_date: string | null;
  issued_date_confidence: number;
  expiry_date: string | null;
  expiry_date_confidence: number;
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
  // Primary: direct match on crew_members.slack_user_id
  const { data: crewDirect } = await supabaseAdmin
    .from("crew_members")
    .select("id, name")
    .eq("slack_user_id", slackUserId)
    .eq("active", true)
    .maybeSingle();
  if (crewDirect) return crewDirect;

  // Fallback: supervisor slack_user_id → name match on crew_members.
  // Retained during backfill; remove once all crew have slack_user_id populated.
  const { data: sup } = await supabaseAdmin
    .from("supervisors")
    .select("name")
    .eq("slack_user_id", slackUserId)
    .maybeSingle();
  if (sup?.name) {
    const { data: crew } = await supabaseAdmin
      .from("crew_members")
      .select("id, name")
      .ilike("name", sup.name)
      .eq("active", true)
      .maybeSingle();
    if (crew) {
      console.warn(
        `[slack-photo] resolved sender ${slackUserId} via supervisor name fallback (${sup.name}); backfill crew_members.slack_user_id to retire this path`,
      );
      return crew;
    }
  }
  return null;
}

async function downloadSlackFile(file: SlackFile): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!file.url_private) return null;
  try {
    const res = await fetch(file.url_private, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    });
    if (!res.ok) {
      console.error("[slack-photo] file download failed:", res.status, res.statusText);
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const mime = file.mimetype ?? res.headers.get("content-type") ?? "application/octet-stream";
    return { bytes: buf, mime };
  } catch (e) {
    console.error("[slack-photo] file download threw:", (e as Error).message);
    return null;
  }
}

function extToMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "pdf") return "application/pdf";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "application/octet-stream";
}

function mimeToExt(mime: string): string {
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "bin";
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function callClaudeExtraction(
  bytes: Uint8Array,
  mime: string,
  caption: string,
): Promise<Extracted | null> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64 = bytesToBase64(bytes);

  const contentBlock: any =
    mime === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mime, data: base64 },
        };

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: [
        { type: "text", text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            { type: "text", text: `Caption from the crew member: "${caption}"` },
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
    const parsed = JSON.parse(cleaned);
    return parsed as Extracted;
  } catch (e) {
    console.error("[slack-photo] anthropic extraction failed:", (e as Error).message);
    return null;
  }
}

function minConfidence(x: Extracted): number {
  let exp = x.expiry_date_confidence;
  if (x.ticket_type_code && NON_EXPIRING_CODES.has(x.ticket_type_code)) exp = 1.0;
  return Math.min(x.ticket_type_confidence ?? 0, x.issued_date_confidence ?? 0, exp ?? 0);
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "never";
  return iso;
}

export async function handlePhotoTicket(event: any, channel: string, slackUserId: string) {
  const caption: string = (event.text ?? "").trim();
  const files: SlackFile[] = Array.isArray(event.files) ? event.files : [];
  if (files.length === 0) return;

  const person = await resolveSender(slackUserId);
  if (!person) {
    await dmUser(
      slackUserId,
      "I don't have you in the crew register yet. Ask admin to add you.",
    );
    return;
  }

  if (files.length > 1) {
    await dmUser(
      slackUserId,
      "I only processed the first photo. Resend the others separately.",
    );
  }

  const file = files[0];
  const declaredMime = file.mimetype ?? (file.name ? extToMime(file.name) : "");
  if (
    !declaredMime ||
    (!declaredMime.startsWith("image/") && declaredMime !== "application/pdf")
  ) {
    await dmUser(slackUserId, "Send the ticket as a photo (jpg/png) or PDF — that file type didn't work.");
    return;
  }

  const downloaded = await downloadSlackFile(file);
  if (!downloaded) {
    await dmUser(slackUserId, "Couldn't pull that photo down from Slack. Try sending it again.");
    return;
  }

  const ext = mimeToExt(downloaded.mime);
  const ts = Date.now();
  const pendingPath = `${person.id}/pending-${ts}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("ticket-evidence")
    .upload(pendingPath, downloaded.bytes, { contentType: downloaded.mime, upsert: false });
  if (upErr) {
    console.error("[slack-photo] storage upload failed:", upErr.message);
    await dmUser(slackUserId, "Bot's having a moment storing that photo. Try again in a minute.");
    return;
  }

  const extracted = await callClaudeExtraction(downloaded.bytes, downloaded.mime, caption);
  if (!extracted) {
    await flagLowConfidence(person, slackUserId, caption, pendingPath, "extraction failed");
    return;
  }

  let competency: { id: string; code: string; name: string } | null = null;
  if (extracted.ticket_type_code) {
    const { data: comp } = await supabaseAdmin
      .from("competencies")
      .select("id, code, name")
      .eq("code", extracted.ticket_type_code)
      .maybeSingle();
    if (comp) competency = comp;
  }

  const conf = minConfidence(extracted);
  const codeUnknown = !competency;

  if (codeUnknown || conf < CONFIDENCE_THRESHOLD) {
    await flagLowConfidence(
      person,
      slackUserId,
      caption,
      pendingPath,
      codeUnknown
        ? `unknown competency type (model said "${extracted.ticket_type_name}")`
        : `low confidence ${conf.toFixed(2)}`,
    );
    return;
  }

  const finalPath = `${person.id}/${competency!.code}-${extracted.issued_date ?? "unknown"}.${ext}`;
  let evidencePath = pendingPath;
  if (finalPath !== pendingPath) {
    const { error: mvErr } = await supabaseAdmin.storage
      .from("ticket-evidence")
      .move(pendingPath, finalPath);
    if (mvErr) {
      console.error("[slack-photo] storage move failed (keeping pending):", mvErr.message);
    } else {
      evidencePath = finalPath;
    }
  }

  const { error: pcErr } = await supabaseAdmin
    .from("person_competencies")
    .upsert(
      {
        person_id: person.id,
        competency_id: competency!.id,
        issued_date: extracted.issued_date,
        expiry_date: extracted.expiry_date,
        evidence_url: evidencePath,
      },
      { onConflict: "person_id,competency_id" },
    );
  if (pcErr) {
    console.error("[slack-photo] person_competencies upsert failed:", pcErr.message);
    await dmUser(slackUserId, "Got the photo but couldn't save it. Admin's been notified.");
    await dmAdmin(
      `${person.name} submitted ${competency!.name} but DB write failed: ${pcErr.message}. Photo: ${evidencePath}`,
    );
    return;
  }

  await dmUser(
    slackUserId,
    `Logged ${competency!.name}, expires ${formatExpiry(extracted.expiry_date)}. Admin's been notified. If anything's off, let them know.`,
  );
  await dmAdmin(
    `${person.name} submitted ${competency!.name}, expires ${formatExpiry(extracted.expiry_date)}. Review: ${siteOrigin()}/crew/${person.id}`,
  );
}

async function flagLowConfidence(
  person: PersonRow,
  slackUserId: string,
  caption: string,
  pendingPath: string,
  reason: string,
) {
  console.log("[slack-photo] low-confidence path:", reason, "person:", person.name);
  await dmUser(
    slackUserId,
    "Got the photo but couldn't pull the details cleanly. Admin will sort it from here.",
  );
  const { data: signed } = await supabaseAdmin.storage
    .from("ticket-evidence")
    .createSignedUrl(pendingPath, SIGNED_URL_TTL_SECONDS);
  const url = signed?.signedUrl ?? "(signed URL unavailable)";
  await dmAdmin(
    `${person.name} submitted a ticket photo but extraction confidence was low (${reason}). Manual entry needed. Photo: ${url}. Their caption: "${caption}"`,
  );
}
