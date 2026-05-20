import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="brand-wordmark text-2xl leading-none text-[color:var(--brand)]">PACC</span>
            <span className="brand-wordmark text-lg leading-none tracking-[0.18em] font-sans text-neutral-700">HQ</span>
          </div>
          <p className="mt-2 text-sm text-meta">Create your account</p>
        </div>

        {sent ? (
          <div className="bg-white border border-rule rounded-lg p-6 text-center">
            <h2 className="text-base font-semibold text-ink">Check your email</h2>
            <p className="mt-2 text-sm text-meta">
              We sent a verification link to <strong>{email}</strong>. Click it to finish signing up.
            </p>
            <Link to="/login" className="mt-4 inline-block text-sm text-[color:var(--brand)] hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 bg-white border border-rule rounded-lg p-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-meta mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[color:var(--brand)]"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-meta mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[color:var(--brand)]"
                autoComplete="new-password"
              />
              <p className="mt-1 text-[11px] text-meta">Minimum 8 characters.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center rounded-md bg-[color:var(--brand)] text-white px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Sign up"}
            </button>
            <p className="text-xs text-meta text-center">
              Already have an account?{" "}
              <Link to="/login" className="text-[color:var(--brand)] hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
