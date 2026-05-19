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
import { toast } from "@/components/ui/sonner";

export type EquipmentRow = {
  id: string;
  category: string;
  item_name: string;
  typical_specs: string | null;
  rate_basis: string;
  notes: string | null;
  active: boolean;
};

const schema = z.object({
  category: z.string().trim().min(1, "Category required").max(100),
  item_name: z.string().trim().min(1, "Item name required").max(200),
  typical_specs: z.string().trim().max(2000).optional().or(z.literal("")),
  rate_basis: z.string().trim().min(1, "Rate basis required").max(50),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  active: z.boolean(),
});

type FormState = z.infer<typeof schema>;

const empty: FormState = {
  category: "",
  item_name: "",
  typical_specs: "",
  rate_basis: "weekly",
  notes: "",
  active: true,
};

export function EquipmentFormDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: EquipmentRow | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        category: item.category,
        item_name: item.item_name,
        typical_specs: item.typical_specs ?? "",
        rate_basis: item.rate_basis,
        notes: item.notes ?? "",
        active: item.active,
      });
    } else setForm(empty);
    setErrors({});
  }, [open, item]);

  const mutation = useMutation({
    mutationFn: async (values: FormState) => {
      const payload = {
        category: values.category.trim().toLowerCase(),
        item_name: values.item_name.trim(),
        typical_specs: values.typical_specs || null,
        rate_basis: values.rate_basis.trim().toLowerCase(),
        notes: values.notes || null,
        active: values.active,
      };
      if (item) {
        const { error } = await supabase.from("equipment_catalogue").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("equipment_catalogue").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-catalogue"] });
      qc.invalidateQueries({ queryKey: ["equipment-catalogue-count"] });
      toast.success(item ? "Equipment updated" : "Equipment added");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save equipment"),
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
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit equipment" : "Add equipment"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <Field label="Category *" error={errors.category}>
            <Input value={form.category} onChange={(e) => field("category", e.target.value)} maxLength={100} placeholder="excavator, attachment…" />
          </Field>
          <Field label="Rate basis *" error={errors.rate_basis}>
            <select
              value={form.rate_basis}
              onChange={(e) => field("rate_basis", e.target.value)}
              className="w-full border border-rule px-3 py-2 text-sm bg-white h-10 rounded-md"
            >
              <option value="hourly">hourly</option>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
            </select>
          </Field>
          <Field label="Item name *" error={errors.item_name} className="sm:col-span-2">
            <Input value={form.item_name} onChange={(e) => field("item_name", e.target.value)} maxLength={200} />
          </Field>
          <Field label="Typical specs" error={errors.typical_specs} className="sm:col-span-2">
            <Textarea value={form.typical_specs} onChange={(e) => field("typical_specs", e.target.value)} maxLength={2000} rows={2} />
          </Field>
          <Field label="Notes" error={errors.notes} className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => field("notes", e.target.value)} maxLength={2000} rows={2} />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={form.active} onCheckedChange={(v) => field("active", v)} />
            <Label className="cursor-pointer" onClick={() => field("active", !form.active)}>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : item ? "Save changes" : "Add equipment"}
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
