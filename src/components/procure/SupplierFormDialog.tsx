import { useEffect, useState } from "react";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type SupplierRow = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  abn: string | null;
  credit_terms_days: number | null;
  payment_terms: string | null;
  fleet_notes: string | null;
  active: boolean;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(200),
  contact_name: z.string().trim().max(200).optional().or(z.literal("")),
  contact_email: z.string().trim().max(255).email("Invalid email").optional().or(z.literal("")),
  contact_phone: z.string().trim().max(50).optional().or(z.literal("")),
  abn: z.string().trim().max(20).optional().or(z.literal("")),
  credit_terms_days: z.string().trim().regex(/^\d*$/, "Numbers only").max(4).optional().or(z.literal("")),
  payment_terms: z.string().trim().max(200).optional().or(z.literal("")),
  fleet_notes: z.string().trim().max(2000).optional().or(z.literal("")),
  active: z.boolean(),
});

type FormState = z.infer<typeof schema>;

const empty: FormState = {
  name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  abn: "",
  credit_terms_days: "",
  payment_terms: "",
  fleet_notes: "",
  active: true,
};

export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  supplier: SupplierRow | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (!open) return;
    if (supplier) {
      setForm({
        name: supplier.name,
        contact_name: supplier.contact_name ?? "",
        contact_email: supplier.contact_email ?? "",
        contact_phone: supplier.contact_phone ?? "",
        abn: supplier.abn ?? "",
        credit_terms_days: supplier.credit_terms_days?.toString() ?? "",
        payment_terms: supplier.payment_terms ?? "",
        fleet_notes: supplier.fleet_notes ?? "",
        active: supplier.active,
      });
    } else {
      setForm(empty);
    }
    setErrors({});
  }, [open, supplier]);

  const mutation = useMutation({
    mutationFn: async (values: FormState) => {
      const payload = {
        name: values.name.trim(),
        contact_name: values.contact_name || null,
        contact_email: values.contact_email || null,
        contact_phone: values.contact_phone || null,
        abn: values.abn || null,
        credit_terms_days: values.credit_terms_days ? Number(values.credit_terms_days) : null,
        payment_terms: values.payment_terms || null,
        fleet_notes: values.fleet_notes || null,
        active: values.active,
      };
      if (supplier) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", supplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["suppliers-count"] });
      toast.success(supplier ? "Supplier updated" : "Supplier added");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save supplier"),
  });

  function submit() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit supplier" : "Add supplier"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <Field label="Name *" error={errors.name} className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => field("name", e.target.value)} maxLength={200} />
          </Field>
          <Field label="Contact name" error={errors.contact_name}>
            <Input value={form.contact_name} onChange={(e) => field("contact_name", e.target.value)} maxLength={200} />
          </Field>
          <Field label="Contact email" error={errors.contact_email}>
            <Input type="email" value={form.contact_email} onChange={(e) => field("contact_email", e.target.value)} maxLength={255} />
          </Field>
          <Field label="Contact phone" error={errors.contact_phone}>
            <Input value={form.contact_phone} onChange={(e) => field("contact_phone", e.target.value)} maxLength={50} />
          </Field>
          <Field label="ABN" error={errors.abn}>
            <Input value={form.abn} onChange={(e) => field("abn", e.target.value)} maxLength={20} />
          </Field>
          <Field label="Credit terms (days)" error={errors.credit_terms_days}>
            <Input inputMode="numeric" value={form.credit_terms_days} onChange={(e) => field("credit_terms_days", e.target.value)} maxLength={4} />
          </Field>
          <Field label="Payment terms" error={errors.payment_terms}>
            <Input value={form.payment_terms} onChange={(e) => field("payment_terms", e.target.value)} maxLength={200} />
          </Field>
          <Field label="Fleet notes" error={errors.fleet_notes} className="sm:col-span-2">
            <Textarea value={form.fleet_notes} onChange={(e) => field("fleet_notes", e.target.value)} maxLength={2000} rows={3} />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={form.active} onCheckedChange={(v) => field("active", v)} />
            <Label className="cursor-pointer" onClick={() => field("active", !form.active)}>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : supplier ? "Save changes" : "Add supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs uppercase tracking-wider text-meta">{label}</Label>
      <div className="mt-1">{children}</div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
