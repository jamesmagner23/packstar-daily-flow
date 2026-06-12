import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, ChevronRight, Truck, FileText, Shield, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/today")({
  head: () => ({ meta: [{ title: "Today — PACC HQ" }] }),
  component: TodayPage,
});

function TodayPage() {
  const navigate = useNavigate();
  const { personId } = useRole();
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
      setAuthChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authChecked && userId === null) {
      navigate({ to: "/login", search: { redirect: "/today" } as any });
    }
  }, [authChecked, userId, navigate]);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const today = format(selectedDate, "yyyy-MM-dd");
  const isToday = today === format(new Date(), "yyyy-MM-dd");
  const dateLabel = new Intl.DateTimeFormat("en-AU", {
    weekday: "long", day: "numeric", month: "long",
  }).format(selectedDate);

  const { data: me } = useQuery({
    queryKey: ["today-me", personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data } = await supabase
        .from("crew_members")
        .select("id, name, default_supervisor_id")
        .eq("id", personId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: allocation } = useQuery({
    queryKey: ["today-allocation", personId, today],
    enabled: !!personId,
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_allocations")
        .select("id, job_id, plant_asset_ids, classification_id, supervisor_id, source")
        .eq("person_id", personId!)
        .eq("allocation_date", today)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const assetIds = (allocation?.plant_asset_ids ?? []) as string[];
  const { data: assets = [] } = useQuery({
    queryKey: ["today-assets", assetIds],
    enabled: assetIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("plant_items")
        .select("id, plant_id_code, description")
        .in("id", assetIds);
      return (data ?? []) as { id: string; plant_id_code: string; description: string | null }[];
    },
  });

  const { data: job } = useQuery({
    queryKey: ["today-job", allocation?.job_id],
    enabled: !!allocation?.job_id,
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, code, name").eq("id", allocation!.job_id).maybeSingle();
      return data;
    },
  });

  const { data: classification } = useQuery({
    queryKey: ["today-classification", allocation?.classification_id],
    enabled: !!allocation?.classification_id,
    queryFn: async () => {
      const { data } = await supabase.from("classifications").select("classification").eq("id", allocation!.classification_id!).maybeSingle();
      return data;
    },
  });

  const { data: supervisor } = useQuery({
    queryKey: ["today-supervisor", me?.default_supervisor_id],
    enabled: !!me?.default_supervisor_id,
    queryFn: async () => {
      const { data } = await supabase.from("crew_members").select("name").eq("id", me!.default_supervisor_id!).maybeSingle();
      return data;
    },
  });

  // Pre-start status: which of today's assets already have a log
  const { data: prestartDone = [] } = useQuery({
    queryKey: ["today-prestart-done", assetIds, today],
    enabled: assetIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("plant_prestart_logs")
        .select("asset_id")
        .eq("prestart_date", today)
        .in("asset_id", assetIds);
      return (data ?? []).map((l: any) => l.asset_id as string);
    },
  });

  // Fallback asset picker — recent assets this operator has pre-started
  const { data: recentAssets = [] } = useQuery({
    queryKey: ["recent-assets", personId],
    enabled: !!personId && assetIds.length === 0,
    queryFn: async () => {
      const { data: recent } = await supabase
        .from("plant_prestart_logs")
        .select("asset_id, prestart_date")
        .eq("operator_person_id", personId!)
        .order("prestart_date", { ascending: false })
        .limit(20);
      const recentIds = Array.from(new Set((recent ?? []).map((r: any) => r.asset_id as string)));
      const { data: items } = await supabase
        .from("plant_items")
        .select("id, plant_id_code, description, active")
        .eq("active", true);
      const all = (items ?? []) as { id: string; plant_id_code: string; description: string | null; active: boolean }[];
      const ranked = [
        ...recentIds.map((id) => all.find((a) => a.id === id)).filter(Boolean),
        ...all.filter((a) => !recentIds.includes(a.id)),
      ] as typeof all;
      return ranked;
    },
  });

  if (roleLoading || !userId) {
    return <div className="min-h-screen flex items-center justify-center text-meta text-sm">Loading…</div>;
  }

  const firstName = (me?.name ?? "").trim().split(/\s+/)[0] || "mate";

  return (
    <div className="min-h-screen bg-neutral-50 pb-12">
      <header className="bg-white border-b border-rule px-4 py-5">
        <div className="max-w-md mx-auto flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-meta uppercase tracking-wide">{dateLabel}</p>
            <h1 className="text-2xl font-semibold mt-1">
              {isToday ? `Morning, ${firstName}.` : `${firstName} — ${format(selectedDate, "EEE d MMM")}`}
            </h1>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0">
                <CalendarIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                disabled={(d) => d > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {allocation ? (
          <section className="bg-white border border-rule rounded-lg p-4 space-y-2 text-sm">
            <Row label="Job" value={job ? `${job.code} — ${job.name}` : "—"} />
            <Row label="Classification" value={classification?.classification ?? "—"} />
            <Row
              label="Plant"
              value={assets.length > 0 ? assets.map((a) => a.plant_id_code).join(", ") : "—"}
            />
            <Row label="Supervisor" value={supervisor?.name ?? "—"} />
          </section>
        ) : (
          <section className="bg-white border border-rule rounded-lg p-4 text-sm">
            <p className="font-medium">No allocation set for today.</p>
            <p className="text-meta text-xs mt-1">Pick the asset you're on:</p>
            <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-rule border border-rule rounded-md">
              {recentAssets.length === 0 && <p className="p-3 text-xs text-meta">No active assets.</p>}
              {recentAssets.map((a) => (
                <Link
                  key={a.id}
                  to="/plant/$id/prestart"
                  params={{ id: a.id }}
                  className="flex items-center justify-between p-3 text-sm hover:bg-neutral-50"
                >
                  <div>
                    <p className="font-medium">{a.plant_id_code}</p>
                    {a.description && <p className="text-xs text-meta truncate">{a.description}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-meta" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {assets.length > 0 && (
          <section className="space-y-2">
            {assets.map((a) => {
              const done = prestartDone.includes(a.id);
              return (
                <Link
                  key={a.id}
                  to="/plant/$id/prestart"
                  params={{ id: a.id }}
                  className={`block rounded-lg p-4 border-2 ${
                    done
                      ? "bg-emerald-50 border-emerald-300"
                      : "bg-[color:var(--brand)] border-[color:var(--brand)] text-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Truck className="h-5 w-5" />
                      <div>
                        <p className="font-semibold text-base">
                          {done ? "Pre-start logged" : "Pre-start"} {a.plant_id_code}
                        </p>
                        {a.description && (
                          <p className={`text-xs ${done ? "text-emerald-800" : "text-white/80"}`}>
                            {a.description}
                          </p>
                        )}
                      </div>
                    </div>
                    {done ? <Check className="h-6 w-6 text-emerald-700" /> : <ChevronRight className="h-5 w-5" />}
                  </div>
                </Link>
              );
            })}
          </section>
        )}

        <section className="space-y-2">
          <button
            disabled
            className="w-full flex items-center justify-between bg-white border border-rule rounded-lg p-4 text-left opacity-60"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-meta" />
              <div>
                <p className="font-semibold text-sm">Log timesheet</p>
                <p className="text-xs text-meta">Coming soon</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-meta" />
          </button>
          <button
            disabled
            className="w-full flex items-center justify-between bg-white border border-rule rounded-lg p-4 text-left opacity-60"
          >
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-meta" />
              <div>
                <p className="font-semibold text-sm">SWMS to review</p>
                <p className="text-xs text-meta">Coming soon</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-meta" />
          </button>
        </section>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-meta">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
