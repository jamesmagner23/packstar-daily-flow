
-- 1) work_types lookup
CREATE TABLE public.work_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_types TO authenticated;
GRANT ALL ON public.work_types TO service_role;
ALTER TABLE public.work_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wt_read_auth" ON public.work_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "wt_admin_write" ON public.work_types FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.work_types (code, description, display_order) VALUES
  ('drainage','Drainage',10),
  ('piling','Piling',20),
  ('wet_hire','Wet hire',30),
  ('dry_hire','Dry hire',40),
  ('civil','Civil',50),
  ('concrete','Concrete',60),
  ('demolition','Demolition',70),
  ('other','Other',999);

-- 2) projects additions
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS work_type uuid REFERENCES public.work_types(id),
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

-- 3) plant_items additions (display name + category for requirements matching)
ALTER TABLE public.plant_items
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS type text;
UPDATE public.plant_items SET name = COALESCE(name, description, plant_id_code) WHERE name IS NULL;

-- 4) project_supervisors
CREATE TABLE public.project_supervisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supervisor_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'site_supervisor',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, supervisor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_supervisors TO authenticated;
GRANT ALL ON public.project_supervisors TO service_role;
ALTER TABLE public.project_supervisors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps_read_auth" ON public.project_supervisors FOR SELECT TO authenticated USING (true);
CREATE POLICY "ps_admin_write" ON public.project_supervisors FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "ps_self_write" ON public.project_supervisors FOR ALL TO authenticated
  USING (supervisor_id = public.current_user_person_id())
  WITH CHECK (supervisor_id = public.current_user_person_id());

INSERT INTO public.project_supervisors (project_id, supervisor_id)
SELECT DISTINCT job_id, supervisor_id FROM public.daily_allocations
WHERE supervisor_id IS NOT NULL AND job_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 5) project_requirements
CREATE TABLE public.project_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requirement_type text NOT NULL CHECK (requirement_type IN ('classification','plant_type')),
  classification_id uuid REFERENCES public.classifications(id),
  plant_type text,
  required_count int NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (requirement_type='classification' AND classification_id IS NOT NULL AND plant_type IS NULL)
    OR (requirement_type='plant_type' AND plant_type IS NOT NULL AND classification_id IS NULL)
  )
);
CREATE UNIQUE INDEX project_requirements_uniq
  ON public.project_requirements (project_id, requirement_type, COALESCE(classification_id::text,''), COALESCE(plant_type,''));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_requirements TO authenticated;
GRANT ALL ON public.project_requirements TO service_role;
ALTER TABLE public.project_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_read_auth" ON public.project_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "pr_admin_write" ON public.project_requirements FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "pr_supervisor_write" ON public.project_requirements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_supervisors ps WHERE ps.project_id = project_requirements.project_id AND ps.supervisor_id = public.current_user_person_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.project_supervisors ps WHERE ps.project_id = project_requirements.project_id AND ps.supervisor_id = public.current_user_person_id()));

-- 6) weather_forecasts
CREATE TABLE public.weather_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  forecast_date date NOT NULL,
  temp_min_c numeric,
  temp_max_c numeric,
  rain_probability_pct int CHECK (rain_probability_pct BETWEEN 0 AND 100),
  weather_code text CHECK (weather_code IN ('sunny','cloudy','partly_cloudy','rain_light','rain_heavy','storm')),
  source text NOT NULL DEFAULT 'bom',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, forecast_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weather_forecasts TO authenticated;
GRANT ALL ON public.weather_forecasts TO service_role;
ALTER TABLE public.weather_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wf_read_auth" ON public.weather_forecasts FOR SELECT TO authenticated USING (true);
CREATE POLICY "wf_admin_write" ON public.weather_forecasts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7) crew_members.employment_type default
UPDATE public.crew_members SET employment_type='employee' WHERE employment_type IS NULL;
ALTER TABLE public.crew_members ALTER COLUMN employment_type SET DEFAULT 'employee';
