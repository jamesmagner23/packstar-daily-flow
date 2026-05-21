import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Check, X, AlertCircle, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/use-role";
import { toast } from "sonner";

export const Route = createFileRoute("/plant/$id/prestart")({
  head: () => ({ meta: [{ title: "Pre-start — PACC HQ" }] }),
  component: PrestartFormPage,
});

type ChecklistItem = { id: string; label: string; type: "pass_fail" | "number" | "text" };

function PrestartFormPage() {
  const { id: assetId } = Route.useParams();
  const navigate = useNavigate();
  const { personId, isAdmin, loading: roleLoading, role } = useRole();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Redirect unauth users to login with return path
  useEffect(() => {
    if (userId === null && !roleLoading) {
      const here = `/plant/${assetId}/prestart`;
      navigate({ to: "/login", search: { redirect: here } as any });
    }
  }, [userId, roleLoading, assetId, navigate]);

  const today = new Date().toISOString().slice(0, 10);

  const { data: asset, isLoading: assetLoading } = useQuery({
    queryKey: ["prestart-asset", assetId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("plant_items")
        .select("id, plant_id_code, description, tonnage_class")
        .eq("id", assetId)
        .maybeSingle();
      return data;
    },
  });

  const { data: template } = useQuery({
    queryKey: ["prestart-template", assetId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("plant_prestart_templates")
        .select("checklist_items")
        .eq("asset_id", assetId)
        .maybeSingle();
      return (data?.checklist_items as ChecklistItem[]) ?? [];
    },
  });

  const { data: existingLog } = useQuery({
    queryKey: ["prestart-log-today", assetId, today],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("plant_prestart_logs")
        .select("id, operator_person_id, completed_at, crew_members:operator_person_id(name)")
        .eq("asset_id", assetId)
        .eq("prestart_date", today)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: meCrew } = useQuery({
    queryKey: ["me-crew", personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data } = await supabase.from("crew_members").select("id, name").eq("id", personId!).maybeSingle();
      return data;
    },
  });

  // Admin override: allow picking another operator
  const { data: allCrew } = useQuery({
    queryKey: ["all-crew-active"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("crew_members").select("id, name").eq("active", true).order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const [operatorOverride, setOperatorOverride] = useState<string>("");
  const effectiveOperatorId = (isAdmin && operatorOverride) || personId || null;
  const effectiveOperatorName =
    (isAdmin && operatorOverride && allCrew?.find((c) => c.id === operatorOverride)?.name) ||
    meCrew?.name ||
    "—";

  // Form state
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [issues, setIssues] = useState("");

  const hasRedFail = useMemo(
    () =>
      (template ?? []).some(
        (t) => t.type === "pass_fail" && responses[t.id] === false,
      ),
    [template, responses],
  );

  const allRequiredFilled = useMemo(() => {
    if (!template) return false;
    for (const t of template) {
      const v = responses[t.id];
      if (t.type === "pass_fail" && (v === undefined || v === null)) return false;
      if (t.type === "number" && (v === undefined || v === null || v === "")) return false;
      if (t.type === "text" && (!v || String(v).trim() === "")) return false;
    }
    if (hasRedFail && issues.trim() === "") return false;
    return true;
  }, [template, responses, hasRedFail, issues]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!effectiveOperatorId) throw new Error("No operator selected.");
      let photoUrl: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${effectiveOperatorId}/${today}-${assetId}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("plant-prestart-evidence")
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type || "image/jpeg" });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage
          .from("plant-prestart-evidence")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        photoUrl = signed?.signedUrl ?? null;
      }
      const { error } = await supabase.from("plant_prestart_logs").insert({
        asset_id: assetId,
        operator_person_id: effectiveOperatorId,
        prestart_date: today,
        checklist_responses: responses,
        issues_raised: issues.trim() || null,
        photo_url: photoUrl,
        completed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pre-start logged");
      navigate({ to: "/today" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Submit failed"),
  });

  if (roleLoading || !userId || assetLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-meta text-sm">Loading…</div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-screen p-6 max-w-md mx-auto">
        <h1 className="text-xl font-semibold">Asset not found</h1>
        <Link to="/today" className="text-[color:var(--brand)] text-sm hover:underline">Back to today</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-32">
      <header className="sticky top-0 z-10 bg-white border-b border-rule px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/today" })}
          className="h-9 w-9 inline-flex items-center justify-center rounded-md text-meta hover:bg-neutral-100"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-semibold truncate">Pre-start</h1>
          <p className="text-xs text-meta truncate">
            {asset.plant_id_code}
            {asset.description ? ` — ${asset.description}` : ""}
          </p>
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="bg-white border border-rule rounded-lg p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-meta">Date</span>
            <span className="font-medium">{today}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-meta">Operator</span>
            <span className="font-medium">{effectiveOperatorName}</span>
          </div>
          {isAdmin && allCrew && (
            <div className="mt-3">
              <label className="text-xs text-meta">Override operator</label>
              <select
                value={operatorOverride}
                onChange={(e) => setOperatorOverride(e.target.value)}
                className="w-full h-10 px-2 mt-1 border border-rule rounded-md text-sm bg-white"
              >
                <option value="">— me ({meCrew?.name ?? "?"})</option>
                {allCrew.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          {existingLog && (
            <div className="mt-3 p-2 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900">
              Already logged today by {existingLog.crew_members?.name ?? "—"}. Submitting again will add a second entry.
            </div>
          )}
        </div>

        {!template || template.length === 0 ? (
          <div className="bg-white border border-rule rounded-lg p-4 text-sm text-meta">
            No checklist template configured for this asset. Ask admin to set one on the asset card.
          </div>
        ) : (
          <div className="space-y-3">
            {template.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                value={responses[item.id]}
                onChange={(v) => setResponses({ ...responses, [item.id]: v })}
              />
            ))}
          </div>
        )}

        {/* Photo */}
        <div className="bg-white border border-rule rounded-lg p-4">
          <label className="text-sm font-medium flex items-center gap-2 mb-2">
            <Camera className="h-4 w-4" /> Photo (optional)
          </label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          {photoFile && <p className="text-xs text-meta mt-1">{photoFile.name}</p>}
        </div>

        {/* Issues */}
        <div className="bg-white border border-rule rounded-lg p-4">
          <label className="text-sm font-medium flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4" />
            Issues to raise
            {hasRedFail && <span className="text-xs text-red-600 ml-auto">Required (red flag above)</span>}
          </label>
          <textarea
            value={issues}
            onChange={(e) => setIssues(e.target.value)}
            rows={3}
            placeholder="Anything to flag for the supervisor?"
            className="w-full border border-rule rounded-md p-2 text-sm"
          />
        </div>
      </div>

      {/* Sticky submit */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-rule p-4 max-w-md mx-auto">
        <button
          disabled={!allRequiredFilled || submit.isPending || !template || template.length === 0}
          onClick={() => submit.mutate()}
          className="w-full h-14 rounded-md bg-[color:var(--brand)] text-white text-base font-semibold disabled:opacity-50"
        >
          {submit.isPending ? "Submitting…" : "Submit pre-start"}
        </button>
      </div>
    </div>
  );
}

function ChecklistRow({
  item,
  value,
  onChange,
}: {
  item: ChecklistItem;
  value: any;
  onChange: (v: any) => void;
}) {
  return (
    <div className="bg-white border border-rule rounded-lg p-4">
      <p className="text-sm font-medium mb-3">{item.label}</p>
      {item.type === "pass_fail" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`h-14 rounded-md border-2 flex items-center justify-center gap-2 text-sm font-semibold ${
              value === true
                ? "bg-emerald-500 border-emerald-600 text-white"
                : "bg-white border-rule text-meta hover:border-emerald-400"
            }`}
          >
            <Check className="h-5 w-5" /> Pass
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`h-14 rounded-md border-2 flex items-center justify-center gap-2 text-sm font-semibold ${
              value === false
                ? "bg-red-500 border-red-600 text-white"
                : "bg-white border-rule text-meta hover:border-red-400"
            }`}
          >
            <X className="h-5 w-5" /> Fail
          </button>
        </div>
      )}
      {item.type === "number" && (
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full h-12 border border-rule rounded-md px-3 text-base"
        />
      )}
      {item.type === "text" && (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full border border-rule rounded-md p-2 text-sm"
        />
      )}
    </div>
  );
}
