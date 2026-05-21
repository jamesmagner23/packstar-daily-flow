import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    navigate({ to: redirect || "/" });
  }

  async function onMagicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email address.");
      return;
    }
    setLoading(true);
    const emailRedirectTo = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
      redirect || "/today",
    )}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo, shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      console.error("[magic-link] signInWithOtp failed", error);
      return setError(error.message);
    }
    setInfo("Check your email for a sign-in link.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="brand-wordmark text-2xl leading-none text-[color:var(--brand)]">PACC</span>
            <span className="brand-wordmark text-lg leading-none tracking-[0.18em] font-sans text-neutral-700">HQ</span>
          </div>
          <p className="mt-2 text-sm text-meta">Sign in to continue</p>
        </div>

        <div className="bg-white border border-rule rounded-lg p-6">
          <div className="flex gap-1 mb-4 bg-neutral-100 rounded-md p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => { setMode("password"); setError(null); setInfo(null); }}
              className={`flex-1 py-1.5 rounded ${mode === "password" ? "bg-white shadow-sm" : "text-meta"}`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => { setMode("magic"); setError(null); setInfo(null); }}
              className={`flex-1 py-1.5 rounded ${mode === "magic" ? "bg-white shadow-sm" : "text-meta"}`}
            >
              Email link
            </button>
          </div>

          {mode === "password" ? (
            <form onSubmit={onPasswordSubmit} className="space-y-4">
              <Field label="Email">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[color:var(--brand)]"
                  autoComplete="email"
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[color:var(--brand)]"
                  autoComplete="current-password"
                />
              </Field>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center rounded-md bg-[color:var(--brand)] text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
              <p className="text-xs text-meta text-center">
                No account?{" "}
                <Link to="/signup" className="text-[color:var(--brand)] hover:underline">Sign up</Link>
              </p>
            </form>
          ) : (
            <form onSubmit={onMagicSubmit} noValidate className="space-y-4">

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[color:var(--brand)]"
                  autoComplete="email"
                />

                />
              </Field>
              {error && <p className="text-sm text-red-600">{error}</p>}
              {info && <p className="text-sm text-emerald-700">{info}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center rounded-md bg-[color:var(--brand)] text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Sending…" : "Email me a link"}
              </button>
              <p className="text-xs text-meta text-center">
                Admin must add you first. Operators on plant use this option.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-meta mb-1.5">{label}</label>
      {children}
    </div>
  );
}
