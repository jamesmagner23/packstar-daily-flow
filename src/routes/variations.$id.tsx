import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteShell } from "@/components/SiteShell";
import { shortDate, longDate, businessDaysRemaining } from "@/lib/format";

export const Route = createFileRoute("/variations/$id")({
  head: () => ({
    meta: [{ title: "Variation flag — PACC HQ" }],
  }),
  component: VariationDetail,
});

function VariationDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: v } = useQuery({
    queryKey: ["variation", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("variation_flags")
        .select("*, projects(*), daily_reports(report_date, supervisors(name))")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
  });

  const markSent = useMutation({
    mutationFn: async () => {
      await supabase.from("variation_flags").update({ notice_sent_at: new Date().toISOString(), status: "notice_sent" }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["variation", id] }),
  });

  if (!v) {
    return (
      <SiteShell section="Variations">
        <p className="text-xs text-meta">Loading.</p>
      </SiteShell>
    );
  }

  const bd = businessDaysRemaining(v.deadline_at);
  const project: any = v.projects;
  const rep = project?.head_contractor_rep ?? {};

  const draft = `Hi ${rep.name ?? "[rep]"},

Flagging a likely ${v.claim_type} on ${project?.name ?? "the project"}.

Trigger: ${v.trigger_phrase ?? v.description ?? ""}

Per ${v.clause_ref}, notice is due within ${v.notice_deadline_bd ?? "the contracted"} business days. Treat this as our notice. Photos and particulars to follow.

Cheers,
James
PACC`;

  return (
    <SiteShell section="Variations">
      <Link to="/variations" className="t-eyebrow text-meta">← Register</Link>
      <header className="mt-4 mb-10">
        <div className="t-eyebrow">{v.claim_type}</div>
        <h1 className="t-display mt-2">{v.description ?? v.trigger_phrase ?? "Variation"}</h1>
        <p className="t-lead mt-3">Clause {v.clause_ref}. Flagged {longDate(v.created_at)}.</p>
      </header>

      <section className="hairline pt-6 grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
        <div>
          <div className="t-stat">{bd === null ? "—" : bd < 0 ? `${Math.abs(bd)}` : bd}</div>
          <div className="t-stat-label mt-2">{bd !== null && bd < 0 ? "BD overdue" : "BD remaining"}</div>
        </div>
        <div>
          <div className="t-stat">{v.notice_deadline_bd ?? "—"}</div>
          <div className="t-stat-label mt-2">Notice window BD</div>
        </div>
        <div>
          <div className="t-stat">{v.duration_impact_hours ?? "—"}</div>
          <div className="t-stat-label mt-2">Hours lost</div>
        </div>
        <div>
          <div className="t-stat">{v.symal_rep_saw ? "Yes" : "No"}</div>
          <div className="t-stat-label mt-2">Head contractor witnessed</div>
        </div>
      </section>

      <section className="mb-12">
        <div className="t-eyebrow mb-3">Photos</div>
        <div className="hairline pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {(v.photo_urls ?? []).length === 0 && <p className="text-xs text-meta col-span-full">No photos attached.</p>}
          {(v.photo_urls ?? []).map((url: string) => (
            <img key={url} src={url} alt="Site photo" className="w-full aspect-square object-cover border border-rule" />
          ))}
        </div>
      </section>

      <section className="mb-12">
        <div className="t-eyebrow mb-3">Suggested email to head contractor</div>
        <div className="hairline pt-4">
          <pre className="text-xs whitespace-pre-wrap font-sans bg-secondary p-5 border border-rule">{draft}</pre>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => navigator.clipboard.writeText(draft)}
              className="text-xs uppercase tracking-[0.16em] font-semibold border border-[color:var(--brand)] text-[color:var(--brand)] px-4 py-2 hover:bg-[color:var(--brand)] hover:text-white transition"
            >
              Copy draft
            </button>
            {!v.notice_sent_at && (
              <button
                onClick={() => markSent.mutate()}
                className="text-xs uppercase tracking-[0.16em] font-semibold bg-[color:var(--brand)] text-white px-4 py-2 hover:bg-[color:var(--brand-deep)] transition"
              >
                Mark notice sent
              </button>
            )}
            {v.notice_sent_at && (
              <span className="text-xs text-meta self-center">Notice sent {shortDate(v.notice_sent_at)}</span>
            )}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
