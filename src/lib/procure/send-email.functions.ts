import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sendEmail } from "./gmail.server";
import { getSupabaseAdmin } from "./supabase-admin.server";

const inputSchema = z.object({
  supplierId: z.string().uuid(),
  to: z.string().email().max(255),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  kind: z.enum(["rfq", "po", "other"]),
  projectId: z.string().uuid().optional().nullable(),
});

export const sendSupplierEmail = createServerFn({ method: "POST" })
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = getSupabaseAdmin();
    try {
      const result = await sendEmail({
        to: data.to,
        subject: data.subject,
        body: data.body,
      });
      const { error } = await supabase.from("procure_email_log").insert({
        supplier_id: data.supplierId,
        direction: "out",
        kind: data.kind,
        subject: data.subject,
        recipient_email: data.to,
        gmail_message_id: result.id,
        gmail_thread_id: result.threadId,
        status: "sent",
        project_id: data.projectId ?? null,
      });
      if (error) console.error("[procure] log insert failed", error.message);
      return { ok: true as const, gmailMessageId: result.id };
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      await supabase.from("procure_email_log").insert({
        supplier_id: data.supplierId,
        direction: "out",
        kind: data.kind,
        subject: data.subject,
        recipient_email: data.to,
        status: "failed",
        error_message: msg.slice(0, 500),
        project_id: data.projectId ?? null,
      });
      return { ok: false as const, error: msg };
    }
  });
