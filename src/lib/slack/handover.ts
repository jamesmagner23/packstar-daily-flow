// `handover <project> to <name>` — swap a project's active supervisor.
// Authorisation: DIRECTOR_SLACK_USER_ID (admin) OR the outgoing supervisor
// (the only active supervisor currently on the project).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmUser, getAdminSlackUserId } from "./post";

export const HANDOVER_PATTERN = /^handover\s+(.+?)\s+to\s+(.+)$/i;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function findProject(query: string) {
  const q = query.trim();
  const { data } = await supabaseAdmin
    .from("projects")
    .select("id, code, name, active")
    .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
    .eq("active", true);
  return (data ?? []) as { id: string; code: string; name: string }[];
}

async function findCrewSupervisorByName(name: string) {
  const { data } = await supabaseAdmin.rpc("find_crew_by_name", { p_name: name });
  return (data ?? []) as Array<{ id: string; name: string; role: string | null; similarity: number }>;
}

export async function handleHandover(text: string, slackUserId: string) {
  const m = text.match(HANDOVER_PATTERN);
  const projectQuery = (m?.[1] ?? "").trim();
  const nameQuery = (m?.[2] ?? "").trim();
  if (!projectQuery || !nameQuery) {
    await dmUser(slackUserId, "Try `handover <project> to <name>` — e.g. `handover thompsons rd to brian`.");
    return;
  }

  // Resolve project
  const projects = await findProject(projectQuery);
  if (projects.length === 0) {
    await dmUser(slackUserId, `No active project matching "${projectQuery}".`);
    return;
  }
  if (projects.length > 1) {
    const lines = projects.slice(0, 4).map((p, i) => `${i + 1}. ${p.code} — ${p.name}`);
    await dmUser(slackUserId, `Multiple projects match "${projectQuery}":\n${lines.join("\n")}\nTry the project code.`);
    return;
  }
  const project = projects[0];

  // Current active supervisors on this project (slack registry)
  const { data: actives } = await supabaseAdmin
    .from("supervisors")
    .select("id, name, slack_user_id")
    .eq("project_id", project.id)
    .eq("active", true);
  const current = (actives ?? []) as Array<{ id: string; name: string; slack_user_id: string }>;

  if (current.length === 0) {
    await dmUser(slackUserId, `${project.code} has no active supervisor on record. Use the web Setup → Supervisors tab to set one.`);
    return;
  }
  if (current.length > 1) {
    const names = current.map((s) => s.name).join(", ");
    await dmUser(slackUserId, `${project.code} has multiple active supervisors (${names}). Use the web Setup → Supervisors tab to reassign.`);
    return;
  }
  const outgoing = current[0];

  // Authorisation
  const adminId = getAdminSlackUserId();
  const isAdmin = adminId && slackUserId === adminId;
  const isOutgoing = slackUserId === outgoing.slack_user_id;
  if (!isAdmin && !isOutgoing) {
    await dmUser(slackUserId, `Only the director or the outgoing supervisor (${outgoing.name}) can hand over ${project.code}.`);
    return;
  }

  // Resolve incoming person (crew_members)
  const matches = await findCrewSupervisorByName(nameQuery);
  if (matches.length === 0) {
    await dmUser(slackUserId, `No crew member matching "${nameQuery}".`);
    return;
  }
  if (matches.length > 1 && matches[0].similarity - matches[1].similarity < 0.1) {
    const lines = matches.slice(0, 3).map((c, i) => `${i + 1}. ${c.name}${c.role ? ` (${c.role})` : ""}`);
    await dmUser(slackUserId, `Multiple matches for "${nameQuery}":\n${lines.join("\n")}\nTry the full name.`);
    return;
  }
  const incomingCrew = matches[0];

  // Outgoing crew_member id (for daily_allocations swap) — match by slack_user_id
  const { data: outgoingCrewRow } = await supabaseAdmin
    .from("crew_members")
    .select("id")
    .eq("slack_user_id", outgoing.slack_user_id)
    .maybeSingle();
  const outgoingCrewId = outgoingCrewRow?.id ?? null;

  // Look up incoming person's slack_user_id (need it for supervisors row)
  const { data: incomingCrewRow } = await supabaseAdmin
    .from("crew_members")
    .select("id, name, slack_user_id, email")
    .eq("id", incomingCrew.id)
    .maybeSingle();
  if (!incomingCrewRow?.slack_user_id) {
    await dmUser(slackUserId, `${incomingCrew.name} has no Slack ID on their crew record. Add it in the web Crew page first.`);
    return;
  }

  // 1) Deactivate outgoing supervisors row
  await supabaseAdmin.from("supervisors").update({ active: false }).eq("id", outgoing.id);

  // 2) Upsert incoming supervisors row for this project
  const { data: existingForIncoming } = await supabaseAdmin
    .from("supervisors")
    .select("id")
    .eq("project_id", project.id)
    .eq("slack_user_id", incomingCrewRow.slack_user_id)
    .maybeSingle();
  if (existingForIncoming) {
    await supabaseAdmin.from("supervisors").update({ active: true, name: incomingCrewRow.name }).eq("id", existingForIncoming.id);
  } else {
    await supabaseAdmin.from("supervisors").insert({
      project_id: project.id,
      name: incomingCrewRow.name,
      slack_user_id: incomingCrewRow.slack_user_id,
      email: incomingCrewRow.email,
      active: true,
    });
  }

  // 3) Reassign future allocations (today onwards) from outgoing crew_member → incoming crew_member
  let reassigned = 0;
  if (outgoingCrewId) {
    const { data: updated } = await supabaseAdmin
      .from("daily_allocations")
      .update({ supervisor_id: incomingCrew.id })
      .eq("job_id", project.id)
      .eq("supervisor_id", outgoingCrewId)
      .gte("allocation_date", todayIso())
      .select("id");
    reassigned = updated?.length ?? 0;
  }

  await dmUser(
    slackUserId,
    `Handed over ${project.code} from ${outgoing.name} to ${incomingCrew.name}. ${reassigned} future allocation${reassigned === 1 ? "" : "s"} reassigned.`,
  );

  // Notify the new supervisor too
  if (incomingCrewRow.slack_user_id !== slackUserId) {
    await dmUser(
      incomingCrewRow.slack_user_id,
      `You're now the supervisor on ${project.code} — ${project.name}. ${reassigned} future allocation${reassigned === 1 ? "" : "s"} moved to you.`,
    );
  }
}
