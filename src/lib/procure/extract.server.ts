// Calls Lovable AI Gateway to extract structured quote data.
export type ExtractedQuote = {
  items: { description: string; qty?: number | null; unit?: string | null; unit_price?: number | null; total?: number | null }[];
  subtotal?: number | null;
  gst?: number | null;
  total?: number | null;
  currency?: string | null;
  valid_until?: string | null;
  notes?: string | null;
};

const SCHEMA_INSTRUCTIONS = `Return ONLY valid JSON matching this schema, no prose:
{
  "items": [{"description": string, "qty": number|null, "unit": string|null, "unit_price": number|null, "total": number|null}],
  "subtotal": number|null,
  "gst": number|null,
  "total": number|null,
  "currency": string|null,
  "valid_until": "YYYY-MM-DD"|null,
  "notes": string|null
}`;

export async function extractQuoteFromText(emailBody: string, supplierName: string): Promise<ExtractedQuote> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");

  const prompt = `You are parsing a construction equipment supplier quote email from "${supplierName}".
Extract line items, totals, and validity. Prices are in AUD unless stated otherwise.
If a value is missing, use null. Do not invent numbers.

${SCHEMA_INSTRUCTIONS}

EMAIL CONTENT:
---
${emailBody.slice(0, 12000)}
---`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = await res.json() as { choices: { message: { content: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content) as ExtractedQuote;
  } catch {
    // Try to recover a JSON object from a fenced block
    const m = content.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as ExtractedQuote;
    throw new Error("AI returned non-JSON");
  }
}
