import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/SiteShell";

export const Route = createFileRoute("/people/roles/")({
  component: RolesPage,
});

function RolesPage() {
  return (
    <SiteShell section="People">
      <h1 className="t-h1">Roles</h1>
      <p className="t-body mt-2 text-[color:var(--meta)]">Coming soon.</p>
    </SiteShell>
  );
}
