-- 1. classifications: new columns
ALTER TABLE public.classifications
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rate_employee numeric,
  ADD COLUMN IF NOT EXISTS rate_casual numeric,
  ADD COLUMN IF NOT EXISTS rate_subcontractor numeric;

CREATE UNIQUE INDEX IF NOT EXISTS classifications_code_unique
  ON public.classifications(code) WHERE code IS NOT NULL;

INSERT INTO public.classifications (classification, employment_type, description, nt_cost_per_hr, ot_cost_per_hr, code, active)
VALUES
  ('CW1',  'employee', 'Civil Worker Level 1', 0, 0, 'CW1',  true),
  ('CW2',  'employee', 'Civil Worker Level 2', 0, 0, 'CW2',  true),
  ('CW3',  'employee', 'Civil Worker Level 3', 0, 0, 'CW3',  true),
  ('PCW1', 'employee', 'Plant Civil Worker Level 1 (small plant)',      0, 0, 'PCW1', true),
  ('PCW2', 'employee', 'Plant Civil Worker Level 2 (medium plant)',     0, 0, 'PCW2', true),
  ('PCW3', 'employee', 'Plant Civil Worker Level 3 (large plant)',      0, 0, 'PCW3', true),
  ('PCW4', 'employee', 'Plant Civil Worker Level 4 (specialised plant)',0, 0, 'PCW4', true),
  ('LH',   'employee', 'Leading Hand',     0, 0, 'LH', true),
  ('TL',   'employee', 'Team Leader',      0, 0, 'TL', true),
  ('SV',   'employee', 'Site Supervisor',  0, 0, 'SV', true)
ON CONFLICT (classification, employment_type) DO UPDATE
  SET code = EXCLUDED.code,
      description = COALESCE(public.classifications.description, EXCLUDED.description),
      active = true;

-- 2. daily_allocations: new columns
ALTER TABLE public.daily_allocations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS plant_item_id uuid REFERENCES public.plant_items(id),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_allocations_status_check') THEN
    ALTER TABLE public.daily_allocations
      ADD CONSTRAINT daily_allocations_status_check CHECK (status IN ('planned','actual'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_allocations_employment_type_check') THEN
    ALTER TABLE public.daily_allocations
      ADD CONSTRAINT daily_allocations_employment_type_check
      CHECK (employment_type IS NULL OR employment_type IN ('employee','casual','subcontractor'));
  END IF;
END $$;

ALTER TABLE public.daily_allocations DROP CONSTRAINT IF EXISTS daily_allocations_source_check;
ALTER TABLE public.daily_allocations
  ADD CONSTRAINT daily_allocations_source_check
  CHECK (source IN ('planned','wrap_actual','timesheet_claimed','board','wrap','assignar_import','manual'));

CREATE INDEX IF NOT EXISTS daily_allocations_status_date_idx
  ON public.daily_allocations(status, allocation_date);
CREATE INDEX IF NOT EXISTS daily_allocations_plant_item_date_idx
  ON public.daily_allocations(plant_item_id, allocation_date) WHERE plant_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS daily_allocations_person_date_job_status_unique
  ON public.daily_allocations(person_id, allocation_date, job_id, status);
