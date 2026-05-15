import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";

export const Route = createFileRoute("/utilisation/")({
  component: UtilisationPage,
});

function UtilisationPage() {
  return (
    <SiteShell section="Utilisation">
      <h1 className="t-h1">Utilisation</h1>
      <p className="t-body mt-2 text-[color:var(--meta)]">Coming soon.</p>
    </SiteShell>
  );
}
