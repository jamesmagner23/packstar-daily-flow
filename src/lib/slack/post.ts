// Shared Slack helpers for the Phase 2 dispatchers.
// Server-only. Imported from the slack-webhook route + handler modules.

export async function postToSlack(channel: string, text: string) {
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
    if (!data.ok) console.error("[slack] chat.postMessage failed:", data.error);
    return data;
  } catch (e) {
    console.error("[slack] chat.postMessage threw:", (e as Error).message);
    return null;
  }
}

// chat.postMessage accepts a user ID as `channel` and Slack auto-opens the IM.
export async function dmUser(slackUserId: string, text: string) {
  return postToSlack(slackUserId, text);
}

// Phase 2 admin DM target — DIRECTOR_SLACK_USER_ID.
// Multi-admin fan-out is parked for v0.2 (see supervisors/crew_members reconciliation).
export function getAdminSlackUserId(): string | null {
  return process.env.DIRECTOR_SLACK_USER_ID ?? null;
}

export async function dmAdmin(text: string) {
  const id = getAdminSlackUserId();
  if (!id) {
    console.error("[slack] DIRECTOR_SLACK_USER_ID not set — admin DM dropped");
    return null;
  }
  return dmUser(id, text);
}

export function siteOrigin(): string {
  return process.env.SITE_ORIGIN ?? "https://packstar-daily-flow.lovable.app";
}
