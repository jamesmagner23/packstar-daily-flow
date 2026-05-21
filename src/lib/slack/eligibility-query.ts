// Phase 3 — "can <name> do <site>?" eligibility query DM.
//
// Pattern: /^can\s+.*\s+do\s+.*$/i
// Examples:
//   "can Blake do MVRC tomorrow"
//   "can Daniel do MVRC on Friday"
//   "can Blake do MVRC" (defaults to today)
//
// Resolves crew via find_crew_by_name, resolves site via ilike on sites.name,
// runs check_eligibility, replies with a one-line verdict + reasons.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmUser, siteOrigin } from "./post";

export const ELIGIBILITY_PATTERN = /^can\s+([\w' .-]+?)\s+do\s+([\w' .-]+?)(?:\s+(today|tomorrow|on\s+\w+|next\s+\w+))?\s*\??$/i;

const MELB_TZ = "Australia/Melbourne";

function melbDateISO(d = new Date()): string {
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

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00+10:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return melbDateISO(d);
}

const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function resolveDate(raw: string | undefined): string {
  const today = melbDateISO();
  if (!raw) return today;
  const t = raw.toLowerCase().trim();
  if (t === "today") return today;
  if (t === "tomorrow") return shiftIso(today, 1);
  // "on friday" / "next friday"
  const m = t.match(/^(?:on|next)\s+(\w+)$/);
  if (m) {
    const target = DAY_INDEX[m[1]];
    if (target != null) {
      const todayDow = new Date(`${today}T12:00:00+10:00`).getUTCDay();
      let delta = (target - todayDow + 7) % 7;
      if (delta === 0) delta = 7;
      return shiftIso(today, delta);
    }
  }
  return today;
}

type EligibilityResult = {
  eligible: boolean;
  missing_competencies: Array<{ code: string; name: string; reason: string }>;
  induction_status: string;
  earliest_eligible_date: string;
};

async function callerAllowed(slackUserId: string): Promise<boolean> {
  if (process.env.DIRECTOR_SLACK_USER_ID && slackUserId === process.env.DIRECTOR_SLACK_USER_ID) return true;
  const { data: sup } = await supabaseAdmin
    .from("supervisors")
    .select("id")
    .eq("slack_user_id", slackUserId)
    .eq("active", true)
    .maybeSingle();
  return !!sup;
}

export async function handleEligibilityQuery(text: string, slackUserId: string) {
  if (!(await callerAllowed(slackUserId))) {
    await dmUser(slackUserId, "Only admin and supervisors can run that.");
    return;
  }

  const m = text.match(ELIGIBILITY_PATTERN);
  if (!m) {
    await dmUser(slackUserId, "Use: `can <name> do <site> [today|tomorrow|on friday]`");
    return;
  }
  const personName = m[1].trim();
  const siteName = m[2].trim();
  const onDate = resolveDate(m[3]);

  // Resolve crew via fuzzy helper.
  const { data: matches } = await supabaseAdmin.rpc("find_crew_by_name", { p_name: personName });
  const candidates = (matches ?? []) as Array<{ id: string; name: string; similarity: number }>;
  if (candidates.length === 0) {
    await dmUser(slackUserId, `Couldn't find anyone matching "${personName}".`);
    return;
  }
  if (candidates.length > 1 && candidates[0].similarity < 0.7) {
    const top = candidates.slice(0, 3).map((c) => c.name).join(", ");
    await dmUser(slackUserId, `Ambiguous — did you mean: ${top}?`);
    return;
  }
  const person = candidates[0];

  // Resolve site: match on sites.name OR sites.head_contractor (fuzzy).
  const { data: siteCandidates } = await supabaseAdmin
    .from("sites")
    .select("id, name, head_contractor")
    .or(`name.ilike.%${siteName}%,head_contractor.ilike.%${siteName}%`)
    .eq("active", true)
    .limit(5);
  const site = (siteCandidates ?? [])[0] ?? null;
  if (!site) {
    await dmUser(slackUserId, `Don't recognise site or head contractor "${siteName}".`);
    return;
  }
  if ((siteCandidates ?? []).length > 1) {
    const names = (siteCandidates ?? []).map((s: any) => s.name).join(", ");
    await dmUser(slackUserId, `"${siteName}" matched multiple sites (${names}). Using ${site.name}.`);
  }

  const { data: raw, error } = await supabaseAdmin.rpc("check_eligibility", {
    p_person_id: person.id,
    p_site_id: site.id,
    p_task_type: "general",
    p_on_date: onDate,
  });
  if (error) {
    console.error("[slack-eligibility] rpc failed:", error.message);
    await dmUser(slackUserId, "Bot's having a moment. Try again in a minute.");
    return;
  }
  const result = raw as unknown as EligibilityResult;

  if (result.eligible) {
    await dmUser(slackUserId, `Yes — ${person.name} is clear for ${site.name} on ${onDate}.`);
    return;
  }

  const bits: string[] = [];
  if (result.induction_status !== "completed") {
    bits.push(
      result.induction_status === "booked"
        ? `induction booked but not completed (earliest ${result.earliest_eligible_date})`
        : `no site induction (earliest ${result.earliest_eligible_date})`,
    );
  }
  for (const c of result.missing_competencies ?? []) bits.push(`missing ${c.name}`);

  await dmUser(
    slackUserId,
    `No — ${person.name} can't do ${site.name} on ${onDate}. ${bits.join("; ")}. ` +
      `Profile: ${siteOrigin()}/crew/${person.id}`,
  );
}
