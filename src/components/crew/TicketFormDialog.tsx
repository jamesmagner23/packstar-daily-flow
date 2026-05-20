import { useEffect, useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export type TicketRow = {
  id: string;
  person_id: string;
  competency_id: string;
  issued_date: string | null;
  expiry_date: string | null;
  evidence_url: string | null;
};

const schema = z.object({
  competency_id: z.string().uuid("Competency required"),
  issued_date: z.string().min(1, "Issued date required"),
  no_expiry: z.boolean(),
  expiry_date: z.string().optional().or(z.literal("")),
});

type FormState = z.infer<typeof schema>;

const empty: FormState = {
  competency_id: "",
  issued_date: new Date().toISOString().slice(0, 10),
  no_expiry: false,
  expiry_date: "",
};

export function TicketFormDialog({
  open,
  onOpenChange,
  personId,
  ticket,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  personId: string;
  ticket: TicketRow | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (!open) return;
    if (ticket) {
      setForm({
        competency_id: ticket.competency_id,
        issued_date: ticket.issued_date ?? new Date().toISOString().slice(0, 10),
        no_expiry: !ticket.expiry_date,
        expiry_date: ticket.expiry_date ?? "",
      });
    } else {
      setForm(empty);
    }
    setFile(null);
    setErrors({});
  }, [open, ticket]);

  const { data: competencies = [] } = useQuery({
    queryKey: ["competencies-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("competencies").select("id, code, name, type").order("code");
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormState) => {
      let evidence_url: string | null = ticket?.evidence_url ?? null;

      if (file) {
        const comp = competencies.find((c: any) => c.id === values.competency_id);
        const ext = file.name.split(".").pop() || "bin";
        const code = comp?.code ?? "TICKET";
        const path = `${personId}/${code}-${values.issued_date}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("ticket-evidence")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;
        evidence_url = path;
      }

      const payload = {
        person_id: personId,
        competency_id: values.competency_id,
        issued_date: values.issued_date,
        expiry_date: values.no_expiry ? null : (values.expiry_date || null),
        evidence_url,
      };

      const { error } = await supabase
        .from("person_competencies")
        .upsert(payload, { onConflict: "person_id,competency_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crew-tickets"] });
      qc.invalidateQueries({ queryKey: ["crew-list"] });
      qc.invalidateQueries({ queryKey: ["tickets-library"] });
      toast.success(ticket ? "Ticket updated" : "Ticket added");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save ticket"),
  });

  function submit() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<keyof FormState, string>> = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as keyof FormState;
        if (!errs[k]) errs[k] = i.message;
      }
      setErrors(errs);
      return;
    }
    if (!form.no_expiry && !form.expiry_date) {
      setErrors({ expiry_date: "Set an expiry date or tick No expiry" });
      return;
    }
    setErrors({});
    mutation.mutate(parsed.data);
  }

  function field<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ticket ? "Renew / edit ticket" : "Add ticket"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <Field label="Competency *" error={errors.competency_id} className="sm:col-span-2">
            <select className="w-full border border-rule rounded-md px-3 py-2 text-sm bg-white"
              value={form.competency_id}
              onChange={(e) => field("competency_id", e.target.value)}
              disabled={!!ticket}>
              <option value="">Select competency</option>
              {competencies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Issued date *" error={errors.issued_date}>
            <Input type="date" value={form.issued_date} onChange={(e) => field("issued_date", e.target.value)} />
          </Field>
          <Field label="Expiry date" error={errors.expiry_date}>
            <Input type="date" value={form.expiry_date}
              onChange={(e) => field("expiry_date", e.target.value)}
              disabled={form.no_expiry} />
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox id="no_expiry" checked={form.no_expiry}
              onCheckedChange={(v) => { field("no_expiry", !!v); if (v) field("expiry_date", ""); }} />
            <Label htmlFor="no_expiry" className="cursor-pointer">No expiry</Label>
          </div>
          <Field label="Evidence (image or PDF)" className="sm:col-span-2">
            <Input type="file" accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {ticket?.evidence_url && !file && (
              <p className="text-xs text-meta mt-1">Existing file on record. Upload a new file to replace.</p>
            )}
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : ticket ? "Save changes" : "Add ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs uppercase tracking-wider text-meta">{label}</Label>
      <div className="mt-1">{children}</div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
