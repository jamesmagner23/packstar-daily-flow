
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text IN ('admin','supervisor')); $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'admin'); $$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- crew_members
DROP POLICY IF EXISTS auth_select_crew_members ON public.crew_members;
DROP POLICY IF EXISTS auth_insert_crew_members ON public.crew_members;
DROP POLICY IF EXISTS auth_update_crew_members ON public.crew_members;
DROP POLICY IF EXISTS auth_delete_crew_members ON public.crew_members;
DROP POLICY IF EXISTS crew_read_crew_members ON public.crew_members;
CREATE POLICY crew_members_select ON public.crew_members FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor() OR id = public.current_user_person_id());
CREATE POLICY crew_members_write ON public.crew_members FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor()) WITH CHECK (public.is_admin_or_supervisor());

-- daily_reports
DROP POLICY IF EXISTS auth_select_daily_reports ON public.daily_reports;
DROP POLICY IF EXISTS auth_insert_daily_reports ON public.daily_reports;
DROP POLICY IF EXISTS auth_update_daily_reports ON public.daily_reports;
DROP POLICY IF EXISTS auth_delete_daily_reports ON public.daily_reports;
CREATE POLICY daily_reports_select ON public.daily_reports FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor());
CREATE POLICY daily_reports_write ON public.daily_reports FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor()) WITH CHECK (public.is_admin_or_supervisor());

-- rate cards / classifications / boq_lines -> admin only writes
DROP POLICY IF EXISTS auth_insert_plant_hire_rate_card ON public.plant_hire_rate_card;
DROP POLICY IF EXISTS auth_update_plant_hire_rate_card ON public.plant_hire_rate_card;
DROP POLICY IF EXISTS auth_delete_plant_hire_rate_card ON public.plant_hire_rate_card;
CREATE POLICY plant_hire_rate_card_write ON public.plant_hire_rate_card FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS auth_insert_classifications ON public.classifications;
DROP POLICY IF EXISTS auth_update_classifications ON public.classifications;
DROP POLICY IF EXISTS auth_delete_classifications ON public.classifications;
CREATE POLICY classifications_write ON public.classifications FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS auth_insert_rate_card_variations ON public.rate_card_variations;
DROP POLICY IF EXISTS auth_update_rate_card_variations ON public.rate_card_variations;
DROP POLICY IF EXISTS auth_delete_rate_card_variations ON public.rate_card_variations;
CREATE POLICY rate_card_variations_write ON public.rate_card_variations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS auth_insert_boq_lines ON public.boq_lines;
DROP POLICY IF EXISTS auth_update_boq_lines ON public.boq_lines;
DROP POLICY IF EXISTS auth_delete_boq_lines ON public.boq_lines;
CREATE POLICY boq_lines_write ON public.boq_lines FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- procure tables -> admin/supervisor only
DROP POLICY IF EXISTS auth_all_procure_quotes ON public.procure_quotes;
CREATE POLICY procure_quotes_admin ON public.procure_quotes FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor()) WITH CHECK (public.is_admin_or_supervisor());

DROP POLICY IF EXISTS auth_all_procure_email_log ON public.procure_email_log;
CREATE POLICY procure_email_log_admin ON public.procure_email_log FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor()) WITH CHECK (public.is_admin_or_supervisor());

-- projects writes admin-only
DROP POLICY IF EXISTS auth_insert_projects ON public.projects;
DROP POLICY IF EXISTS auth_update_projects ON public.projects;
DROP POLICY IF EXISTS auth_delete_projects ON public.projects;
CREATE POLICY projects_write_admin ON public.projects FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- supervisors writes admin-only
DROP POLICY IF EXISTS auth_insert_supervisors ON public.supervisors;
DROP POLICY IF EXISTS auth_update_supervisors ON public.supervisors;
DROP POLICY IF EXISTS auth_delete_supervisors ON public.supervisors;
CREATE POLICY supervisors_write_admin ON public.supervisors FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- variation_*
DROP POLICY IF EXISTS auth_insert_variation_flags ON public.variation_flags;
DROP POLICY IF EXISTS auth_update_variation_flags ON public.variation_flags;
DROP POLICY IF EXISTS auth_delete_variation_flags ON public.variation_flags;
CREATE POLICY variation_flags_write ON public.variation_flags FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor()) WITH CHECK (public.is_admin_or_supervisor());

DROP POLICY IF EXISTS auth_insert_variation_clauses ON public.variation_clauses;
DROP POLICY IF EXISTS auth_update_variation_clauses ON public.variation_clauses;
DROP POLICY IF EXISTS auth_delete_variation_clauses ON public.variation_clauses;
CREATE POLICY variation_clauses_write ON public.variation_clauses FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor()) WITH CHECK (public.is_admin_or_supervisor());

DROP POLICY IF EXISTS auth_insert_variation_triggers ON public.variation_triggers;
DROP POLICY IF EXISTS auth_update_variation_triggers ON public.variation_triggers;
DROP POLICY IF EXISTS auth_delete_variation_triggers ON public.variation_triggers;
CREATE POLICY variation_triggers_write ON public.variation_triggers FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor()) WITH CHECK (public.is_admin_or_supervisor());

-- Storage prestart-evidence
DROP POLICY IF EXISTS prestart_evidence_auth_select ON storage.objects;
DROP POLICY IF EXISTS prestart_evidence_auth_insert ON storage.objects;
DROP POLICY IF EXISTS prestart_evidence_auth_update ON storage.objects;
CREATE POLICY prestart_evidence_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'prestart-evidence' AND (public.is_admin_or_supervisor() OR (storage.foldername(name))[1] = public.current_user_person_id()::text));
CREATE POLICY prestart_evidence_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'prestart-evidence' AND (public.is_admin_or_supervisor() OR (storage.foldername(name))[1] = public.current_user_person_id()::text));
CREATE POLICY prestart_evidence_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'prestart-evidence' AND (public.is_admin_or_supervisor() OR (storage.foldername(name))[1] = public.current_user_person_id()::text))
  WITH CHECK (bucket_id = 'prestart-evidence' AND (public.is_admin_or_supervisor() OR (storage.foldername(name))[1] = public.current_user_person_id()::text));
CREATE POLICY prestart_evidence_delete_admin ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'prestart-evidence' AND public.is_admin_or_supervisor());

-- Lock down SECURITY DEFINER funcs that should only be called server-side
REVOKE EXECUTE ON FUNCTION public.check_eligibility(uuid, uuid, text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_supervisor_slack_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_docket(date, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
