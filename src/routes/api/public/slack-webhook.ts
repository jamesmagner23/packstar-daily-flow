import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SLACK_DAILY_FLOW_PROMPT } from "@/lib/prompts/slack-daily-flow";
import { persistComputedReport, notifyDirectorOnWrap } from "@/lib/evening-summary/persist";

const MODEL = "claude-sonnet-4-5";
const MELB_TZ = "Australia/Melbourne";

type ChatMsg = { role: "user" | "assistant"; content: string; timestamp: string };

function melbDateISO(d = new Date()): string {
  // YYYY-MM-DD in Melbourne tz
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MELB_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

function melbHHMM(d = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MELB_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function melbLongDate(d = new Date()): string {
  // e.g. "Thursday 14 May 2026"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MELB_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

function firstName(full: string): string {
  return (full ?? "").trim().split(/\s+/)[0] ?? "mate";
}

function extractSaveBlock(text: string): { reply: string; save: any | null } {
  const m = text.match(/<save>([\s\S]*?)<\/save>/i);
  if (!m) return { reply: text.trim(), save: null };
  const raw = m[1].trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  let save: any = null;
  try {
    save = JSON.parse(raw);
  } catch (e) {
    console.error("[slack-webhook] save JSON parse failed:", (e as Error).message);
  }
  const reply = text.replace(/<save>[\s\S]*?<\/save>/i, "").trim();
  return { reply, save };
}

async function postToSlack(channel: string, text: string) {
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, text }),
    });
    const data: any = await res.json();
    if (!data.ok) console.error("[slack-webhook] chat.postMessage failed:", data.error);
    return data;
  } catch (e) {
    console.error("[slack-webhook] chat.postMessage threw:", (e as Error).message);
    return null;
  }
}

