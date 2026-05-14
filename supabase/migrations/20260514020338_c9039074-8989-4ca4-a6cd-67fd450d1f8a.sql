-- 1. crew_members: drop per-person rates, add capabilities + employment_type
ALTER TABLE public.crew_members
  DROP COLUMN IF EXISTS cost_rate_nt,
  DROP COLUMN IF EXISTS cost_rate_ot,
  ADD COLUMN IF NOT EXISTS capabilities text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS employment_type text;

-- 2. classifications rate-lookup table
CREATE TABLE IF NOT EXISTS public.classifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  classification text NOT NULL,
  employment_type text NOT NULL,
  description text,
  nt_cost_per_hr numeric NOT NULL,
  ot_cost_per_hr numeric NOT NULL,
  eba_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classifications_class_emp_unique UNIQUE (classification, employment_type)
);

ALTER TABLE public.classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_classifications" ON public.classifications
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_classifications" ON public.classifications
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_classifications" ON public.classifications
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_classifications" ON public.classifications
  FOR DELETE TO authenticated USING (true);

-- 3. plant_hire_rate_card (future plant hire business line)
CREATE TABLE IF NOT EXISTS public.plant_hire_rate_card (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  size_class text NOT NULL,
  type text NOT NULL,
  dry_hire_daily numeric,
  dry_hire_weekly numeric,
  wet_hire_nt_hr numeric,
  wet_hire_ot_hr numeric,
  wet_hire_night_hr numeric,
  wet_hire_ph_hr numeric,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plant_hire_rate_card_size_type_unique UNIQUE (size_class, type)
);

ALTER TABLE public.plant_hire_rate_card ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_plant_hire_rate_card" ON public.plant_hire_rate_card
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_plant_hire_rate_card" ON public.plant_hire_rate_card
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_plant_hire_rate_card" ON public.plant_hire_rate_card
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_plant_hire_rate_card" ON public.plant_hire_rate_card
  FOR DELETE TO authenticated USING (true);