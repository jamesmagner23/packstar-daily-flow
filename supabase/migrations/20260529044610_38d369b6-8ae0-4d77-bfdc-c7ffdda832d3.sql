-- Piling labour-hire project type: schema foundation

-- 1. Project type flag
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type text NOT NULL DEFAULT 'drainage',
  ADD COLUMN IF NOT EXISTS pile_schedule_url text;

-- 2. Pile schedule (one row per pile)
CREATE TABLE public.pile_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  pile_ref text NOT NULL,
  sheet_ref text,
  diameter_mm integer,
  design_depth_m numeric,
  design_volume_m3 numeric,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, pile_ref)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pile_schedule TO authenticated;
GRANT ALL ON public.pile_schedule TO service_role;
ALTER TABLE public.pile_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_all_pile_schedule ON public.pile_schedule
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Pile events (drilled / poured / cage set)
CREATE TABLE public.pile_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  pile_id uuid NOT NULL REFERENCES public.pile_schedule(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  event_type text NOT NULL, -- 'drilled' | 'poured' | 'cage_set'
  person_id uuid,
  daily_report_id uuid,
  volume_m3 numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pile_events_pile ON public.pile_events(pile_id);
CREATE INDEX idx_pile_events_project_date ON public.pile_events(project_id, event_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pile_events TO authenticated;
GRANT ALL ON public.pile_events TO service_role;
ALTER TABLE public.pile_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_all_pile_events ON public.pile_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Concrete dockets
CREATE TABLE public.concrete_dockets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  pile_id uuid REFERENCES public.pile_schedule(id) ON DELETE SET NULL,
  event_date date NOT NULL,
  volume_m3 numeric,
  supplier text,
  docket_number text,
  photo_url text,
  daily_report_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_concrete_dockets_project_date ON public.concrete_dockets(project_id, event_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concrete_dockets TO authenticated;
GRANT ALL ON public.concrete_dockets TO service_role;
ALTER TABLE public.concrete_dockets ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_all_concrete_dockets ON public.concrete_dockets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Cage deliveries
CREATE TABLE public.cage_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  delivery_date date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  photo_urls text[] NOT NULL DEFAULT '{}',
  notes text,
  daily_report_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cage_deliveries_project_date ON public.cage_deliveries(project_id, delivery_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cage_deliveries TO authenticated;
GRANT ALL ON public.cage_deliveries TO service_role;
ALTER TABLE public.cage_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_all_cage_deliveries ON public.cage_deliveries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Labour-hire rate schedule (what the client pays us)
CREATE TABLE public.labour_hire_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  classification_id uuid, -- nullable for ute / other
  kind text NOT NULL DEFAULT 'labour', -- 'labour' | 'ute' | 'other'
  description text,
  nt_rate numeric,
  ot_rate numeric,
  day_rate numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_labour_hire_rates_project ON public.labour_hire_rates(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labour_hire_rates TO authenticated;
GRANT ALL ON public.labour_hire_rates TO service_role;
ALTER TABLE public.labour_hire_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_all_labour_hire_rates ON public.labour_hire_rates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. Updated-at triggers
CREATE TRIGGER update_pile_schedule_updated_at
  BEFORE UPDATE ON public.pile_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('pile-schedules', 'pile-schedules', false),
  ('concrete-dockets', 'concrete-dockets', false),
  ('cage-photos', 'cage-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth read pile-schedules" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pile-schedules');
CREATE POLICY "auth write pile-schedules" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pile-schedules');
CREATE POLICY "auth update pile-schedules" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pile-schedules');

CREATE POLICY "auth read concrete-dockets" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'concrete-dockets');
CREATE POLICY "auth write concrete-dockets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'concrete-dockets');

CREATE POLICY "auth read cage-photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cage-photos');
CREATE POLICY "auth write cage-photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cage-photos');