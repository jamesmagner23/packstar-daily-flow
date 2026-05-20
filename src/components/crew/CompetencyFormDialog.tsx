import { useEffect, useState } from "react";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type CompetencyRow = {
  id: string;
  code: string;
  name: string;
  type: string;
};

const TYPES = ["ticket", "licence", "training", "medical"] as const;

const schema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9_]+$/, "UPPER_SNAKE_CASE only").min(1).max(50),
  name: z.string().trim().min(1).max(200),
  type: z.enum(TYPES),
});

type FormState = z.infer<typeof schema>;

const empty: FormState = { code: "", name: "", type: "ticket" };

export function CompetencyFormDialog({
  open,
  onOpenChange,
  competency,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  competency: CompetencyRow | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (!open) return;
    if (competency) {
      setForm({ code: competency.code, name: competency.name, type: competency.type as any });
    } else {
      setForm(empty);
    }
    setErrors({});
  }, [open, competency]);

  const mutation = useMutation({
    mutationFn: async (values: FormState) => {
      if (competency) {
        const { error } = await supabase.from("competencies").update(values).eq("id", competency.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("competencies").insert(values);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competencies-list"] });
      qc.invalidateQueries({ queryKey: ["tickets-library"] });
      toast.success(competency ? "Competency updated" : "Competency added");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save competency"),
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
    setErrors({});
    mutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{competency ? "Edit competency" : "Add competency type"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Code *" error={errors.code}>
            <Input value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              maxLength={50} placeholder="E.G. WHITE_CARD" />
          </Field>
          <Field label="Name *" error={errors.name}>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={200} />
          </Field>
          <Field label="Type *" error={errors.type}>
            <select className="w-full border border-rule rounded-md px-3 py-2 text-sm bg-white"
              value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as any }))}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : competency ? "Save changes" : "Add competency"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-meta">{label}</Label>
      <div className="mt-1">{children}</div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
