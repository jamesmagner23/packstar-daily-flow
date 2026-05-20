# Procure → Gmail integration

Everything flows through **one connected Gmail account** (your PACC Gmail / Workspace). POs go out from that mailbox; supplier replies come back to the same mailbox; a background poller files them under the matching supplier.

---

## 1. Connect Gmail (one-time)

Use the Lovable Gmail connector. You'll click "Connect Gmail" once and authorise the PACC inbox. Required scopes: `gmail.send`, `gmail.readonly`, `gmail.modify` (so we can mark parsed emails as read / label them `PACC/Processed`).

---

## 2. Outbound — Send PO / Request Quote

On `/procure/suppliers` and on each supplier row:

- **Request Quote** button → opens a dialog: pick equipment items + qty + project + notes → sends a plain-text email from your Gmail to `contact_email`, subject `RFQ — <project code> — <date>`.
- **Send PO** button → same shape, attaches a generated PO PDF (reuses the existing `report-pdf.server.ts` engine), subject `PO #<number> — <project code>`.
- Every send is logged to a new `procure_email_log` table (direction=`out`, supplier_id, subject, gmail_message_id, sent_at).

---

## 3. Inbound — Poll, match, parse

A cron-triggered server route (`/api/public/procure/poll-gmail`, runs every 5 min via pg_cron) does:

1. `gmail.users.messages.list?q=is:unread -label:PACC/Processed newer_than:7d`
2. For each message:
   - Look up sender email in `suppliers.contact_email` (case-insensitive). No match → skip & label `PACC/Unmatched`.
   - Match → download message + PDF attachments.
   - Upload PDFs to a new `procure-quotes` storage bucket under `<supplier_id>/<message_id>/<filename>.pdf`.
   - Insert a `procure_quotes` row (supplier_id, subject, received_at, gmail_message_id, body_text, attachment_paths[], status=`new`, extraction_status=`pending`).
   - Call Lovable AI (`google/gemini-2.5-flash`) with the email body + extracted PDF text → returns structured JSON: `{ items: [{ description, qty, unit, unit_price, total }], subtotal, gst, total, valid_until, notes }`. Stored on `procure_quotes.extracted_json`.
   - Mark Gmail message read + add label `PACC/Processed`.

---

## 4. Dashboard surface

- **Procure landing page** (`/procure`): adds a third card "Quotes" with unread count badge; red dot on the sidebar Procure item when `procure_quotes.status='new'` exists.
- **New page `/procure/quotes`**: table of received quotes (Supplier, Subject, Received, Items, Total, Status). Row click → detail drawer with email body, attachment download links, AI-extracted line items in an editable table, "Mark reviewed" / "Convert to PO" buttons.

---

## Database changes

- `procure_email_log` — outbound + inbound audit trail
- `procure_quotes` — one row per parsed supplier email
- Storage bucket `procure-quotes` (private, RLS by anon for now to match existing pattern)
- pg_cron job hitting the poll endpoint every 5 min

---

## Technical details

- Gmail connector calls go through `https://connector-gateway.lovable.dev/google_mail/gmail/v1/...` from server functions (server-only — `GOOGLE_MAIL_API_KEY` + `LOVABLE_API_KEY` env vars).
- PDF text extraction in the Worker runtime: use `pdf-parse` if Worker-compatible, otherwise fall back to passing the raw PDF bytes to Gemini (it handles PDFs natively) — I'll verify in the build.
- Poll endpoint is idempotent: dedupe on `gmail_message_id` unique index.
- AI extraction failures don't block the row — quote still appears, just flagged `extraction_status='failed'` with manual entry option.
- No new auth required — Procure already runs as anon.

---

## Build order

1. Connect Gmail connector (you click through one OAuth screen)
2. DB migration: tables + bucket + indexes
3. Server functions: `sendSupplierEmail`, `pollSupplierInbox`
4. Outbound UI: Request Quote / Send PO dialogs on suppliers page
5. Inbound UI: `/procure/quotes` page + detail drawer + sidebar badge
6. pg_cron schedule for the poller