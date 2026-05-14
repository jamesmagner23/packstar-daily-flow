import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/public/slack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        // Try to parse JSON first (Events API uses JSON)
        let payload: any = null;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          // Could be form-encoded (slash commands / interactivity)
        }

        // Slack URL verification handshake — must echo `challenge` ASAP,
        // BEFORE signature checks (Slack's verifier sometimes runs before
        // signing secret is configured on first paste).
        if (payload?.type === "url_verification" && typeof payload.challenge === "string") {
          return new Response(payload.challenge, {
            status: 200,
            headers: { "content-type": "text/plain" },
          });
        }

        // Verify Slack signature for everything else
        const signingSecret = process.env.SLACK_SIGNING_SECRET;
        if (signingSecret) {
          const ts = request.headers.get("x-slack-request-timestamp") ?? "";
          const sig = request.headers.get("x-slack-signature") ?? "";
          const fiveMinutes = 60 * 5;
          if (Math.abs(Date.now() / 1000 - Number(ts)) > fiveMinutes) {
            return new Response("Stale request", { status: 401 });
          }
          const base = `v0:${ts}:${rawBody}`;
          const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;
          const a = Buffer.from(expected);
          const b = Buffer.from(sig);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return new Response("Bad signature", { status: 401 });
          }
        }

        // TODO: route events / slash commands / interactivity to handlers
        // (daily report capture, variation flagging, etc.)
        console.log("[slack-webhook] event", payload?.event?.type ?? payload?.command ?? "unknown");

        return new Response("ok", { status: 200 });
      },
    },
  },
});
