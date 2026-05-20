import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type SiteRow = {
  id: string;
  name: string;
  head_contractor: string | null;
  head_contractor_contact: string | null;
  induction_lead_time_days: number | null;
  induction_platform: string | null;
  induction_url: string | null;
  job_id: string | null;
  active: boolean | null;
};

export const INDUCTION_PLATFORM_SUGGESTIONS = [
  "3D Safety",
  "HammerTech",
  "Checkrite",
  "Simpel",
  "In-Person",
  "Other",
];

export function SiteFormDialog({
  open, onOpenChange, site,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  site: SiteRow | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [hc, setHc] = useState("");
  const [hcContact, setHcContact] = useState("");
  const [lead, setLead] = useState<number>(3);
  const [projectId, setProjectId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [platform, setPlatform] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(site?.name ?? "");
    setHc(site?.head_contractor ?? "");
    setHcContact(site?.head_contractor_contact ?? "");
    setLead(site?.induction_lead_time_days ?? 3);
    setProjectId(site?.job_id ?? "");
    setActive(site?.active !== false);
    setPlatform(site?.induction_platform ?? "");
    setUrl(site?.induction_url ?? "");
  }, [open, site]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-active"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, name, code").eq("active", true).order("code");
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!name) throw new Error("Name is required");
      const payload: any = {
        name,
        head_contractor: hc || null,
        head_contractor_contact: hcContact || null,
        induction_lead_time_days: lead,
        induction_platform: platform.trim() || null,
        induction_url: url.trim() || null,
        job_id: projectId || null,
        active,
      };
      if (site) {
        const { error } = await supabase.from("sites").update(payload).eq("id", site.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sites").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites-list"] });
      qc.invalidateQueries({ queryKey: ["site-detail"] });
      toast.success(site ? "Site updated" : "Site added");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{site ? "Edit site" : "Add site"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <Field label="Name *" className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Head contractor">
            <Input value={hc} onChange={(e) => setHc(e.target.value)} />
          </Field>
          <Field label="Head contractor contact">
            <Input value={hcContact} onChange={(e) => setHcContact(e.target.value)} />
          </Field>
          <Field label="Lead time (days)">
            <Input type="number" min={0} value={lead} onChange={(e) => setLead(parseInt(e.target.value || "0", 10))} />
          </Field>
          <Field label="Linked project">
            <select
              className="w-full border border-rule rounded-md px-3 py-2 text-sm bg-white"
              value={projectId} onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">— None —</option>
              {(projects as any[]).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </Field>
          <Field label="Active">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
            </label>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : site ? "Save changes" : "Add site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs uppercase tracking-wider text-meta">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
