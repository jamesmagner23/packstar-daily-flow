import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase auto-consumes the recovery token from the URL hash and creates a session.
    const validationTimer = window.setTimeout(() => setInvalidLink(true), 4500);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        window.clearTimeout(validationTimer);
        setInvalidLink(false);
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        window.clearTimeout(validationTimer);
        setInvalidLink(false);
        setReady(true);
      }
    });
    return () => {
      window.clearTimeout(validationTimer);
      subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(error.message);
    setDone(true);
    setTimeout(() => navigate({ to: "/" }), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 via-white to-neutral-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="brand-wordmark text-3xl leading-none text-[color:var(--brand)]">PACC</span>
            <span className="brand-wordmark text-xl leading-none tracking-[0.18em] font-sans text-neutral-700">HQ</span>
          </div>
          <p className="mt-3 text-sm text-meta">Choose a new password.</p>
        </div>

        <div className="bg-white border border-rule rounded-2xl p-7 shadow-xl shadow-neutral-900/5">
          {done ? (
            <p className="text-sm text-emerald-700 text-center">Password updated. Redirecting…</p>
          ) : invalidLink ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-ink">This reset link is missing, expired, or was created before the latest update.</p>
              <a href="/forgot-password" className="inline-block text-sm text-[color:var(--brand)] hover:underline font-medium">Send a new reset link</a>
            </div>
          ) : !ready ? (
            <p className="text-sm text-meta text-center">Validating reset link…</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-meta mb-1.5">New password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 focus:border-[color:var(--brand)]"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-meta mb-1.5">Confirm password</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 focus:border-[color:var(--brand)]"
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center rounded-lg bg-[color:var(--brand)] text-white px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-60 shadow-sm"
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
