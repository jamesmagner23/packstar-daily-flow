// Phase 2 — `expiring [days]` DM command handler.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmUser, siteOrigin } from "./post";

export const EXPIRING_PATTERN = /^expiring\b(?:\s+(\d+))?$/i;

const REPLY_CAP = 3000;

async function callerIsAdminOrSupervisor(slackUserId: string): Promise<boolean> {
  if (process.env.DIRECTOR_SLACK_USER_ID && slackUserId === process.env.DIRECTOR_SLACK_USER_ID) {
    return true;
  }
  const { data: sup } = await supabaseAdmin
    .from("supervisors")
    .select("id")
    .eq("slack_user_id", slackUserId)
    .eq("active", true)
    .maybeSingle();
  return !!sup;
}

function formatShortDate(iso: string): string {
  // e.g. "3 Jun"
  const d = new Date(`${iso}T12:00:00+10:00`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Melbourne",
    day: "numeric",
    month: "short",
  }).format(d);
}

type Row = {
  name: string;
  competency: string;
  expiry_date: string;
  days_remaining: number;
};

export async function handleExpiring(text: string, slackUserId: string) {
  const allowed = await callerIsAdminOrSupervisor(slackUserId);
  if (!allowed) {
    await dmUser(slackUserId, "Only admin and supervisors can run that.");
    return;
  }

  const m = text.match(EXPIRING_PATTERN);
  let days = 30;
  if (m?.[1]) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) days = Math.max(1, Math.min(90, n));
  }

  const today = new Date().toISOString().slice(0, 10);
  const horizon = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  })();

  const { data, error } = await supabaseAdmin
    .from("person_competencies")
    .select("expiry_date, crew_members!inner(name, active), competencies!inner(name)")
    .not("expiry_date", "is", null)
    .gte("expiry_date", today)
    .lte("expiry_date", horizon)
    .order("expiry_date", { ascending: true });
  if (error) {
    console.error("[slack-expiring] query failed:", error.message);
    await dmUser(slackUserId, "Bot's having a moment. Try again in a minute.");
    return;
  }

  const rows: Row[] = (data ?? [])
    .filter((r: any) => r.crew_members?.active)
    .map((r: any) => {
      const exp = r.expiry_date as string;
      return {
        name: r.crew_members.name as string,
        competency: r.competencies.name as string,
        expiry_date: exp,
        days_remaining: Math.round(
          (new Date(`${exp}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      };
    });

  if (rows.length === 0) {
    await dmUser(slackUserId, `Nothing expiring in the next ${days} days. Nice.`);
    return;
  }

  // Group by person, preserving earliest-expiry order across the list.
  const byPerson = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byPerson.has(r.name)) byPerson.set(r.name, []);
    byPerson.get(r.name)!.push(r);
  }

  const blocks: string[] = [];
  blocks.push(`Expiring in the next ${days} days:`);
  for (const [name, list] of byPerson) {
    blocks.push("");
    blocks.push(name);
    for (const r of list) {
      blocks.push(`- ${r.competency}, ${r.days_remaining} day${r.days_remaining === 1 ? "" : "s"} (${formatShortDate(r.expiry_date)})`);
    }
  }
  blocks.push("");
  blocks.push(`Open /crew to action: ${siteOrigin()}/crew?filter=expiring`);

  let reply = blocks.join("\n");
  if (reply.length > REPLY_CAP) {
    // Truncate at person boundary and append summary.
    const truncated: string[] = [];
    let used = 0;
    const footer = `\n\n...and more. See ${siteOrigin()}/crew for the full list.`;
    const budget = REPLY_CAP - footer.length;
    for (const line of blocks) {
      if (used + line.length + 1 > budget) break;
      truncated.push(line);
      used += line.length + 1;
    }
    reply = truncated.join("\n") + footer;
  }

  await dmUser(slackUserId, reply);
}
