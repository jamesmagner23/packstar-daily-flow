
-- 1. Add 'engineer' to user_role enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'engineer';

-- 2. Helper: is admin or engineer
CREATE OR REPLACE FUNCTION public.is_admin_or_engineer()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text IN ('admin','engineer')
  );
$$;

-- 3. dayworks table
CREATE TABLE public.dayworks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  reference text NOT NULL,
  description text,
  client_contact_name text,
  client_contact_email text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_signature','signed','void')),
  signing_method text CHECK (signing_method IN ('in_app','offline')),
  signing_token text UNIQUE,
  signing_token_expires_at timestamptz,
  signed_at timestamptz,
  signed_by_name text,
  signature_image_url text,
  signed_docket_pdf_url text,
  generated_pdf_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, reference)
);
CREATE INDEX idx_dayworks_project_date ON public.dayworks(project_id, work_date DESC);
CREATE INDEX idx_dayworks_status ON public.dayworks(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dayworks TO authenticated;
GRANT ALL ON public.dayworks TO service_role;
ALTER TABLE public.dayworks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_dayworks" ON public.dayworks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_dayworks" ON public.dayworks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_dayworks" ON public.dayworks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin_engineer_delete_dayworks" ON public.dayworks
  FOR DELETE TO authenticated USING (public.is_admin_or_engineer());

-- Public read for signing portal (token-gated by app logic)
CREATE POLICY "anon_read_for_signing" ON public.dayworks
  FOR SELECT TO anon USING (signing_token IS NOT NULL AND status = 'awaiting_signature');
GRANT SELECT ON public.dayworks TO anon;

-- 4. daywork_lines table
CREATE TABLE public.daywork_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  daywork_id uuid NOT NULL REFERENCES public.dayworks(id) ON DELETE CASCADE,
  line_type text NOT NULL CHECK (line_type IN ('plant','labour','material')),
  plant_item_id uuid REFERENCES public.plant_items(id) ON DELETE SET NULL,
  plant_rate_card_id uuid REFERENCES public.plant_hire_rate_card(id) ON DELETE SET NULL,
  classification_id uuid REFERENCES public.classifications(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'hr' CHECK (unit IN ('hr','day','ea','m','m2','m3','t','L','wk')),
  client_rate_aud numeric NOT NULL DEFAULT 0,
  cost_rate_aud numeric NOT NULL DEFAULT 0,
  revenue_aud numeric GENERATED ALWAYS AS (quantity * client_rate_aud) STORED,
  cost_aud numeric GENERATED ALWAYS AS (quantity * cost_rate_aud) STORED,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_daywork_lines_daywork ON public.daywork_lines(daywork_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daywork_lines TO authenticated;
GRANT ALL ON public.daywork_lines TO service_role;
GRANT SELECT ON public.daywork_lines TO anon;
ALTER TABLE public.daywork_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_daywork_lines" ON public.daywork_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_daywork_lines_for_signing" ON public.daywork_lines
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.dayworks d
      WHERE d.id = daywork_id
        AND d.signing_token IS NOT NULL
        AND d.status = 'awaiting_signature'
    )
  );

-- 5. Updated_at trigger
CREATE TRIGGER update_dayworks_updated_at
  BEFORE UPDATE ON public.dayworks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Reference generator: DW-{project_code}-{seq}
CREATE OR REPLACE FUNCTION public.next_daywork_reference(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_seq int;
BEGIN
  SELECT code INTO v_code FROM public.projects WHERE id = p_project_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  -- Strip non-alphanumeric for cleaner refs
  v_code := upper(regexp_replace(v_code, '[^A-Za-z0-9]', '', 'g'));
  SELECT COALESCE(MAX(
    CASE WHEN reference ~ ('^DW-' || v_code || '-[0-9]+$')
         THEN (regexp_replace(reference, '^DW-' || v_code || '-', ''))::int
         ELSE 0 END
  ), 0) + 1
  INTO v_seq
  FROM public.dayworks WHERE project_id = p_project_id;
  RETURN 'DW-' || v_code || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- 7. Tighten plant_hire_rate_card writes to admin+engineer (was admin only)
DROP POLICY IF EXISTS "plant_hire_rate_card_write" ON public.plant_hire_rate_card;
CREATE POLICY "plant_hire_rate_card_write" ON public.plant_hire_rate_card
  FOR ALL TO authenticated
  USING (public.is_admin_or_engineer())
  WITH CHECK (public.is_admin_or_engineer());
