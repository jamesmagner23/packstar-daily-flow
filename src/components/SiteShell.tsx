import { useEffect, useRef, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  TrendingUp,
  Users,
  ClipboardCheck,
  HardHat,
  BarChart3,
  Truck,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BrandBarTop, BrandBarBottom } from "./BrandBar";

type SubNavItem = { to: string; label: string };
type Tab = {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  paths: string[];
  subNav?: SubNavItem[];
};

const TABS: Tab[] = [
  {
    key: "finance",
    label: "Finance",
    to: "/",
    icon: TrendingUp,
    paths: ["/", "/variations", "/reports", "/setup"],
    subNav: [
      { to: "/", label: "Dashboard" },
      { to: "/variations", label: "Variations" },
      { to: "/reports", label: "Reports" },
      { to: "/setup", label: "Project setup" },
    ],
  },
  {
    key: "people",
    label: "People",
    to: "/crew",
    icon: Users,
    paths: ["/people", "/crew", "/tickets"],
    subNav: [
      { to: "/crew", label: "Crew" },
      { to: "/tickets", label: "Tickets" },
      { to: "/people/team", label: "Team" },
      { to: "/people/roles", label: "Roles" },
      { to: "/people/training", label: "Training" },
    ],
  },
  { key: "compliance", label: "Compliance", to: "/compliance", icon: ClipboardCheck, paths: ["/compliance"] },
  { key: "safety", label: "Safety", to: "/safety", icon: HardHat, paths: ["/safety"] },
  { key: "utilisation", label: "Utilisation", to: "/utilisation", icon: BarChart3, paths: ["/utilisation"] },
  {
    key: "procure",
    label: "Procure",
    to: "/procure",
    icon: Truck,
    paths: ["/procure"],
    subNav: [
      { to: "/procure", label: "Overview" },
      { to: "/procure/suppliers", label: "Suppliers" },
      { to: "/procure/equipment", label: "Equipment Catalogue" },
    ],
  },
];

function matchPath(path: string, prefix: string) {
  return prefix === "/" ? path === "/" : path === prefix || path.startsWith(prefix + "/");
}

const SIDEBAR_COLLAPSED_KEY = "pacchq.sidebar.collapsed";
const PROJECT_KEY = "pacchq.project.id";

export function SiteShell({ section, children }: { section: string; children: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const activeTab = TABS.find((t) => t.paths.some((p) => matchPath(path, p))) ?? null;
  const subNav = activeTab?.subNav;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [path]);

  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Intl.DateTimeFormat("en-AU", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    }).format(new Date()));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <BrandBarTop section={section} />

      {/* Top bar */}
      <header className="border-b border-rule bg-white sticky top-0 z-30">
        <div className="px-3 md:px-6 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-md text-meta hover:text-ink hover:bg-neutral-100"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link to="/" className="flex items-baseline gap-1.5 shrink-0">
            <span className="brand-wordmark text-xl md:text-2xl leading-none text-[color:var(--brand)]">PACC</span>
            <span className="brand-wordmark text-base md:text-lg leading-none tracking-[0.18em] font-sans text-neutral-700">HQ</span>
          </Link>

          <div className="hidden sm:block flex-1 min-w-0 max-w-md ml-2">
            <ProjectSelector />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden md:inline text-xs text-meta">{today}</span>
            <UserMenu />
          </div>
        </div>
        {/* Mobile project selector below top bar */}
        <div className="sm:hidden px-3 pb-3">
          <ProjectSelector />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Desktop sidebar */}
        <aside
          className={`hidden md:flex flex-col border-r border-rule bg-white shrink-0 transition-[width] duration-200 ${
            collapsed ? "w-16" : "w-60"
          }`}
        >
          <SidebarNav collapsed={collapsed} activeKey={activeTab?.key ?? null} />
          <button
            type="button"
            onClick={toggleCollapsed}
            className="border-t border-rule h-10 flex items-center justify-center text-meta hover:text-ink hover:bg-neutral-50"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-40">
            <div
              className="absolute inset-0 bg-black/40 animate-fade-in"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-64 bg-white border-r border-rule flex flex-col animate-[slide-in-right_0.25s_ease-out_reverse]" style={{ animation: "slide-in-right 0.25s ease-out", transform: "translateX(0)" }}>
              <div className="h-14 flex items-center justify-between px-4 border-b border-rule">
                <span className="brand-wordmark text-base text-[color:var(--brand)]">PACC HQ</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md text-meta hover:text-ink hover:bg-neutral-100"
                  aria-label="Close navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarNav collapsed={false} activeKey={activeTab?.key ?? null} onItemClick={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Module-level sub nav */}
          {subNav && (
            <div className="border-b border-rule bg-white">
              <div className="px-4 md:px-8 max-w-[1400px] mx-auto w-full">
                <nav className="flex flex-wrap gap-x-5 gap-y-2 sm:gap-6 py-3">
                  {subNav.map((n) => {
                    const active = matchPath(path, n.to);
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
            </div>
          )}

          <main className="flex-1 px-4 md:px-8 lg:px-12 py-6 md:py-10 max-w-[1400px] w-full mx-auto">
            {children}
          </main>
          <BrandBarBottom section={section} page="PACC HQ v0.1" />
        </div>
      </div>
    </div>
  );
}

function SidebarNav({
  collapsed,
  activeKey,
  onItemClick,
}: {
  collapsed: boolean;
  activeKey: string | null;
  onItemClick?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto py-3">
      <ul className="flex flex-col gap-0.5 px-2">
        {TABS.map((t) => {
          const active = t.key === activeKey;
          const Icon = t.icon;
          return (
            <li key={t.key}>
              <Link
                to={t.to}
                onClick={onItemClick}
                title={collapsed ? t.label : undefined}
                className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium border-l-2 transition-colors ${
                  active
                    ? "bg-[color:var(--brand)]/10 text-[color:var(--brand)] border-[color:var(--brand)]"
                    : "text-meta hover:text-ink hover:bg-neutral-50 border-transparent"
                } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ProjectSelector() {
  const { data: projects = [] } = useQuery({
    queryKey: ["projects-selector"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, code, name")
        .eq("active", true)
        .order("code");
      return (data ?? []) as { id: string; code: string; name: string }[];
    },
  });

  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    if (!projects.length) return;
    let saved = "";
    try { saved = localStorage.getItem(PROJECT_KEY) ?? ""; } catch {}
    const exists = projects.some((p) => p.id === saved);
    setSelectedId(exists ? saved : projects[0].id);
  }, [projects]);

  function onChange(id: string) {
    setSelectedId(id);
    try { localStorage.setItem(PROJECT_KEY, id); } catch {}
  }

  return (
    <div className="relative">
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-neutral-50 border border-rule rounded-md pl-3 pr-8 py-1.5 text-xs md:text-sm text-ink hover:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-[color:var(--brand)] truncate"
        aria-label="Select project"
      >
        {projects.length === 0 && <option value="">No projects</option>}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} — {p.name}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-meta pointer-events-none" />
    </div>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  const initials = email ? email.slice(0, 2).toUpperCase() : "??";

  if (!email) {
    return (
      <Link
        to="/login"
        className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand)] hover:underline"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-8 w-8 rounded-full bg-[color:var(--brand)] text-white text-xs font-semibold inline-flex items-center justify-center hover:opacity-90"
        aria-label="User menu"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-rule rounded-md shadow-lg z-50">
          <div className="px-3 py-2 border-b border-rule">
            <p className="text-xs text-meta">Signed in as</p>
            <p className="text-sm text-ink truncate">{email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-neutral-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
