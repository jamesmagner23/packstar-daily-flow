import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "supervisor" | "crew" | null;

export function useRole() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["user-role", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role, person_id")
        .eq("user_id", userId!)
        .maybeSingle();
      return data as { role: AppRole; person_id: string | null } | null;
    },
  });

  return {
    role: (data?.role ?? null) as AppRole,
    personId: data?.person_id ?? null,
    loading: !!userId && isLoading,
    isAdmin: data?.role === "admin",
    isSupervisor: data?.role === "supervisor",
    isCrew: data?.role === "crew",
  };
}
