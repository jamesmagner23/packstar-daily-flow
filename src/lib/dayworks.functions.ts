import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Create a new daywork header for a project. Reference is auto-generated
 * server-side using `public.next_daywork_reference(project_id)`.
 */
export const createDaywork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      project_id: string;
      work_date: string;
      description?: string | null;
      client_contact_name?: string | null;
      client_contact_email?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: refData, error: refErr } = await supabase.rpc(
      "next_daywork_reference",
      { p_project_id: data.project_id },
    );
    if (refErr) throw new Error(refErr.message);

    const { data: inserted, error } = await supabase
      .from("dayworks")
      .insert({
        project_id: data.project_id,
        work_date: data.work_date,
        reference: refData as unknown as string,
        description: data.description ?? null,
        client_contact_name: data.client_contact_name ?? null,
        client_contact_email: data.client_contact_email ?? null,
        created_by: userId,
        status: "draft",
      })
      .select("id, reference")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

/**
 * Mark a daywork as awaiting signature (after generating the docket PDF
 * client-side or uploading the offline-signed scan).
 */
export const setDaywokStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      status: "draft" | "awaiting_signature" | "signed" | "void";
      signing_method?: "in_app" | "offline" | null;
      signed_docket_pdf_url?: string | null;
      signed_by_name?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("dayworks")
      .update({
        status: data.status,
        ...(data.signing_method !== undefined ? { signing_method: data.signing_method } : {}),
        ...(data.signed_docket_pdf_url !== undefined
          ? { signed_docket_pdf_url: data.signed_docket_pdf_url }
          : {}),
        ...(data.signed_by_name !== undefined ? { signed_by_name: data.signed_by_name } : {}),
        ...(data.status === "signed" ? { signed_at: new Date().toISOString() } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
