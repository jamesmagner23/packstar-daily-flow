import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { Site3DViewer, type SiteAsset } from "@/components/Site3DViewer";

export const Route = createFileRoute("/site-3d")({
  component: Site3DPage,
  errorComponent: ({ error }) => <div className="p-6 text-red-600">{(error as Error).message}</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

const PROJECT_KEY = "pacchq.project.id";

function useProjectId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    try { setId(localStorage.getItem(PROJECT_KEY)); } catch {}
  }, []);
  return id;
}

function Site3DPage() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["site_assets", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_assets")
        .select("*")
        .eq("project_id", projectId!)
        .order("code");
      if (error) throw error;
      return (data ?? []) as SiteAsset[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SiteAsset["status"] }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "installed") patch.installed_at = new Date().toISOString();
      const { error } = await supabase.from("site_assets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["site_assets", projectId] }),
  });

  const selected = useMemo(() => assets.find((a) => a.id === selectedId) ?? null, [assets, selectedId]);

  const stats = useMemo(() => {
    const total = assets.length;
    const installed = assets.filter((a) => a.status === "installed").length;
    const inProgress = assets.filter((a) => a.status === "in_progress").length;
    const pct = total > 0 ? Math.round((installed / total) * 100) : 0;
    return { total, installed, inProgress, pct };
  }, [assets]);

  return (
    <SiteShell section="project">
      <div className="px-3 md:px-6 py-4 space-y-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Site 3D model</h1>
            <p className="text-sm text-meta">Click any pit to inspect or update install status. Updated from daily reports + manual tick-off.</p>
          </div>
          <div className="flex gap-2 text-sm">
            <div className="px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200">
              <span className="font-semibold text-emerald-700">{stats.installed}</span>{" "}
              <span className="text-meta">installed</span>
            </div>
            <div className="px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200">
              <span className="font-semibold text-amber-700">{stats.inProgress}</span>{" "}
              <span className="text-meta">in progress</span>
            </div>
            <div className="px-3 py-1.5 rounded-md bg-neutral-100 border border-rule">
              <span className="font-semibold">{stats.pct}%</span>{" "}
              <span className="text-meta">complete</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <div className="rounded-lg border border-rule overflow-hidden bg-white" style={{ height: "calc(100vh - 240px)", minHeight: 480 }}>
            {!projectId ? (
              <div className="h-full flex items-center justify-center text-meta">Select a project from the top bar.</div>
            ) : isLoading ? (
              <div className="h-full flex items-center justify-center text-meta">Loading scene…</div>
            ) : assets.length === 0 ? (
              <div className="h-full flex items-center justify-center text-meta">No site assets yet for this project.</div>
            ) : (
              <Site3DViewer assets={assets} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </div>

          <aside className="rounded-lg border border-rule bg-white p-4 space-y-3 text-sm">
            <h2 className="font-semibold">Asset details</h2>
            {!selected ? (
              <p className="text-meta">Click an asset in the scene to inspect or change its status.</p>
            ) : (
              <div className="space-y-2">
                <div className="font-mono text-base">{selected.code}</div>
                <div className="text-meta capitalize">{selected.asset_type}</div>
                {selected.depth_m && <div>Depth: <b>{Number(selected.depth_m).toFixed(2)} m</b></div>}
                {selected.diameter_mm && <div>Diameter: <b>{selected.diameter_mm} mm</b></div>}
                {selected.from_code && <div>{selected.from_code} → {selected.to_code}</div>}
                <div className="pt-2 border-t border-rule space-y-1">
                  <div className="text-meta text-xs">Status</div>
                  {(["not_started","in_progress","installed"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus.mutate({ id: selected.id, status: s })}
                      className={`block w-full text-left px-2 py-1.5 rounded border ${selected.status === s ? "border-ink bg-neutral-50 font-semibold" : "border-rule hover:bg-neutral-50"}`}
                    >
                      {s.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="pt-3 border-t border-rule text-xs text-meta space-y-1">
              <div><span className="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-1.5 align-middle" />Installed</div>
              <div><span className="inline-block w-3 h-3 rounded-full bg-amber-500 mr-1.5 align-middle" />In progress</div>
              <div><span className="inline-block w-3 h-3 rounded-full bg-neutral-500 mr-1.5 align-middle" />Not started</div>
            </div>
          </aside>
        </div>
      </div>
    </SiteShell>
  );
}