async function processEvent(body: any) {
  const event = body?.event;
  if (!event) return;

  // Filter
  if (event.type !== "message") {
    console.log("[slack-webhook] skip: type", event.type);
    return;
  }
  if (event.channel_type !== "im") {
    console.log("[slack-webhook] skip: channel_type", event.channel_type);
    return;
  }
  if (event.bot_id) {
    console.log("[slack-webhook] skip: bot_id present");
    return;
  }
  // Slack stamps a subtype on lots of legitimate user messages
  // (file_share, thread_broadcast, etc). Only drop the ones that
  // aren't a fresh user message we want to capture.
  const SKIP_SUBTYPES = new Set([
    "bot_message",
    "message_changed",
    "message_deleted",
    "channel_join",
    "channel_leave",
    "tombstone",
  ]);
  if (event.subtype && SKIP_SUBTYPES.has(event.subtype)) {
    console.log("[slack-webhook] skip: subtype", event.subtype);
    return;
  }
  const botUserId: string | undefined = body.authorizations?.[0]?.user_id;
  if (botUserId && event.user === botUserId) {
    console.log("[slack-webhook] skip: bot's own message");
    return;
  }
  const slackUserId: string = event.user;
  const userText: string = (event.text ?? "").trim();
  const channel: string = event.channel;
  const hasFiles = Array.isArray(event.files) && event.files.length > 0;

  // Voice notes / file-only messages have no text. Claude rejects empty
  // user content, so nudge instead of calling the model.
  if (!userText) {
    console.log("[slack-webhook] empty text", { hasFiles, subtype: event.subtype });
    await postToSlack(
      channel,
      hasFiles
        ? "Can't listen to voice notes yet mate — type the wrap out and I'll log it."
        : "Didn't catch that — send it as text and I'll log it.",
    );
    return;
  }

  // Supervisor lookup
  const { data: supervisor, error: supErr } = await supabaseAdmin
    .from("supervisors")
    .select("id, name, project_id, active")
    .eq("slack_user_id", slackUserId)
    .maybeSingle();
  if (supErr) console.error("[slack-webhook] supervisor lookup error:", supErr.message);
  if (!supervisor) {
    console.log("[slack-webhook] unknown slack user, ignoring:", slackUserId);
    return;
  }
  if (!supervisor.project_id) {
    console.log("[slack-webhook] supervisor has no project assigned:", supervisor.name);
    return;
  }

  const supFirst = firstName(supervisor.name);
  const today = melbDateISO();

  // Load or create today's daily_report
  const tsPrefix = `[${melbHHMM()}] ${supFirst}: ${userText}\n`;
  let { data: report, error: repErr } = await supabaseAdmin
    .from("daily_reports")
    .select("*")
    .eq("supervisor_id", supervisor.id)
    .eq("report_date", today)
    .maybeSingle();
  if (repErr) console.error("[slack-webhook] report lookup error:", repErr.message);

  if (!report) {
    const { data: created, error: insErr } = await supabaseAdmin
      .from("daily_reports")
      .insert({
        supervisor_id: supervisor.id,
        project_id: supervisor.project_id,
        report_date: today,
        raw_transcript: tsPrefix,
        message_history: [],
      })
      .select("*")
      .single();
    if (insErr) {
      console.error("[slack-webhook] daily_reports insert failed:", insErr.message);
      await postToSlack(channel, "Bot's having a moment. Try again in a minute or just ping James direct.");
      return;
    }
    report = created;
  } else {
    const newTranscript = (report.raw_transcript ?? "") + tsPrefix;
    await supabaseAdmin
      .from("daily_reports")
      .update({ raw_transcript: newTranscript })
      .eq("id", report.id);
    report.raw_transcript = newTranscript;
  }

  // Load project context
  const projectId = supervisor.project_id;
  const [
    { data: project },
    { data: pits },
    { data: boq },
    { data: crew },
    { data: plant },
    { data: clauses },
    { data: triggers },
  ] = await Promise.all([
    supabaseAdmin.from("projects").select("*").eq("id", projectId).single(),
    supabaseAdmin.from("pits").select("pit_id, separable_portion_code, status").eq("project_id", projectId),
    supabaseAdmin.from("boq_lines").select("ref, category, description, material, diameter_mm, depth_band_m, pit_type, pit_dimensions_mm, unit, rate").eq("project_id", projectId),
    supabaseAdmin.from("crew_members").select("name, role").eq("project_id", projectId).eq("active", true),
    supabaseAdmin.from("plant_items").select("plant_id_code, description, tonnage_class").eq("project_id", projectId).eq("active", true),
    supabaseAdmin.from("variation_clauses").select("claim_type, clause_ref, notice_deadline_bd, early_warning_deadline_bd, full_report_deadline_bd, condition_precedent, notes").eq("project_id", projectId),
    supabaseAdmin.from("variation_triggers").select("keywords, claim_type, clause_ref").eq("project_id", projectId),
  ]);

  if (!project) {
    console.error("[slack-webhook] project not found:", projectId);
    await postToSlack(channel, "Bot's having a moment. Try again in a minute or just ping James direct.");
    return;
  }

  const hcRep = (project as any).head_contractor_rep ?? "the head contractor's rep";

  const systemPrompt = SLACK_DAILY_FLOW_PROMPT
    .replaceAll("{{SUPERVISOR_FIRST_NAME}}", supFirst)
    .replaceAll("{{TODAY_DATE}}", melbLongDate())
    .replaceAll("{{PROJECT_NAME}}", project.name)
    .replaceAll("{{HEAD_CONTRACTOR}}", project.head_contractor)
    .replaceAll("{{HC_REP_NAME}}", hcRep)
    .replaceAll("{{PIT_REGISTER_JSON}}", JSON.stringify(pits ?? []))
    .replaceAll("{{BOQ_JSON}}", JSON.stringify(boq ?? []))
    .replaceAll("{{CREW_TODAY_JSON}}", JSON.stringify(crew ?? []))
    .replaceAll("{{PLANT_TODAY_JSON}}", JSON.stringify(plant ?? []))
    .replaceAll("{{VARIATION_CLAUSES_JSON}}", JSON.stringify(clauses ?? []))
    .replaceAll("{{VARIATION_TRIGGERS_JSON}}", JSON.stringify(triggers ?? []));

  // Reconstruct conversation
  const history: ChatMsg[] = Array.isArray(report.message_history)
    ? (report.message_history as ChatMsg[])
    : [];
  const nowIso = new Date().toISOString();
  const newUserMsg: ChatMsg = { role: "user", content: userText, timestamp: nowIso };
  const messages = [...history, newUserMsg].map((m) => ({ role: m.role, content: m.content }));

  // Call Claude with prompt caching on the system block
  let replyText = "Bot's having a moment. Try again in a minute or just ping James direct.";
  let assistantText = "";
  let usage: any = null;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });
    usage = response.usage;
    assistantText = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    const parsed = extractSaveBlock(assistantText);
    replyText = parsed.reply || "Got it.";
    var saveBlock = parsed.save;
    console.log("[slack-webhook] claude usage:", JSON.stringify(usage));
  } catch (e) {
    console.error("[slack-webhook] anthropic call failed:", (e as Error).message);
    await postToSlack(channel, replyText);
    return;
  }

  // Persist conversation turns + structured updates
  const newAssistantMsg: ChatMsg = { role: "assistant", content: assistantText, timestamp: new Date().toISOString() };
  const updatedHistory: ChatMsg[] = [...history, newUserMsg, newAssistantMsg];

  const updates: Record<string, any> = { message_history: updatedHistory };
  if (saveBlock && typeof saveBlock === "object") {
    if ("works_completed" in saveBlock) updates.works_completed = saveBlock.works_completed;
    if ("crew_hours" in saveBlock) updates.crew_hours = saveBlock.crew_hours;
    if ("plant_hours" in saveBlock) updates.plant_hours = saveBlock.plant_hours;
    if ("productivity_note" in saveBlock && saveBlock.productivity_note != null) {
      updates.productivity_note = saveBlock.productivity_note;
    }
    if (saveBlock.complete === true) updates.complete = true;
  }

  const { error: updErr } = await supabaseAdmin
    .from("daily_reports")
    .update(updates as any)
    .eq("id", report.id);
  if (updErr) console.error("[slack-webhook] daily_reports update failed:", updErr.message);

  // Variation flags: upsert on natural key (daily_report_id, claim_type, clause_ref, trigger_phrase)
  // so re-mentions of the same claim across turns update the existing row instead of duplicating.
  if (saveBlock && Array.isArray(saveBlock.variation_flags)) {
    for (const vf of saveBlock.variation_flags) {
      try {
        const noticeBd: number = Number(vf.notice_deadline_bd ?? 1);
        const deadline = addBusinessDays(new Date(), noticeBd);
        const triggerPhrase: string | null = vf.trigger_phrase ?? null;

        // Look up existing row by natural key (matches the unique expression index)
        let existingQuery = supabaseAdmin
          .from("variation_flags")
          .select("id")
          .eq("daily_report_id", report.id)
          .eq("claim_type", vf.claim_type)
          .eq("clause_ref", vf.clause_ref);
        existingQuery = triggerPhrase === null
          ? existingQuery.is("trigger_phrase", null)
          : existingQuery.eq("trigger_phrase", triggerPhrase);
        const { data: existing, error: exErr } = await existingQuery.maybeSingle();
        if (exErr) console.error("[slack-webhook] variation_flag lookup failed:", exErr.message);

        const payload = {
          daily_report_id: report.id,
          project_id: projectId,
          claim_type: vf.claim_type,
          clause_ref: vf.clause_ref,
          trigger_phrase: triggerPhrase,
          notice_deadline_bd: noticeBd,
          deadline_at: deadline.toISOString(),
          duration_impact_hours: vf.duration_impact_hours ?? null,
          symal_rep_saw: vf.hc_rep_saw ?? null,
          status: "flagged",
        };

        if (existing?.id) {
          const { error: vfErr } = await supabaseAdmin
            .from("variation_flags")
            .update(payload)
            .eq("id", existing.id);
          if (vfErr) console.error("[slack-webhook] variation_flag update failed:", vfErr.message);
        } else {
          const { error: vfErr } = await supabaseAdmin.from("variation_flags").insert(payload);
          if (vfErr) console.error("[slack-webhook] variation_flag insert failed:", vfErr.message);
        }
      } catch (e) {
        console.error("[slack-webhook] variation_flag loop error:", (e as Error).message);
      }
    }
  }

  // Recompute and persist totals after every update so the dashboard reflects
  // in-progress wraps, not just completed ones.
  try {
    await persistComputedReport(report.id);
  } catch (e) {
    console.error("[slack-webhook] incremental recompute failed:", (e as Error).message);
  }

  // If the wrap just flipped to complete, also DM the director.
  const justCompleted = updates.complete === true && report.complete !== true;
  if (justCompleted) {
    try {
      const computed = await persistComputedReport(report.id);
      const { count: vfCount } = await supabaseAdmin
        .from("variation_flags")
        .select("id", { count: "exact", head: true })
        .eq("daily_report_id", report.id);
      const siteOrigin = process.env.SITE_ORIGIN ?? "https://packstar-daily-flow.lovable.app";
      await notifyDirectorOnWrap({
        reportId: report.id,
        projectId: projectId as string,
        supervisorName: supervisor.name,
        productivityPct: computed.productivity_pct,
        variationCount: vfCount ?? 0,
        siteOrigin,
      });
    } catch (e) {
      console.error("[slack-webhook] post-complete pipeline failed:", (e as Error).message);
    }
  }

  console.log(
    "[slack-webhook] processed",
    JSON.stringify({
      event_id: body.event_id,
      supervisor: supervisor.name,
      msg_preview: userText.slice(0, 80),
      report_id: report.id,
      save_present: !!saveBlock,
      usage,
    }),
  );

  // Post reply
  const post = await postToSlack(channel, replyText);
  console.log("[slack-webhook] slack post ok:", post?.ok ?? false);
}

