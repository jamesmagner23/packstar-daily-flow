// Server-only Gmail gateway client. Never import in browser code.
const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!gmailKey) throw new Error("GOOGLE_MAIL_API_KEY is not configured (connect Gmail)");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": gmailKey,
  } as Record<string, string>;
}

async function gmail<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

// --- Base64url helpers ----------------------------------------------------
function b64urlEncode(input: string | Uint8Array): string {
  let bin = "";
  if (typeof input === "string") {
    bin = unescape(encodeURIComponent(input));
  } else {
    for (let i = 0; i < input.length; i++) bin += String.fromCharCode(input[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecodeToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- Sending --------------------------------------------------------------
export type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
  attachments?: { filename: string; mimeType: string; bytes: Uint8Array }[];
};

export async function sendEmail(input: SendEmailInput): Promise<{ id: string; threadId: string }> {
  const boundary = `pacc_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = input.attachments && input.attachments.length > 0;

  let raw: string;
  if (!hasAttachments) {
    raw = [
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "MIME-Version: 1.0",
      "",
      input.body,
    ].join("\r\n");
  } else {
    const parts: string[] = [
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      input.body,
    ];
    for (const att of input.attachments!) {
      parts.push(
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${att.filename}"`,
        "",
        b64urlEncode(att.bytes).replace(/-/g, "+").replace(/_/g, "/"),
      );
    }
    parts.push(`--${boundary}--`, "");
    raw = parts.join("\r\n");
  }

  const result = await gmail<{ id: string; threadId: string }>(
    "/users/me/messages/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64urlEncode(raw) }),
    },
  );
  return result;
}

// --- Reading --------------------------------------------------------------
export type GmailMessageMeta = { id: string; threadId: string };

export async function listInboxSince(opts: { newerDays?: number; max?: number } = {}) {
  const q = `in:inbox -from:me newer_than:${opts.newerDays ?? 7}d`;
  const res = await gmail<{ messages?: GmailMessageMeta[] }>(
    `/users/me/messages?maxResults=${opts.max ?? 25}&q=${encodeURIComponent(q)}`,
  );
  return res.messages ?? [];
}

type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
};

export type GmailFullMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPart;
};

export async function getMessage(id: string): Promise<GmailFullMessage> {
  return gmail<GmailFullMessage>(`/users/me/messages/${id}?format=full`);
}

export async function getAttachment(messageId: string, attachmentId: string): Promise<Uint8Array> {
  const res = await gmail<{ data: string; size: number }>(
    `/users/me/messages/${messageId}/attachments/${attachmentId}`,
  );
  return b64urlDecodeToBytes(res.data);
}

export function extractHeader(msg: GmailFullMessage, name: string): string | undefined {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value;
}

export function parseSenderEmail(fromHeader: string | undefined): string | null {
  if (!fromHeader) return null;
  const m = fromHeader.match(/<([^>]+)>/);
  const email = (m ? m[1] : fromHeader).trim().toLowerCase();
  return /\S+@\S+\.\S+/.test(email) ? email : null;
}

export function walkParts(payload: GmailPart | undefined, cb: (p: GmailPart) => void) {
  if (!payload) return;
  cb(payload);
  for (const child of payload.parts ?? []) walkParts(child, cb);
}

export function extractPlainBody(msg: GmailFullMessage): string {
  let plain = "";
  let html = "";
  walkParts(msg.payload, (p) => {
    if (!p.body?.data) return;
    if (p.mimeType === "text/plain" && !plain) plain = new TextDecoder().decode(b64urlDecodeToBytes(p.body.data));
    if (p.mimeType === "text/html" && !html) html = new TextDecoder().decode(b64urlDecodeToBytes(p.body.data));
  });
  if (plain) return plain;
  // crude HTML strip fallback
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function extractPdfAttachments(msg: GmailFullMessage) {
  const out: { filename: string; mimeType: string; attachmentId: string }[] = [];
  walkParts(msg.payload, (p) => {
    if (!p.filename) return;
    const isPdf = (p.mimeType ?? "").toLowerCase() === "application/pdf" || p.filename.toLowerCase().endsWith(".pdf");
    if (isPdf && p.body?.attachmentId) {
      out.push({ filename: p.filename, mimeType: p.mimeType ?? "application/pdf", attachmentId: p.body.attachmentId });
    }
  });
  return out;
}

// --- Labels & modify ------------------------------------------------------
async function listLabels(): Promise<{ id: string; name: string }[]> {
  const res = await gmail<{ labels: { id: string; name: string }[] }>("/users/me/labels");
  return res.labels ?? [];
}

async function createLabel(name: string): Promise<{ id: string }> {
  return gmail<{ id: string }>("/users/me/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
}

let _labelCache: Record<string, string> | null = null;
export async function ensureLabel(name: string): Promise<string> {
  if (!_labelCache) {
    _labelCache = {};
    const labels = await listLabels();
    for (const l of labels) _labelCache[l.name] = l.id;
  }
  if (_labelCache[name]) return _labelCache[name];
  const created = await createLabel(name);
  _labelCache[name] = created.id;
  return created.id;
}

export async function modifyMessage(id: string, opts: { addLabelIds?: string[]; removeLabelIds?: string[] }) {
  await gmail(`/users/me/messages/${id}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
}
