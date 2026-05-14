import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Victoria public holidays (gazetted) — 2026 + 2027.
// Update yearly. Source: business.vic.gov.au public holidays.
const VIC_PUBLIC_HOLIDAYS = new Set<string>([
  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-26", // Australia Day
  "2026-03-09", // Labour Day
  "2026-04-03", // Good Friday
  "2026-04-04", // Saturday before Easter Sunday
  "2026-04-05", // Easter Sunday
  "2026-04-06", // Easter Monday
  "2026-04-25", // ANZAC Day
  "2026-06-08", // King's Birthday
  "2026-09-25", // AFL Grand Final Friday (TBC each year)
  "2026-11-03", // Melbourne Cup
  "2026-12-25", // Christmas Day
  "2026-12-26", // Boxing Day
  "2026-12-28", // Christmas Day observed (Boxing Day Sun substitute)
  // 2027
  "2027-01-01",
  "2027-01-26",
  "2027-03-08",
  "2027-03-26", // Good Friday
  "2027-03-27",
  "2027-03-28",
  "2027-03-29",
  "2027-04-25",
  "2027-04-26", // ANZAC Day observed
  "2027-06-14",
  "2027-11-02",
  "2027-12-25",
  "2027-12-27",
  "2027-12-28",
]);

const OPENERS = [
  "G'day {first_name}, how'd today go?",
  "Hey mate, ready for the wrap? What got done?",
  "Afternoon {first_name}. Tell me how the day went.",
];

function melbourneToday(): { iso: string; weekday: number } {
  // Get Melbourne local date parts via Intl.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  const weekdayShort = parts.find((p) => p.type === "weekday")!.value;
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { iso: `${y}-${m}-${d}`, weekday: map[weekdayShort] };
}

async function postSlackDM(userId: string, text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN missing");
  // Open a DM channel with the user, then post.
  const open = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ users: userId }),
  }).then((r) => r.json());
  if (!open.ok) throw new Error(`conversations.open failed: ${open.error}`);
  const channel = open.channel.id;
  const post = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text }),
  }).then((r) => r.json());
  if (!post.ok) throw new Error(`chat.postMessage failed: ${post.error}`);
  return { channel, ts: post.ts as string };
}

async function runDailyPrompt(opts: { force?: boolean } = {}) {
  const { iso, weekday } = melbourneToday();
  const isWeekend = weekday === 0 || weekday === 6;
  const isHoliday = VIC_PUBLIC_HOLIDAYS.has(iso);

  if (!opts.force && (isWeekend || isHoliday)) {
    return { skipped: true, reason: isWeekend ? "weekend" : "public_holiday", date: iso };
  }

  const { data: supervisors, error } = await supabaseAdmin
    .from("supervisors")
    .select("id, name, slack_user_id, project_id, projects:project_id(active)")
    .eq("active", true);

  if (error) throw error;

  const eligible = (supervisors ?? []).filter(
    (s: any) => s.slack_user_id && s.project_id && s.projects?.active,
  );

  const results: any[] = [];
  for (const sup of eligible) {
    // Skip if today's report already complete.
    const { data: report } = await supabaseAdmin
      .from("daily_reports")
      .select("id, complete")
      .eq("supervisor_id", sup.id)
      .eq("report_date", iso)
      .maybeSingle();

    if (report?.complete) {
      results.push({ supervisor: sup.name, skipped: "report_complete" });
      continue;
    }

    // Skip if already prompted today (idempotent).
    const { data: prior } = await supabaseAdmin
      .from("daily_prompts_sent")
      .select("id")
      .eq("supervisor_id", sup.id)
      .eq("sent_for_date", iso)
      .maybeSingle();

    if (prior && !opts.force) {
      results.push({ supervisor: sup.name, skipped: "already_prompted" });
      continue;
    }

    const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)];
    const firstName = (sup.name ?? "").split(" ")[0] || "mate";
    const text = opener.replace("{first_name}", firstName);

    try {
      const { channel, ts } = await postSlackDM(sup.slack_user_id, text);
      if (prior) {
        await supabaseAdmin
          .from("daily_prompts_sent")
          .update({ sent_at: new Date().toISOString(), opener_used: text, slack_channel: channel, slack_ts: ts })
          .eq("id", prior.id);
      } else {
        await supabaseAdmin.from("daily_prompts_sent").insert({
          supervisor_id: sup.id,
          sent_for_date: iso,
          opener_used: text,
          slack_channel: channel,
          slack_ts: ts,
        });
      }
      results.push({ supervisor: sup.name, sent: true, opener: text });
    } catch (e: any) {
      results.push({ supervisor: sup.name, error: e.message });
    }
  }

  return { date: iso, weekday, sent_count: results.filter((r) => r.sent).length, results };
}

export const Route = createFileRoute("/api/public/hooks/daily-prompt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const force = url.searchParams.get("force") === "1";
        try {
          const result = await runDailyPrompt({ force });
          return Response.json(result);
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