export const Route = createFileRoute("/api/public/slack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        let payload: any = null;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          // form-encoded etc
        }

        // 1. URL verification handshake (unsigned, must run first)
        if (payload?.type === "url_verification" && typeof payload.challenge === "string") {
          return new Response(payload.challenge, {
            status: 200,
            headers: { "content-type": "text/plain" },
          });
        }

        // 2. Signature verification
        const signingSecret = process.env.SLACK_SIGNING_SECRET;
        if (!signingSecret) {
          console.error("[slack-webhook] SLACK_SIGNING_SECRET not set");
          return new Response("Server misconfigured", { status: 500 });
        }
        const ts = request.headers.get("x-slack-request-timestamp") ?? "";
        const sig = request.headers.get("x-slack-signature") ?? "";
        const fiveMinutes = 60 * 5;
        if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > fiveMinutes) {
          return new Response("Stale request", { status: 401 });
        }
        const base = `v0:${ts}:${rawBody}`;
        const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;
        const a = Buffer.from(expected);
        const b = Buffer.from(sig);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Bad signature", { status: 401 });
        }

        // 3. Process event. Await so the Worker doesn't kill background work
        // when the response returns. Slack retries (x-slack-retry-num) are
        // ack'd immediately to prevent duplicate processing while Claude runs.
        if (payload?.type === "event_callback") {
          if (request.headers.get("x-slack-retry-num")) {
            console.log("[slack-webhook] ignoring slack retry", {
              event_id: payload.event_id,
              retry_num: request.headers.get("x-slack-retry-num"),
              retry_reason: request.headers.get("x-slack-retry-reason"),
            });
            return new Response("", { status: 200 });
          }
          try {
            await processEvent(payload);
          } catch (e) {
            console.error("[slack-webhook] processEvent threw:", (e as Error).message);
          }
        } else {
          console.log("[slack-webhook] non-event payload type:", payload?.type);
        }

        return new Response("", { status: 200 });
      },
    },
  },
});
