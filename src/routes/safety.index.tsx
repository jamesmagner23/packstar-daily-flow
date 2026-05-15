import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";

export const Route = createFileRoute("/safety/")({
  component: SafetyPage,
});

function SafetyPage() {
  return (
    <SiteShell section="Safety">
      <h1 className="t-h1">Safety</h1>
      <p className="t-body mt-2 text-[color:var(--meta)]">Coming soon.</p>
    </SiteShell>
  );
}
