import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) return setError("Enter your email address.");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return setError(error.message);
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 via-white to-neutral-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="brand-wordmark text-3xl leading-none text-[color:var(--brand)]">PACC</span>
            <span className="brand-wordmark text-xl leading-none tracking-[0.18em] font-sans text-neutral-700">HQ</span>
          </div>
          <p className="mt-3 text-sm text-meta">Reset your password.</p>
        </div>

        <div className="bg-white border border-rule rounded-2xl p-7 shadow-xl shadow-neutral-900/5">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-ink">If an account exists for <strong>{email}</strong>, a reset link is on its way.</p>
              <p className="text-xs text-meta">Check your inbox (and spam) for an email from PACC HQ.</p>
              <Link to="/login" className="inline-block text-sm text-[color:var(--brand)] hover:underline font-medium">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-meta mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 focus:border-[color:var(--brand)]"
                  autoComplete="email"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center rounded-lg bg-[color:var(--brand)] text-white px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-60 shadow-sm"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
              <p className="text-xs text-meta text-center">
                Remember it?{" "}
                <Link to="/login" className="text-[color:var(--brand)] hover:underline font-medium">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
