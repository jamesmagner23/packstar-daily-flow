import { Link, useRouterState } from "@tanstack/react-router";
import { BrandBarTop, BrandBarBottom } from "./BrandBar";

// Top-level areas of PACC HQ. More tabs (Safety, People, Plant, etc.)
// will be added next to Finance over time.
const TABS = [
  { key: "finance", label: "Finance", to: "/" as const },
  { key: "compliance", label: "Compliance", to: "/compliance" as const },
  { key: "safety", label: "Safety", to: "/safety" as const },
  { key: "utilisation", label: "Utilisation", to: "/utilisation" as const },
];

// Sub-nav rendered when the Finance tab is active.
const FINANCE_NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/variations", label: "Variations" },
  { to: "/reports", label: "Reports" },
  { to: "/setup", label: "Project setup" },
];

const FINANCE_PATHS = ["/", "/variations", "/reports", "/setup"];

export function SiteShell({ section, children }: { section: string; children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const inFinance = FINANCE_PATHS.some((p) => (p === "/" ? path === "/" : path.startsWith(p)));
  const activeTab = path.startsWith("/compliance")
    ? "compliance"
    : path.startsWith("/safety")
      ? "safety"
      : path.startsWith("/utilisation")
        ? "utilisation"
        : inFinance
          ? "finance"
          : null;

  return (
    <div className="min-h-screen flex flex-col">
      <BrandBarTop section={section} />
      <header className="border-b border-rule bg-white">
        <div className="px-4 md:px-10 py-4 md:py-5 max-w-[1400px] mx-auto w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
          <Link to="/" className="flex items-baseline gap-2 shrink-0">
            <span className="brand-wordmark text-xl md:text-2xl text-[color:var(--brand)]">PACC</span>
            <span className="t-eyebrow hidden sm:inline">HQ</span>
          </Link>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {TABS.map((t) => {
              const active = t.key === activeTab;
              return (
                <Link
                  key={t.key}
                  to={t.to}
                  className={`text-xs md:text-sm font-semibold uppercase tracking-[0.16em] pb-1 border-b-2 ${
                    active
                      ? "text-[color:var(--brand)] border-[color:var(--brand)]"
                      : "text-[color:var(--meta)] border-transparent hover:text-ink"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {activeTab === "finance" && (
          <div className="px-4 md:px-10 max-w-[1400px] mx-auto w-full border-t border-rule">
            <nav className="flex flex-wrap gap-x-5 gap-y-2 sm:gap-6 py-3">
              {FINANCE_NAV.map((n) => {
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
        )}
      </header>
      <main className="flex-1 px-4 md:px-10 lg:px-14 py-6 md:py-10 max-w-[1400px] w-full mx-auto">
        {children}
      </main>
      <BrandBarBottom section={section} page="PACC HQ v0.1" />
    </div>
  );
}
