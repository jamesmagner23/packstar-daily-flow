import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    let cancelled = false;
    const target = redirect || "/today";
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) { setMessage(error.message); return; }
      if (data.session) {
        navigate({ to: target });
      } else {
        setTimeout(async () => {
          const { data: again } = await supabase.auth.getSession();
          if (cancelled) return;
          if (again.session) navigate({ to: target });
          else navigate({ to: "/login" });
        }, 500);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, redirect]);


  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <p className="text-sm text-meta">{message}</p>
    </div>
  );
}
