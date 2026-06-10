// Verify the caller is an authenticated admin via Supabase bearer token.
// Returns null when the request is from a valid admin, otherwise a reason string.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function isAuthenticatedAdmin(request: Request): Promise<boolean> {
  try {
    const auth = request.headers.get("authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) return false;
    const token = auth.slice(7).trim();
    if (!token) return false;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return false;

    const supabase = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });

    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return false;

    const { data, error } = await supabase.rpc("is_admin");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
