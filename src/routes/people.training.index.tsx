import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";

export const Route = createFileRoute("/people/training/")({
  component: TrainingPage,
});

function TrainingPage() {
  return (
    <SiteShell section="People">
      <h1 className="t-h1">Training</h1>
      <p className="t-body mt-2 text-[color:var(--meta)]">Coming soon.</p>
    </SiteShell>
  );
}
