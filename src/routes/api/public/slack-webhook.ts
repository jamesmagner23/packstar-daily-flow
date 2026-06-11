import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SLACK_DAILY_FLOW_PROMPT } from "@/lib/prompts/slack-daily-flow";
import { SLACK_PILING_FLOW_PROMPT } from "@/lib/prompts/slack-piling-flow";
import { persistComputedReport, notifyDirectorOnWrap } from "@/lib/evening-summary/persist";
import { handlePhotoTicket, looksLikeTicketCaption } from "@/lib/slack/photo-ticket";
import { handleProfileLookup, PROFILE_PATTERN } from "@/lib/slack/profile-lookup";
import { handleHandover, HANDOVER_PATTERN } from "@/lib/slack/handover";
import { handleExpiring, EXPIRING_PATTERN } from "@/lib/slack/expiring";
import { handleInductionPhoto, looksLikeInductionCaption } from "@/lib/slack/induction";
import { handleEligibilityQuery, ELIGIBILITY_PATTERN } from "@/lib/slack/eligibility-query";
import { handlePrestartPhoto, handlePrestartQuery, looksLikePrestartCaption, PRESTART_QUERY_PATTERN } from "@/lib/slack/prestart";

const MODEL = "google/gemini-3-flash-preview";
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

function melbLongDate(isoOrDate: string | Date = new Date()): string {
  // e.g. "Thursday 14 May 2026"
  // Accepts a YYYY-MM-DD string (rendered as that calendar date in Melb tz)
  // or a Date object.
  const d =
    typeof isoOrDate === "string"
      ? new Date(`${isoOrDate}T12:00:00+10:00`)
      : isoOrDate;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MELB_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function melbHour(d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MELB_TZ,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  return parseInt(parts.find((p) => p.type === "hour")!.value, 10);
}

// Walk back N business days (skip Sat/Sun) from an ISO date in Melbourne tz.
function previousBusinessDayISO(iso: string): string {
  // Treat the ISO as a Melbourne calendar date.
  const d = new Date(`${iso}T12:00:00+10:00`);
  do {
    d.setUTCDate(d.getUTCDate() - 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return melbDateISO(d);
}

// Which work-day a supervisor message should be attributed to.
// The daily prompt fires at 16:00 Melb. Anything before 14:00 is almost
// certainly catch-up for the previous business day, not "today".
function pickReportDate(d = new Date()): string {
  const todayIso = melbDateISO(d);
  const hour = melbHour(d);
  if (hour < 14) return previousBusinessDayISO(todayIso);
  // After 14:00 — if today is Sat/Sun, still attribute to last business day.
  const probe = new Date(`${todayIso}T12:00:00+10:00`);
  const dow = probe.getUTCDay();
  if (dow === 0 || dow === 6) return previousBusinessDayISO(todayIso);
  return todayIso;
}

// Backdated-wrap parser. Lets a supervisor prefix a message with a date so
// the wrap lands on the right report_date instead of "today". Returns null
// if no recognisable prefix is found. Supported shapes (case-insensitive):
//   "Tue 26 May", "Tuesday 26 May", "26 May", "26/5", "26/05", "26-05",
//   "26 May 2026" — optionally followed by " — ", " - ", ":" or whitespace.
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};
function parseDatePrefix(
  text: string,
  todayIso: string,
): { dateIso: string; remaining: string } | null {
  const trimmed = text.trimStart();
  // Optional weekday word, then either "DD Mon [YYYY]" or "DD/MM" or "DD-MM".
  const re = /^(?:(?:mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+)?(\d{1,2})[\s\/\-]+([A-Za-z]{3,9}|\d{1,2})(?:[\s\/\-]+(\d{2,4}))?\s*(?:[—\-:]\s*|\s+)/i;
  const m = trimmed.match(re);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  let month: number;
  const monTok = m[2].toLowerCase();
  if (/^\d+$/.test(monTok)) {
    month = parseInt(monTok, 10);
  } else {
    const mm = MONTHS[monTok];
    if (!mm) return null;
    month = mm;
  }
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const todayYear = parseInt(todayIso.slice(0, 4), 10);
  let year = m[3] ? parseInt(m[3], 10) : todayYear;
  if (year < 100) year += 2000;
  // If parsed date lands more than 7 days in the future, assume previous year
  // (e.g. user types "30 Dec" in early Jan).
  const candidate = `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  const today = new Date(`${todayIso}T12:00:00+10:00`);
  const cand = new Date(`${candidate}T12:00:00+10:00`);
  if (cand.getTime() - today.getTime() > 7 * 86400_000) {
    year -= 1;
  }
  const dateIso = `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  // Sanity: don't accept dates more than 14 days in the past either — guards
  // against misreading a measurement like "300 mm dia" as "30 0".
  const finalCand = new Date(`${dateIso}T12:00:00+10:00`);
  const daysDiff = (today.getTime() - finalCand.getTime()) / 86400_000;
  if (daysDiff > 14 || daysDiff < -7) return null;
  const remaining = trimmed.slice(m[0].length);
  return { dateIso, remaining };
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

// Stage weights for pit installation rollup. Keep in sync with slack-daily-flow.ts.
const PIT_STAGE_WEIGHTS: Record<string, number> = {
  install: 65,
  bandage: 15,
  base: 10,
  lid: 10,
};

function normalizeStage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.toLowerCase();
  if (s.includes("install") || s.includes("pit in position") || s.includes("set pit") || s.includes("place pit")) return "install";
  if (s.includes("bandage")) return "bandage";
  if (s.includes("base")) return "base";
  if (s.includes("lid")) return "lid";
  return null;
}

function buildPitStatus(
  pits: Array<{ pit_id: string }>,
  priorReports: Array<{ report_date: string; works_completed: any }>,
): Array<{ pit_id: string; overall_pct: number; stages_done: string[]; last_touched: string | null }> {
  const acc = new Map<string, { stages: Set<string>; last: string | null }>();
  for (const p of pits) acc.set(String(p.pit_id), { stages: new Set(), last: null });

  for (const rep of priorReports) {
    const lines = Array.isArray(rep.works_completed) ? rep.works_completed : [];
    for (const line of lines) {
      if (!line || typeof line !== "object") continue;
      const stage = normalizeStage((line as any).stage_type ?? (line as any).stage ?? (line as any).description);
      if (!stage) continue;
      const pitRefs: string[] = [];
      const fp = (line as any).from_pit;
      const tp = (line as any).to_pit;
      const pid = (line as any).pit_id;
      if (fp != null) pitRefs.push(String(fp));
      if (tp != null && tp !== fp) pitRefs.push(String(tp));
      if (pid != null && !pitRefs.includes(String(pid))) pitRefs.push(String(pid));
      for (const ref of pitRefs) {
        const key = ref.replace(/^pit\s*/i, "");
        if (!acc.has(key)) acc.set(key, { stages: new Set(), last: null });
        const entry = acc.get(key)!;
        entry.stages.add(stage);
        if (!entry.last || rep.report_date > entry.last) entry.last = rep.report_date;
      }
    }
  }

  return Array.from(acc.entries()).map(([pit_id, { stages, last }]) => ({
    pit_id,
    overall_pct: Array.from(stages).reduce((sum, s) => sum + (PIT_STAGE_WEIGHTS[s] ?? 0), 0),
    stages_done: Array.from(stages),
    last_touched: last,
  }));
}

function firstName(full: string): string {
  return (full ?? "").trim().split(/\s+/)[0] ?? "mate";
}

// Hand-rolled aliases for floater supervisors. Add new active projects here as
// they're stood up. Matched case-insensitively against the supervisor's first
// reply each evening to choose which project the wrap belongs to.
const PROJECT_ALIASES: Record<string, string[]> = {
  T100: ["thompsons", "thompson", "tr"],
  "CC0439-30-MAW": ["moonee", "valley", "mv", "racecourse"],
};

function matchProjectFromText(
  text: string,
  projects: { id: string; code: string; name: string }[],
): string | null {
  const t = (text ?? "").toLowerCase();
  for (const p of projects) {
    const code = (p.code ?? "").toLowerCase();
    if (code && t.includes(code)) return p.id;
    const aliases = PROJECT_ALIASES[p.code] ?? [];
    for (const a of aliases) {
      const re = new RegExp(`\\b${a.toLowerCase()}\\b`, "i");
      if (re.test(t)) return p.id;
    }
    // Fall back to substantive name tokens (>= 5 chars, skip generic words)
    const skip = new Set(["civil", "works", "drainage", "road", "racecourse"]);
    const tokens = (p.name ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (const tok of tokens) {
      if (tok.length >= 5 && !skip.has(tok) && t.includes(tok)) return p.id;
    }
  }
  return null;
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
  let userText: string = (event.text ?? "").trim();
  const channel: string = event.channel;
  const hasFiles = Array.isArray(event.files) && event.files.length > 0;

  // ===== Phase 2/3/4 dispatch =====


  // 1. Any file attachment → induction handler if caption looks like one,
  if (hasFiles) {
    const { data: siteRows } = await supabaseAdmin
      .from("sites")
      .select("name")
      .eq("active", true);
    const siteNames = (siteRows ?? []).map((s: any) => s.name as string);
    const isInduction = looksLikeInductionCaption(userText, siteNames);
    const isPrestart = looksLikePrestartCaption(userText);
    console.log("[slack-webhook] dispatch: photo", {
      hasCaption: looksLikeTicketCaption(userText),
      isInduction,
      isPrestart,
    });
    try {
      if (isInduction) {
        await handleInductionPhoto(event, channel, slackUserId);
      } else if (isPrestart) {
        await handlePrestartPhoto(event, channel, slackUserId);
      } else {
        await handlePhotoTicket(event, channel, slackUserId);
      }
    } catch (e) {
      console.error("[slack-webhook] photo handler threw:", (e as Error).message);
    }
    return;
  }
  // 2. profile / tickets <name>
  if (PROFILE_PATTERN.test(userText)) {
    console.log("[slack-webhook] dispatch: profile lookup");
    try {
      await handleProfileLookup(userText, slackUserId);
    } catch (e) {
      console.error("[slack-webhook] profile lookup handler threw:", (e as Error).message);
    }
    return;
  }
  // 3. expiring [days]
  if (EXPIRING_PATTERN.test(userText)) {
    console.log("[slack-webhook] dispatch: expiring");
    try {
      await handleExpiring(userText, slackUserId);
    } catch (e) {
      console.error("[slack-webhook] expiring handler threw:", (e as Error).message);
    }
    return;
  }
  // 4. can <name> do <site> [today|tomorrow|on friday]
  if (ELIGIBILITY_PATTERN.test(userText)) {
    console.log("[slack-webhook] dispatch: eligibility query");
    try {
      await handleEligibilityQuery(userText, slackUserId);
    } catch (e) {
      console.error("[slack-webhook] eligibility query handler threw:", (e as Error).message);
    }
    return;
  }
  // 5. pre-start / status / where's <asset>
  if (PRESTART_QUERY_PATTERN.test(userText)) {
    console.log("[slack-webhook] dispatch: prestart query");
    try {
      await handlePrestartQuery(userText, slackUserId);
    } catch (e) {
      console.error("[slack-webhook] prestart query handler threw:", (e as Error).message);
    }
    return;
  }
  // 6. text-only "all good" with no asset context — try operator's allocated asset
  if (looksLikePrestartCaption(userText) && /^\s*(all good|pre[-\s]?start done)/i.test(userText)) {
    console.log("[slack-webhook] dispatch: prestart text-only");
    try {
      await handlePrestartPhoto(event, channel, slackUserId);
    } catch (e) {
      console.error("[slack-webhook] prestart text-only threw:", (e as Error).message);
    }
    return;
  }
  // 7. Else → existing wrap conversation handler (unchanged below)


  // Voice notes / file-only messages have no text. Claude rejects empty
  // user content, so nudge instead of calling the model.
  if (!userText && !hasFiles) {
    console.log("[slack-webhook] empty event, skipping", { subtype: event.subtype });
    return;
  }
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

  const supFirst = firstName(supervisor.name);
  const defaultReportDate = pickReportDate();
  const calendarToday = melbDateISO();

  // Allow supervisors to backdate a wrap by prefixing the message with a date
  // (e.g. "Tue 26 May — mobilised excavator..."). Strip the prefix from the
  // user text so the parser/AI sees just the wrap content.
  const datePrefix = parseDatePrefix(userText, calendarToday);
  const today = datePrefix?.dateIso ?? defaultReportDate;
  if (datePrefix) userText = datePrefix.remaining;

  // Load or create today's daily_report
  const tsPrefix = `[${melbHHMM()}] ${supFirst}: ${userText}\n`;
  let { data: report, error: repErr } = await supabaseAdmin
    .from("daily_reports")
    .select("*")
    .eq("supervisor_id", supervisor.id)
    .eq("report_date", today)
    .maybeSingle();
  if (repErr) console.error("[slack-webhook] report lookup error:", repErr.message);

  let isNewReport = false;
  if (!report) {
    // First message of the day → supervisor must tell us which project.
    // Match userText against active projects (code, name tokens, aliases).
    const { data: activeProjects } = await supabaseAdmin
      .from("projects")
      .select("id, code, name")
      .eq("active", true);
    const matchedProjectId = matchProjectFromText(userText, activeProjects ?? []);

    if (!matchedProjectId) {
      const list = (activeProjects ?? [])
        .map((p: any) => `• *${p.name}* (${p.code})`)
        .join("\n");
      await postToSlack(
        channel,
        `Which job were you on today, ${supFirst}?\n${list}\nJust type the name or code.`,
      );
      return;
    }

    const { data: created, error: insErr } = await supabaseAdmin
      .from("daily_reports")
      .insert({
        supervisor_id: supervisor.id,
        project_id: matchedProjectId,
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
    isNewReport = true;
  } else {
    const newTranscript = (report.raw_transcript ?? "") + tsPrefix;
    await supabaseAdmin
      .from("daily_reports")
      .update({ raw_transcript: newTranscript })
      .eq("id", report.id);
    report.raw_transcript = newTranscript;
  }

  // Load project context
  const projectId = report.project_id as string;
  const [
    { data: project },
    { data: pits },
    { data: boq },
    { data: crew },
    { data: plant },
    { data: clauses },
    { data: triggers },
    { data: priorReports },
    { data: openHires },
    { data: pileSchedule },
    { data: labourRates },
  ] = await Promise.all([
    supabaseAdmin.from("projects").select("*").eq("id", projectId).single(),
    supabaseAdmin.from("pits").select("pit_id, separable_portion_code, status").eq("project_id", projectId),
    supabaseAdmin.from("boq_lines").select("ref, category, description, material, diameter_mm, depth_band_m, pit_type, pit_dimensions_mm, unit, rate").eq("project_id", projectId),
    supabaseAdmin.from("crew_members").select("name, role").eq("project_id", projectId).eq("active", true),
    supabaseAdmin.from("plant_items").select("plant_id_code, description, tonnage_class, rate_basis, daily_rate, weekly_rate").eq("project_id", projectId).eq("active", true),
    supabaseAdmin.from("variation_clauses").select("claim_type, clause_ref, notice_deadline_bd, early_warning_deadline_bd, full_report_deadline_bd, condition_precedent, notes").eq("project_id", projectId),
    supabaseAdmin.from("variation_triggers").select("keywords, claim_type, clause_ref").eq("project_id", projectId),
    supabaseAdmin
      .from("daily_reports")
      .select("report_date, works_completed")
      .eq("project_id", projectId)
      .neq("id", report.id)
      .order("report_date", { ascending: true }),
    supabaseAdmin
      .from("plant_hire_periods")
      .select("plant_id_code, on_date, rate_basis")
      .eq("project_id", projectId)
      .is("off_date", null),
    supabaseAdmin
      .from("pile_schedule")
      .select("pile_ref, sheet_ref, diameter_mm, design_depth_m, design_volume_m3, status")
      .eq("project_id", projectId)
      .order("pile_ref"),
    supabaseAdmin
      .from("labour_hire_rates")
      .select("kind, description, nt_rate, ot_rate, day_rate, classifications(classification, employment_type)")
      .eq("project_id", projectId),
  ]);

  if (!project) {
    console.error("[slack-webhook] project not found:", projectId);
    await postToSlack(channel, "Bot's having a moment. Try again in a minute or just ping James direct.");
    return;
  }

  const pitStatus = buildPitStatus(pits ?? [], priorReports ?? []);
  const hcRep = (project as any).head_contractor_rep ?? "the head contractor's rep";
  const rawType = (project as any).project_type ?? "lump_sum";
  const projectType = rawType === "piling_labour" ? "labour_hire" : rawType;

  const systemPrompt = projectType === "labour_hire"

    ? SLACK_PILING_FLOW_PROMPT
        .replaceAll("{{SUPERVISOR_FIRST_NAME}}", supFirst)
        .replaceAll("{{TODAY_DATE}}", melbLongDate(today))
        .replaceAll("{{PROJECT_NAME}}", project.name)
        .replaceAll("{{HEAD_CONTRACTOR}}", project.head_contractor)
        .replaceAll("{{PILE_SCHEDULE_JSON}}", JSON.stringify(pileSchedule ?? []))
        .replaceAll("{{CREW_TODAY_JSON}}", JSON.stringify(crew ?? []))
        .replaceAll("{{PLANT_TODAY_JSON}}", JSON.stringify(plant ?? []))
        .replaceAll("{{LABOUR_RATES_JSON}}", JSON.stringify(labourRates ?? []))
        .replaceAll("{{VARIATION_CLAUSES_JSON}}", JSON.stringify(clauses ?? []))
        .replaceAll("{{VARIATION_TRIGGERS_JSON}}", JSON.stringify(triggers ?? []))
    : SLACK_DAILY_FLOW_PROMPT
        .replaceAll("{{SUPERVISOR_FIRST_NAME}}", supFirst)
        .replaceAll("{{TODAY_DATE}}", melbLongDate(today))
        .replaceAll("{{PROJECT_NAME}}", project.name)
        .replaceAll("{{HEAD_CONTRACTOR}}", project.head_contractor)
        .replaceAll("{{HC_REP_NAME}}", hcRep)
        .replaceAll("{{PIT_REGISTER_JSON}}", JSON.stringify(pits ?? []))
        .replaceAll("{{PIT_STATUS_JSON}}", JSON.stringify(pitStatus))
        .replaceAll("{{BOQ_JSON}}", JSON.stringify(boq ?? []))
        .replaceAll("{{CREW_TODAY_JSON}}", JSON.stringify(crew ?? []))
        .replaceAll("{{PLANT_TODAY_JSON}}", JSON.stringify(plant ?? []))
        .replaceAll("{{VARIATION_CLAUSES_JSON}}", JSON.stringify(clauses ?? []))
        .replaceAll("{{VARIATION_TRIGGERS_JSON}}", JSON.stringify(triggers ?? []))
        .replaceAll("{{OPEN_HIRES_JSON}}", JSON.stringify(openHires ?? []));

  // Reconstruct conversation
  const history: ChatMsg[] = Array.isArray(report.message_history)
    ? (report.message_history as ChatMsg[])
    : [];
  const nowIso = new Date().toISOString();
  const newUserMsg: ChatMsg = { role: "user", content: userText, timestamp: nowIso };
  const messages = [...history, newUserMsg].map((m) => ({ role: m.role, content: m.content }));

  // Call Lovable AI for the next bot reply + structured save block.
  let replyText = "Bot's having a moment. Try again in a minute or just ping James direct.";
  let assistantText = "";
  let usage: any = null;
  try {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY is not set");
    const gateway = createOpenAICompatible({
      name: "lovable-ai",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "Lovable-API-Key": key },
    });
    const response = await generateText({
      model: gateway(MODEL),
      system: systemPrompt,
      messages: messages as any,
      maxOutputTokens: 1024,
      temperature: 0.2,
    });
    usage = response.usage;
    assistantText = response.text.trim();
    const parsed = extractSaveBlock(assistantText);
    replyText = parsed.reply || "Got it.";
    var saveBlock = parsed.save;
    console.log("[slack-webhook] ai usage:", JSON.stringify(usage));
  } catch (e) {
    console.error("[slack-webhook] ai call failed:", (e as Error).message);
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

  // ===== Piling labour-hire: piles drilled, pours, cage deliveries =====
  // pile_schedule rows are upserted via pile_events. concrete_dockets and
  // cage_deliveries get one row per save event so the client report can
  // pull them straight back out.
  const resolvePileId = async (ref: string): Promise<string | null> => {
    if (!ref) return null;
    const { data } = await supabaseAdmin
      .from("pile_schedule")
      .select("id")
      .eq("project_id", projectId)
      .eq("pile_ref", ref.trim())
      .maybeSingle();
    return data?.id ?? null;
  };

  if (saveBlock && Array.isArray(saveBlock.piles_drilled)) {
    for (const p of saveBlock.piles_drilled) {
      try {
        const ref = String(p.pile_ref ?? "").trim();
        if (!ref) continue;
        const pileId = await resolvePileId(ref);
        if (!pileId) {
          console.warn("[slack-webhook] piles_drilled: unknown pile_ref", ref);
          continue;
        }
        // Idempotent: skip if a drilled event already exists for this pile today.
        const { data: existing } = await supabaseAdmin
          .from("pile_events")
          .select("id")
          .eq("pile_id", pileId)
          .eq("event_date", today)
          .eq("event_type", "drilled")
          .maybeSingle();
        if (existing?.id) continue;
        await supabaseAdmin.from("pile_events").insert({
          project_id: projectId,
          pile_id: pileId,
          event_date: today,
          event_type: "drilled",
          daily_report_id: report.id,
          notes: p.notes ?? null,
        });
        await supabaseAdmin
          .from("pile_schedule")
          .update({ status: "drilled" })
          .eq("id", pileId)
          .neq("status", "poured")
          .neq("status", "complete");
      } catch (e) {
        console.error("[slack-webhook] piles_drilled loop error:", (e as Error).message);
      }
    }
  }

  if (saveBlock && Array.isArray(saveBlock.concrete_pours)) {
    for (const pour of saveBlock.concrete_pours) {
      try {
        const ref = String(pour.pile_ref ?? "").trim();
        const pileId = ref ? await resolvePileId(ref) : null;
        const vol = pour.volume_m3 != null ? Number(pour.volume_m3) : null;
        // pile_events: poured
        if (pileId) {
          const { data: existing } = await supabaseAdmin
            .from("pile_events")
            .select("id")
            .eq("pile_id", pileId)
            .eq("event_date", today)
            .eq("event_type", "poured")
            .maybeSingle();
          if (!existing?.id) {
            await supabaseAdmin.from("pile_events").insert({
              project_id: projectId,
              pile_id: pileId,
              event_date: today,
              event_type: "poured",
              daily_report_id: report.id,
              volume_m3: vol,
            });
            await supabaseAdmin
              .from("pile_schedule")
              .update({ status: "poured" })
              .eq("id", pileId)
              .neq("status", "complete");
          }
        }
        // concrete_dockets row (photo comes in via Slack file upload separately,
        // matched on docket_number or pile_ref).
        const docketNo = pour.docket_number ? String(pour.docket_number).trim() : null;
        if (docketNo) {
          const { data: existing } = await supabaseAdmin
            .from("concrete_dockets")
            .select("id")
            .eq("project_id", projectId)
            .eq("docket_number", docketNo)
            .maybeSingle();
          if (!existing?.id) {
            await supabaseAdmin.from("concrete_dockets").insert({
              project_id: projectId,
              pile_id: pileId,
              event_date: today,
              volume_m3: vol,
              supplier: pour.supplier ?? null,
              docket_number: docketNo,
              daily_report_id: report.id,
            });
          }
        } else if (pileId) {
          // No docket number yet — still log the pour so it shows on the report.
          await supabaseAdmin.from("concrete_dockets").insert({
            project_id: projectId,
            pile_id: pileId,
            event_date: today,
            volume_m3: vol,
            supplier: pour.supplier ?? null,
            daily_report_id: report.id,
          });
        }
      } catch (e) {
        console.error("[slack-webhook] concrete_pours loop error:", (e as Error).message);
      }
    }
  }

  if (saveBlock && Array.isArray(saveBlock.cage_deliveries)) {
    for (const cage of saveBlock.cage_deliveries) {
      try {
        const count = Number(cage.count ?? 0);
        if (!count) continue;
        await supabaseAdmin.from("cage_deliveries").insert({
          project_id: projectId,
          delivery_date: today,
          count,
          notes: cage.notes ?? null,
          daily_report_id: report.id,
        });
      } catch (e) {
        console.error("[slack-webhook] cage_deliveries loop error:", (e as Error).message);
      }
    }
  }

  // Plant on-hire / off-hire events. "today" / null normalises to report date.
  const normaliseDate = (raw: any): string => {
    if (!raw || raw === "today") return today;
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return today;
  };

  if (saveBlock && Array.isArray(saveBlock.plant_onhires)) {
    for (const oh of saveBlock.plant_onhires) {
      try {
        const code = String(oh.plant_id ?? "").trim();
        if (!code) continue;
        const onDate = normaliseDate(oh.on_date);
        const { data: existing } = await supabaseAdmin
          .from("plant_hire_periods")
          .select("id")
          .eq("project_id", projectId)
          .eq("plant_id_code", code)
          .is("off_date", null)
          .maybeSingle();
        if (existing?.id) continue; // already open
        const { data: reg } = await supabaseAdmin
          .from("plant_items")
          .select("rate_basis, daily_rate, weekly_rate")
          .eq("project_id", projectId)
          .eq("plant_id_code", code)
          .maybeSingle();
        const basis = (reg?.rate_basis ?? "daily") as string;
        const rate = basis === "weekly" ? reg?.weekly_rate : basis === "daily" ? reg?.daily_rate : null;
        const { error: ohErr } = await supabaseAdmin.from("plant_hire_periods").insert({
          project_id: projectId,
          plant_id_code: code,
          on_date: onDate,
          rate_basis: basis,
          rate_snapshot: rate ?? null,
          source: "slack",
          notes: oh.notes ?? null,
        });
        if (ohErr) console.error("[slack-webhook] plant on-hire insert failed:", ohErr.message);
      } catch (e) {
        console.error("[slack-webhook] plant on-hire loop error:", (e as Error).message);
      }
    }
  }

  if (saveBlock && Array.isArray(saveBlock.plant_offhires)) {
    for (const off of saveBlock.plant_offhires) {
      try {
        const code = String(off.plant_id ?? "").trim();
        if (!code) continue;
        const offDate = normaliseDate(off.off_date);
        const { data: open } = await supabaseAdmin
          .from("plant_hire_periods")
          .select("id")
          .eq("project_id", projectId)
          .eq("plant_id_code", code)
          .is("off_date", null)
          .order("on_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!open?.id) continue; // nothing open to close
        const { error: offErr } = await supabaseAdmin
          .from("plant_hire_periods")
          .update({
            off_date: offDate,
            notes: off.notes ?? undefined,
            updated_at: new Date().toISOString(),
          })
          .eq("id", open.id);
        if (offErr) console.error("[slack-webhook] plant off-hire update failed:", offErr.message);
      } catch (e) {
        console.error("[slack-webhook] plant off-hire loop error:", (e as Error).message);
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
        marginAud: computed.margin_aud,
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

  // Always flag the work-date being logged when it isn't the current
  // calendar day (e.g. early-morning catch-up, weekend backfill), and on
  // the very first message of a new report so the supervisor can correct
  // it before more gets logged against the wrong day.
  let outboundReply = replyText;
  if (isNewReport || today !== calendarToday) {
    const banner = `📅 Logging this against *${melbLongDate(today)}*. Reply "actually <date>" if that's wrong.`;
    outboundReply = `${banner}\n\n${replyText}`;
  }

  // Post reply
  const post = await postToSlack(channel, outboundReply);
  console.log("[slack-webhook] slack post ok:", post?.ok ?? false, "work_date:", today);
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
