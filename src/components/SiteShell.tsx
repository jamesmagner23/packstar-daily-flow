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
      <header className="px-4 md:px-10 py-4 md:py-5 border-b border-rule bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6 max-w-[1400px] mx-auto w-full">
          <Link to="/" className="flex items-baseline gap-2 shrink-0">
            <span className="brand-wordmark text-xl md:text-2xl text-[color:var(--brand)]">PACC</span>
            <span className="t-eyebrow hidden sm:inline">HQ</span>
          </Link>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 sm:gap-6">
            {NAV.map((n) => {
              const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`text-[11px] md:text-xs font-semibold uppercase tracking-[0.14em] md:tracking-[0.16em] ${
                    active ? "text-[color:var(--brand)]" : "text-[color:var(--meta)] hover:text-ink"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1 px-4 md:px-10 lg:px-14 py-6 md:py-10 max-w-[1400px] w-full mx-auto">
        {children}
      </main>
      <BrandBarBottom section={section} page="PACC HQ v0.1" />
    </div>
  );
}
