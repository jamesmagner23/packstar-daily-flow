// Shared guard for public hook endpoints under /api/public/hooks/* and similar.
// Requires the caller to present CRON_SECRET via header (x-cron-secret) or
// Authorization: Bearer <secret>. Returns a Response when unauthorized, or
// null when the request is allowed.

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function requireCronSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("CRON_SECRET not configured", { status: 503 });
  }
  const header = request.headers.get("x-cron-secret") ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const presented = header || bearer;
  if (!presented || !timingSafeEqualStr(presented, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
