import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PileRowSchema = z.object({
  pile_ref: z.string().min(1).max(64),
  sheet_ref: z.string().max(64).optional().nullable(),
  diameter_mm: z.number().int().positive().nullable().optional(),
  design_depth_m: z.number().positive().nullable().optional(),
  design_volume_m3: z.number().positive().nullable().optional(),
  notes: z.string().max(500).optional().nullable(),
});

const ParseInputSchema = z.object({
  project_id: z.string().uuid(),
  storage_path: z.string().min(1).max(500),
});

const SaveInputSchema = z.object({
  project_id: z.string().uuid(),
  rows: z.array(PileRowSchema).min(1).max(2000),
  pile_schedule_url: z.string().max(500).optional().nullable(),
});

// Parse an uploaded pile-schedule PDF using Lovable AI vision.
// Returns proposed rows that the user reviews before persisting.
export const parsePileSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ParseInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Sign a short URL the model can fetch
    const { data: signed, error: signErr } = await supabase.storage
      .from("pile-schedules")
      .createSignedUrl(data.storage_path, 60 * 10);
    if (signErr || !signed?.signedUrl) {
      throw new Error(`Could not access uploaded file: ${signErr?.message ?? "no url"}`);
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You extract pile schedules from engineering PDFs.
Return ONLY valid JSON matching this shape:
{ "piles": [ { "pile_ref": "P37-01", "sheet_ref": "Sheet 37", "diameter_mm": 600, "design_depth_m": 12.5, "design_volume_m3": 3.5, "notes": null } ] }
Rules:
- One row per pile.
- pile_ref must be unique within the document.
- Numeric fields: numbers only, no units.
- If a field is not present, use null.
- Do not invent piles. Do not include header/footer rows.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract every pile from this schedule. JSON only." },
              { type: "image_url", image_url: { url: signed.signedUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI gateway error ${res.status}: ${body.slice(0, 300)}`);
    }

    const payload = await res.json();
    const text: string = payload?.choices?.[0]?.message?.content ?? "";

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      // best-effort: strip code fences
      const cleaned = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }
    const raw = Array.isArray(parsed?.piles) ? parsed.piles : [];
    const rows = raw
      .map((r: any) => {
        const out: any = {
          pile_ref: String(r.pile_ref ?? "").trim(),
          sheet_ref: r.sheet_ref ?? null,
          diameter_mm: r.diameter_mm != null ? Number(r.diameter_mm) : null,
          design_depth_m: r.design_depth_m != null ? Number(r.design_depth_m) : null,
          design_volume_m3: r.design_volume_m3 != null ? Number(r.design_volume_m3) : null,
          notes: r.notes ?? null,
        };
        return out;
      })
      .filter((r: any) => r.pile_ref);

    return { rows, count: rows.length };
  });

// Persist reviewed rows (replace existing schedule for the project).
export const savePileSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Replace existing rows for this project
    const { error: delErr } = await supabase
      .from("pile_schedule")
      .delete()
      .eq("project_id", data.project_id);
    if (delErr) throw new Error(delErr.message);

    const payload = data.rows.map((r) => ({
      ...r,
      project_id: data.project_id,
      status: "pending",
    }));
    const { error: insErr } = await supabase.from("pile_schedule").insert(payload);
    if (insErr) throw new Error(insErr.message);

    if (data.pile_schedule_url) {
      await supabase
        .from("projects")
        .update({ pile_schedule_url: data.pile_schedule_url })
        .eq("id", data.project_id);
    }

    return { ok: true, inserted: payload.length };
  });
