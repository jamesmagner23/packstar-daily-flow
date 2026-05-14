
CREATE TABLE public.rate_card_variations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID,
  resource TEXT NOT NULL,
  time_band TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_card_variations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_rate_card_variations" ON public.rate_card_variations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_rate_card_variations" ON public.rate_card_variations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_rate_card_variations" ON public.rate_card_variations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_rate_card_variations" ON public.rate_card_variations FOR DELETE TO authenticated USING (true);
