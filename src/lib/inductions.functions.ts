import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dmUser, dmAdmin } from "@/lib/slack/post";

const Input = z.object({
  person_id: z.string().uuid(),
  site_id: z.string().uuid(),
  booked_for_date: z.string().min(1),
});

/**
 * Sends booking-confirmation DMs when an induction transitions to "booked".
 * - Crew member gets the platform URL if set, otherwise an "admin will send details" note.
 * - Admin (DIRECTOR_SLACK_USER_ID) is always copied for visibility.
 */
export const notifyInductionBooked = createServerFn({ method: "POST" })
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data }) => {
    const [{ data: person }, { data: site }] = await Promise.all([
      supabaseAdmin
        .from("crew_members")
        .select("id, name, slack_user_id")
        .eq("id", data.person_id)
        .maybeSingle(),
      supabaseAdmin
        .from("sites")
        .select("id, name, induction_platform, induction_url")
        .eq("id", data.site_id)
        .maybeSingle(),
    ]);

    if (!site) {
      console.error("[induction-booked] site not found", data.site_id);
      return { ok: false, reason: "site_not_found" };
    }

    const siteLabel = site.induction_platform
      ? `${site.name} (${site.induction_platform})`
      : site.name;

    let crewMsg: string;
    if (site.induction_url) {
      crewMsg =
        `Booked for ${siteLabel} induction on ${data.booked_for_date}. ` +
        `Complete it here: ${site.induction_url}. ` +
        `Send me a photo of your certificate when done and I'll log it.`;
    } else {
      crewMsg =
        `Booked for ${siteLabel} induction on ${data.booked_for_date}. ` +
        `Admin will send you the booking details separately.`;
    }

    if (person?.slack_user_id) {
      await dmUser(person.slack_user_id, crewMsg);
    } else {
      console.warn(
        "[induction-booked] crew has no slack_user_id, skipping crew DM",
        data.person_id,
      );
    }

    const personName = person?.name ?? "(unknown crew)";
    const adminMsg =
      `Induction booked: ${personName} → ${siteLabel} on ${data.booked_for_date}.` +
      (site.induction_url ? ` Link: ${site.induction_url}` : " (no platform URL on file)") +
      (person?.slack_user_id ? "" : " ⚠ crew slack_user_id missing — crew DM skipped");
    await dmAdmin(adminMsg);

    return { ok: true };
  });
