
CREATE TABLE public.site_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('pit','pipe','pavement','endwall')),
  code text NOT NULL,
  -- local site-grid coordinates in metres (centered at 0,0)
  x_m numeric NOT NULL DEFAULT 0,
  y_m numeric NOT NULL DEFAULT 0,
  z_m numeric NOT NULL DEFAULT 0,
  -- pit-specific
  depth_m numeric,
  cover_size_mm text,
  -- pipe-specific
  diameter_mm integer,
  from_code text,
  to_code text,
  length_m numeric,
  -- status
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','installed')),
  installed_at timestamptz,
  installed_by uuid,
  source_report_id uuid REFERENCES public.daily_reports(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_assets TO authenticated;
GRANT ALL ON public.site_assets TO service_role;

ALTER TABLE public.site_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read site_assets"
  ON public.site_assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/engineer manage site_assets"
  ON public.site_assets FOR ALL TO authenticated
  USING (public.is_admin_or_engineer())
  WITH CHECK (public.is_admin_or_engineer());

CREATE POLICY "Supervisors can update status"
  ON public.site_assets FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor())
  WITH CHECK (public.is_admin_or_supervisor());

CREATE TRIGGER set_site_assets_updated_at
  BEFORE UPDATE ON public.site_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX site_assets_project_idx ON public.site_assets(project_id);
CREATE INDEX site_assets_status_idx ON public.site_assets(project_id, status);
