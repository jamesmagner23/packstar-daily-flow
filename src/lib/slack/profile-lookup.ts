// Phase 2 — `profile [name]` / `tickets [name]` DM command handler.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmUser, siteOrigin } from "./post";

export const PROFILE_PATTERN = /^(?:profile|tickets?)\s+(.+)$/i;

type CrewMatch = {
  id: string;
  name: string;
  role: string | null;
  employment_type: string | null;
  default_supervisor_id: string | null;
  similarity: number;
};

// Resolve the DM sender to a user_roles row to check authorisation +
// for crew users, get their own person_id to scope the lookup.
async function resolveCaller(slackUserId: string): Promise<{ role: string | null; personId: string | null } | null> {
  const { data: sup } = await supabaseAdmin
    .from("supervisors")
    .select("id")
    .eq("slack_user_id", slackUserId)
    .maybeSingle();
  if (!sup) return null;
  // user_roles is keyed off user_id (auth.users), not supervisor id. The Slack
  // user typically isn't a Supabase auth user, so we treat any known supervisor
  // as "supervisor" for the purposes of this read-only lookup.
  return { role: "supervisor", personId: sup.id };
}

function buildOneLine(
  c: CrewMatch,
  activeCount: number,
  expiringCount: number,
  topExpiring: { name: string; days: number } | null,
  supervisorName: string | null,
): string {
  const roleLabel = c.role ?? c.employment_type ?? "(no role)";
  let line = `${c.name}. ${roleLabel}. ${activeCount} active ticket${activeCount === 1 ? "" : "s"}`;
  if (expiringCount > 0 && topExpiring) {
    line += `, ${expiringCount} expiring (${topExpiring.name}, ${topExpiring.days} day${topExpiring.days === 1 ? "" : "s"})`;
  }
  line += `. ${supervisorName ?? "No supervisor assigned"}. `;
  line += `${siteOrigin()}/crew/${c.id}`;
  return line;
}

async function summarizeOne(c: CrewMatch): Promise<string> {
  // Active tickets: no expiry OR expiry in the future.
  const today = new Date().toISOString().slice(0, 10);
  const { data: pcs } = await supabaseAdmin
    .from("person_competencies")
    .select("competency_id, expiry_date")
    .eq("person_id", c.id);
  const rows = (pcs ?? []) as Array<{ competency_id: string; expiry_date: string | null }>;

  const active = rows.filter((r) => !r.expiry_date || r.expiry_date >= today);
  const expiringWindow = 30;
  const expiringSoonRaw = active.filter(
    (r) => r.expiry_date && r.expiry_date <= addDays(today, expiringWindow),
  );

  // Resolve competency names for the rows we'll display.
  let nameById = new Map<string, string>();
  if (expiringSoonRaw.length > 0) {
    const ids = Array.from(new Set(expiringSoonRaw.map((r) => r.competency_id)));
    const { data: comps } = await supabaseAdmin
      .from("competencies")
      .select("id, name")
      .in("id", ids);
    nameById = new Map((comps ?? []).map((x: any) => [x.id, x.name]));
  }

  const expiringSoon = expiringSoonRaw
    .map((r) => ({
      name: nameById.get(r.competency_id) ?? "Ticket",
      days: daysBetween(today, r.expiry_date!),
    }))
    .sort((a, b) => a.days - b.days);

  let supName: string | null = null;
  if (c.default_supervisor_id) {
    const { data: sup } = await supabaseAdmin
      .from("supervisors")
      .select("name")
      .eq("id", c.default_supervisor_id)
      .maybeSingle();
    supName = sup?.name ?? null;
  }

  return buildOneLine(c, active.length, expiringSoon.length, expiringSoon[0] ?? null, supName);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export async function handleProfileLookup(text: string, slackUserId: string) {
  const m = text.match(PROFILE_PATTERN);
  const query = (m?.[1] ?? "").trim();
  if (!query) {
    await dmUser(slackUserId, "Try `profile <name>` — e.g. `profile tyler`.");
    return;
  }

  const caller = await resolveCaller(slackUserId);
  // For now: any DM sender who isn't a known supervisor is rejected. Crew
  // identity resolution into user_roles requires the supervisors/crew_members
  // reconciliation parked for v0.2.
  if (!caller) {
    await dmUser(slackUserId, "I don't recognise you. Ask admin to set you up.");
    return;
  }

  const { data: matches, error } = await supabaseAdmin.rpc("find_crew_by_name", { p_name: query });
  if (error) {
    console.error("[slack-profile] rpc failed:", error.message);
    await dmUser(slackUserId, "Bot's having a moment. Try again in a minute.");
    return;
  }
  const list = (matches ?? []) as CrewMatch[];
  if (list.length === 0) {
    await dmUser(slackUserId, `No one matching "${query}" in the crew register.`);
    return;
  }

  // Ambiguous: top two within 0.1 of each other → list top 3.
  if (list.length > 1 && list[0].similarity - list[1].similarity < 0.1) {
    const top = list.slice(0, 3);
    const lines = top.map((c, i) => `${i + 1}. ${c.name}${c.role ? ` (${c.role})` : ""}`);
    await dmUser(
      slackUserId,
      `Multiple matches for "${query}":\n${lines.join("\n")}\nWhich one — try the full name.`,
    );
    return;
  }

  const summary = await summarizeOne(list[0]);
  await dmUser(slackUserId, summary);
}
