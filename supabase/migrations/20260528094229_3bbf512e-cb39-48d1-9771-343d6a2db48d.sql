-- Drop anon policies on public tables
DROP POLICY IF EXISTS anon_select_boq_lines ON public.boq_lines;
DROP POLICY IF EXISTS anon_select_classifications ON public.classifications;
DROP POLICY IF EXISTS anon_select_crew_members ON public.crew_members;
DROP POLICY IF EXISTS anon_select_daily_prompts_sent ON public.daily_prompts_sent;
DROP POLICY IF EXISTS anon_select_daily_reports ON public.daily_reports;
DROP POLICY IF EXISTS anon_select_equipment_catalogue ON public.equipment_catalogue;
DROP POLICY IF EXISTS anon_insert_equipment_catalogue ON public.equipment_catalogue;
DROP POLICY IF EXISTS anon_update_equipment_catalogue ON public.equipment_catalogue;
DROP POLICY IF EXISTS anon_delete_equipment_catalogue ON public.equipment_catalogue;
DROP POLICY IF EXISTS anon_select_photos ON public.photos;
DROP POLICY IF EXISTS anon_select_pits ON public.pits;
DROP POLICY IF EXISTS anon_select_plant_hire_periods ON public.plant_hire_periods;
DROP POLICY IF EXISTS anon_select_plant_hire_rate_card ON public.plant_hire_rate_card;
DROP POLICY IF EXISTS anon_select_plant_items ON public.plant_items;
DROP POLICY IF EXISTS anon_all_procure_email_log ON public.procure_email_log;
DROP POLICY IF EXISTS anon_all_procure_quotes ON public.procure_quotes;
DROP POLICY IF EXISTS anon_select_projects ON public.projects;
DROP POLICY IF EXISTS anon_select_rate_card_variations ON public.rate_card_variations;
DROP POLICY IF EXISTS anon_select_separable_portions ON public.separable_portions;
DROP POLICY IF EXISTS anon_select_supervisors ON public.supervisors;
DROP POLICY IF EXISTS anon_select_suppliers ON public.suppliers;
DROP POLICY IF EXISTS anon_insert_suppliers ON public.suppliers;
DROP POLICY IF EXISTS anon_update_suppliers ON public.suppliers;
DROP POLICY IF EXISTS anon_delete_suppliers ON public.suppliers;
DROP POLICY IF EXISTS anon_select_variation_clauses ON public.variation_clauses;
DROP POLICY IF EXISTS anon_select_variation_flags ON public.variation_flags;
DROP POLICY IF EXISTS anon_select_variation_triggers ON public.variation_triggers;

-- Revoke anon SELECT grants so PostgREST cannot expose these tables to anon
REVOKE SELECT ON public.boq_lines, public.classifications, public.crew_members,
  public.daily_prompts_sent, public.daily_reports, public.equipment_catalogue,
  public.photos, public.pits, public.plant_hire_periods, public.plant_hire_rate_card,
  public.plant_items, public.procure_email_log, public.procure_quotes,
  public.projects, public.rate_card_variations, public.separable_portions,
  public.supervisors, public.suppliers, public.variation_clauses,
  public.variation_flags, public.variation_triggers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.equipment_catalogue, public.suppliers,
  public.procure_email_log, public.procure_quotes FROM anon;

-- Make prestart-evidence bucket private and replace public policies
UPDATE storage.buckets SET public = false WHERE id = 'prestart-evidence';
DROP POLICY IF EXISTS "prestart-evidence public read" ON storage.objects;
DROP POLICY IF EXISTS "prestart-evidence auth write" ON storage.objects;
DROP POLICY IF EXISTS "prestart-evidence auth update" ON storage.objects;

CREATE POLICY "prestart_evidence_auth_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'prestart-evidence');
CREATE POLICY "prestart_evidence_auth_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'prestart-evidence');
CREATE POLICY "prestart_evidence_auth_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'prestart-evidence')
  WITH CHECK (bucket_id = 'prestart-evidence');

-- Remove anon access to procure-quotes storage bucket
DROP POLICY IF EXISTS procure_quotes_anon_select ON storage.objects;
DROP POLICY IF EXISTS procure_quotes_anon_insert ON storage.objects;
DROP POLICY IF EXISTS procure_quotes_anon_update ON storage.objects;
DROP POLICY IF EXISTS procure_quotes_anon_delete ON storage.objects;
