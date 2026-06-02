import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onGoogle() {
    setError(null);
    setGoogleLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setGoogleLoading(false);
      setError(result.error.message || "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) return setError(error.message);
    setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 via-white to-neutral-100 px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(circle at 20% 20%, var(--brand) 0, transparent 50%), radial-gradient(circle at 80% 80%, var(--brand) 0, transparent 50%)" }} />
      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="brand-wordmark text-3xl leading-none text-[color:var(--brand)]">PACC</span>
            <span className="brand-wordmark text-xl leading-none tracking-[0.18em] font-sans text-neutral-700">HQ</span>
          </div>
          <p className="mt-3 text-sm text-meta">Create your account</p>
        </div>

        {sent ? (
          <div className="bg-white border border-rule rounded-2xl p-7 text-center shadow-xl shadow-neutral-900/5">
            <h2 className="text-base font-semibold text-ink">Check your email</h2>
            <p className="mt-2 text-sm text-meta">
              We sent a verification link to <strong>{email}</strong>. Click it to finish signing up.
            </p>
            <Link to="/login" className="mt-4 inline-block text-sm text-[color:var(--brand)] hover:underline font-medium">
              Back to sign in
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-rule rounded-2xl p-7 shadow-xl shadow-neutral-900/5">
            <button
              type="button"
              onClick={onGoogle}
              disabled={googleLoading}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg border border-rule bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-neutral-50 transition disabled:opacity-60"
            >
              <GoogleIcon />
              {googleLoading ? "Connecting…" : "Continue with Google"}
            </button>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-rule" />
              <span className="text-[11px] uppercase tracking-wider text-meta">or</span>
              <div className="h-px flex-1 bg-rule" />
            </div>
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
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-meta mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 focus:border-[color:var(--brand)]"
                  autoComplete="new-password"
                />
                <p className="mt-1 text-[11px] text-meta">Minimum 8 characters.</p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center rounded-lg bg-[color:var(--brand)] text-white px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-60 shadow-sm"
              >
                {loading ? "Creating account…" : "Sign up"}
              </button>
              <p className="text-xs text-meta text-center">
                Already have an account?{" "}
                <Link to="/login" className="text-[color:var(--brand)] hover:underline font-medium">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        )}
        <p className="mt-6 text-center text-[11px] text-meta">
          Protected workspace · PACC HQ © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.92v2.33A9 9 0 009 18z"/>
      <path fill="#FBBC05" d="M3.98 10.72A5.41 5.41 0 013.68 9c0-.6.1-1.18.3-1.72V4.95H.92A9 9 0 000 9c0 1.45.35 2.83.92 4.05l3.06-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 009 0 9 9 0 00.92 4.95l3.06 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}
