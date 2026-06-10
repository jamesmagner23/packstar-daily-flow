import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth";
import { isAuthenticatedAdmin } from "@/lib/admin-auth";
import {
  listInboxSince,
  getMessage,
  getAttachment,
  extractHeader,
  parseSenderEmail,
  extractPlainBody,
  extractPdfAttachments,
  ensureLabel,
  modifyMessage,
} from "@/lib/procure/gmail.server";
import { getSupabaseAdmin } from "@/lib/procure/supabase-admin.server";
import { extractQuoteFromText } from "@/lib/procure/extract.server";

type PollSummary = {
  scanned: number;
  matched: number;
  saved: number;
  skipped: number;
  errors: { id: string; error: string }[];
};

async function runPoll(): Promise<Response> {
  const summary: PollSummary = { scanned: 0, matched: 0, saved: 0, skipped: 0, errors: [] };
  try {
    const supabase = getSupabaseAdmin();

    const { data: suppliers, error: sErr } = await supabase
      .from("suppliers")
      .select("id, name, contact_email")
      .not("contact_email", "is", null);
    if (sErr) throw sErr;
    const supplierByEmail = new Map<string, { id: string; name: string }>();
    for (const s of suppliers ?? []) {
      if (s.contact_email) supplierByEmail.set(s.contact_email.toLowerCase(), { id: s.id, name: s.name });
    }

    const processedLabelId = await ensureLabel("PACC/Processed");
    const unmatchedLabelId = await ensureLabel("PACC/Unmatched");

    const messages = await listInboxSince({ newerDays: 7, max: 25 });
    summary.scanned = messages.length;

    for (const meta of messages) {
      try {
        const { data: existing } = await supabase
          .from("procure_quotes")
          .select("id")
          .eq("gmail_message_id", meta.id)
          .maybeSingle();
        if (existing) { summary.skipped++; continue; }

        const full = await getMessage(meta.id);
        const sender = parseSenderEmail(extractHeader(full, "From"));
        const subject = extractHeader(full, "Subject") ?? "(no subject)";

        if (!sender) { summary.skipped++; continue; }
        const supplier = supplierByEmail.get(sender);
        if (!supplier) {
          await modifyMessage(meta.id, { addLabelIds: [unmatchedLabelId] }).catch(() => {});
          summary.skipped++;
          continue;
        }
        summary.matched++;

        const bodyText = extractPlainBody(full);
        const pdfAtts = extractPdfAttachments(full);

        const paths: string[] = [];
        const filenames: string[] = [];
        let attachmentText = "";
        for (const a of pdfAtts) {
          try {
            const bytes = await getAttachment(meta.id, a.attachmentId);
            const path = `${supplier.id}/${meta.id}/${a.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
            const { error: upErr } = await supabase.storage
              .from("procure-quotes")
              .upload(path, bytes, { contentType: a.mimeType, upsert: true });
            if (upErr) throw upErr;
            paths.push(path);
            filenames.push(a.filename);
            attachmentText += `\n[Attachment: ${a.filename}]`;
          } catch (e: any) {
            console.error("[procure] upload failed", a.filename, e?.message);
          }
        }

        const { data: inserted, error: insErr } = await supabase
          .from("procure_quotes")
          .insert({
            supplier_id: supplier.id,
            gmail_message_id: meta.id,
            gmail_thread_id: meta.threadId,
            subject,
            sender_email: sender,
            received_at: new Date().toISOString(),
            body_text: bodyText.slice(0, 60000),
            body_snippet: (full.snippet ?? bodyText).slice(0, 300),
            attachment_paths: paths,
            attachment_filenames: filenames,
            extraction_status: "pending",
            status: "new",
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        summary.saved++;

        try {
          const extracted = await extractQuoteFromText(
            `${bodyText}${attachmentText}`,
            supplier.name,
          );
          await supabase
            .from("procure_quotes")
            .update({
              extracted_json: extracted as any,
              extracted_total: extracted.total ?? null,
              extraction_status: "done",
            })
            .eq("id", inserted!.id);
        } catch (e: any) {
          await supabase
            .from("procure_quotes")
            .update({
              extraction_status: "failed",
              extraction_error: (e?.message ?? String(e)).slice(0, 500),
            })
            .eq("id", inserted!.id);
        }

        await supabase.from("procure_email_log").insert({
          supplier_id: supplier.id,
          direction: "in",
          kind: "quote",
          subject,
          sender_email: sender,
          gmail_message_id: meta.id,
          gmail_thread_id: meta.threadId,
          status: "received",
        });
        await modifyMessage(meta.id, {
          addLabelIds: [processedLabelId],
          removeLabelIds: ["UNREAD"],
        }).catch(() => {});
      } catch (e: any) {
        summary.errors.push({ id: meta.id, error: (e?.message ?? String(e)).slice(0, 200) });
      }
    }

    return Response.json({ ok: true, ...summary });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message ?? String(e), ...summary }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const Route = createFileRoute("/api/public/procure/poll-gmail")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        return runPoll();
      },
      GET: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        return runPoll();
      },
    },
  },
});
