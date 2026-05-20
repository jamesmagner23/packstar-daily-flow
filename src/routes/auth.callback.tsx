import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing sign-in…");

  useEffect(() => {
    // Supabase sets the session from URL hash automatically when detectSessionInUrl is on.
    // We just wait for it and then redirect.
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setMessage(error.message);
        return;
      }
      if (data.session) {
        navigate({ to: "/" });
      } else {
        // Give the client a beat to parse the hash, then re-check.
        setTimeout(async () => {
          const { data: again } = await supabase.auth.getSession();
          if (cancelled) return;
          if (again.session) navigate({ to: "/" });
          else navigate({ to: "/login" });
        }, 500);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <p className="text-sm text-meta">{message}</p>
    </div>
  );
}
