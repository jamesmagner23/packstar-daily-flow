
ALTER TABLE public.plant_items
  ADD COLUMN IF NOT EXISTS rate_basis text NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS daily_rate numeric,
  ADD COLUMN IF NOT EXISTS weekly_rate numeric;

ALTER TABLE public.plant_items
  DROP CONSTRAINT IF EXISTS plant_items_rate_basis_check;
ALTER TABLE public.plant_items
  ADD CONSTRAINT plant_items_rate_basis_check
  CHECK (rate_basis IN ('hourly','daily','weekly'));

CREATE TABLE IF NOT EXISTS public.plant_hire_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  plant_id_code text NOT NULL,
  on_date date NOT NULL,
  off_date date,
  rate_basis text NOT NULL,
  rate_snapshot numeric,
  source text NOT NULL DEFAULT 'slack',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plant_hire_periods_basis_check CHECK (rate_basis IN ('hourly','daily','weekly'))
);

CREATE INDEX IF NOT EXISTS plant_hire_periods_lookup
  ON public.plant_hire_periods (project_id, plant_id_code, on_date);

CREATE UNIQUE INDEX IF NOT EXISTS plant_hire_periods_open_unique
  ON public.plant_hire_periods (project_id, plant_id_code)
  WHERE off_date IS NULL;

ALTER TABLE public.plant_hire_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_select_plant_hire_periods ON public.plant_hire_periods
  FOR SELECT TO anon USING (true);
CREATE POLICY auth_select_plant_hire_periods ON public.plant_hire_periods
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insert_plant_hire_periods ON public.plant_hire_periods
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_update_plant_hire_periods ON public.plant_hire_periods
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_delete_plant_hire_periods ON public.plant_hire_periods
  FOR DELETE TO authenticated USING (true);

-- Seed rate bases for the recently-added small-hire items
UPDATE public.plant_items SET rate_basis = 'weekly', weekly_rate = 450
  WHERE plant_id_code IN ('P300','P301','P302');
UPDATE public.plant_items SET rate_basis = 'daily', daily_rate = 75
  WHERE plant_id_code IN ('P303','P304');
UPDATE public.plant_items SET rate_basis = 'daily', daily_rate = 65
  WHERE plant_id_code = 'P305';
UPDATE public.plant_items SET rate_basis = 'weekly', weekly_rate = 220
  WHERE plant_id_code IN ('P306','P307');
UPDATE public.plant_items SET rate_basis = 'weekly', weekly_rate = 250
  WHERE plant_id_code = 'P308';
UPDATE public.plant_items SET rate_basis = 'weekly', weekly_rate = 320
  WHERE plant_id_code = 'P309';
UPDATE public.plant_items SET rate_basis = 'daily', daily_rate = 60
  WHERE plant_id_code = 'P310';
UPDATE public.plant_items SET rate_basis = 'weekly', weekly_rate = 240
  WHERE plant_id_code = 'P311';
