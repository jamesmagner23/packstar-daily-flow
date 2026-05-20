import { useEffect, useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type CrewRow = {
  id: string;
  name: string;
  role: string | null;
  employment_type: string | null;
  phone: string | null;
  email: string | null;
  slack_user_id: string | null;
  project_id: string | null;
  default_supervisor_id: string | null;
  active: boolean | null;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(200),
  role: z.string().trim().max(100).optional().or(z.literal("")),
  employment_type: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  email: z.string().trim().max(255).email("Invalid email").optional().or(z.literal("")),
  slack_user_id: z.string().trim().max(50).regex(/^[A-Z0-9]*$/i, "Letters/digits only").optional().or(z.literal("")),
  project_id: z.string().uuid("Project required"),
  default_supervisor_id: z.string().uuid().nullable(),
  active: z.boolean(),
});

type FormState = z.infer<typeof schema> & { project_id: string };

const empty = (projectId: string | null): FormState => ({
  name: "",
  role: "",
  employment_type: "",
  phone: "",
  email: "",
  slack_user_id: "",
  project_id: projectId ?? "",
  default_supervisor_id: null,
  active: true,
});

export function CrewFormDialog({
  open,
  onOpenChange,
  crew,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  crew: CrewRow | null;
  defaultProjectId: string | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(empty(defaultProjectId));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    if (!open) return;
    if (crew) {
      setForm({
        name: crew.name,
        role: crew.role ?? "",
        employment_type: crew.employment_type ?? "",
        phone: crew.phone ?? "",
        email: crew.email ?? "",
        slack_user_id: crew.slack_user_id ?? "",
        project_id: crew.project_id ?? defaultProjectId ?? "",
        default_supervisor_id: crew.default_supervisor_id ?? null,
        active: crew.active ?? true,
      });
    } else {
      setForm(empty(defaultProjectId));
    }
    setErrors({});
  }, [open, crew, defaultProjectId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects").select("id, code, name")
        .eq("active", true).order("code");
      return data ?? [];
    },
  });

  const { data: supervisors = [] } = useQuery({
    queryKey: ["supervisors-for-project", form.project_id],
    enabled: !!form.project_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("supervisors").select("id, name")
        .eq("project_id", form.project_id).eq("active", true).order("name");
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormState) => {
      const payload = {
        name: values.name.trim(),
        role: (values.role || "").trim(),
        employment_type: values.employment_type || null,
        phone: values.phone || null,
        email: values.email || null,
        project_id: values.project_id,
        default_supervisor_id: values.default_supervisor_id || null,
        active: values.active,
      };
      if (crew) {
        const { error } = await supabase.from("crew_members").update(payload).eq("id", crew.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("crew_members").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crew-list"] });
      qc.invalidateQueries({ queryKey: ["crew-detail"] });
      toast.success(crew ? "Crew member updated" : "Crew member added");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
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
    mutation.mutate(parsed.data as FormState);
  }

  function field<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{crew ? "Edit crew member" : "Add crew member"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <Field label="Name *" error={errors.name} className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => field("name", e.target.value)} maxLength={200} />
          </Field>
          <Field label="Role" error={errors.role}>
            <Input value={form.role} onChange={(e) => field("role", e.target.value)} maxLength={100} />
          </Field>
          <Field label="Employment type" error={errors.employment_type}>
            <Input value={form.employment_type} onChange={(e) => field("employment_type", e.target.value)} maxLength={100}
              placeholder="e.g. full_time, casual, subcontractor" />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <Input value={form.phone} onChange={(e) => field("phone", e.target.value)} maxLength={50} />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => field("email", e.target.value)} maxLength={255} />
          </Field>
          <Field label="Project *" error={errors.project_id}>
            <select className="w-full border border-rule rounded-md px-3 py-2 text-sm bg-white"
              value={form.project_id}
              onChange={(e) => { field("project_id", e.target.value); field("default_supervisor_id", null); }}>
              <option value="">Select a project</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Default supervisor" error={errors.default_supervisor_id}>
            <select className="w-full border border-rule rounded-md px-3 py-2 text-sm bg-white"
              value={form.default_supervisor_id ?? ""}
              onChange={(e) => field("default_supervisor_id", e.target.value || null)}
              disabled={!form.project_id}>
              <option value="">Unassigned</option>
              {supervisors.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={form.active} onCheckedChange={(v) => field("active", v)} />
            <Label className="cursor-pointer" onClick={() => field("active", !form.active)}>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : crew ? "Save changes" : "Add crew member"}
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
