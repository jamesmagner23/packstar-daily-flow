import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";

export const Route = createFileRoute("/compliance/")({
  component: CompliancePage,
});

function CompliancePage() {
  return (
    <SiteShell section="Compliance">
      <h1 className="t-h1">Compliance</h1>
      <p className="t-body mt-2 text-[color:var(--meta)]">Coming soon.</p>
    </SiteShell>
  );
}
