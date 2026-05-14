import { Link, useRouterState } from "@tanstack/react-router";
import { BrandBarTop, BrandBarBottom } from "./BrandBar";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/variations", label: "Variations" },
  { to: "/reports", label: "Reports" },
  { to: "/setup", label: "Project setup" },
];

export function SiteShell({ section, children }: { section: string; children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen flex flex-col">
      <BrandBarTop section={section} />
      <header className="px-6 md:px-10 py-5 border-b border-rule flex items-center justify-between bg-white">
        <Link to="/" className="flex items-baseline gap-3">
          <span className="brand-wordmark text-2xl text-[color:var(--brand)]">PACC</span>
          <span className="t-eyebrow">PackHQ</span>
        </Link>
        <nav className="flex gap-6">
          {NAV.map((n) => {
            const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                  active ? "text-[color:var(--brand)]" : "text-[color:var(--meta)] hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 px-6 md:px-10 lg:px-14 py-10 max-w-[1400px] w-full mx-auto">
        {children}
      </main>
      <BrandBarBottom section={section} page="PackHQ v0.1" />
    </div>
  );
}
