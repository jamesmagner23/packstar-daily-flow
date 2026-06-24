
-- ===== 1. classifications: hide internal cost rates from crew =====
DROP POLICY IF EXISTS crew_read_classifications ON public.classifications;
DROP POLICY IF EXISTS auth_select_classifications ON public.classifications;
CREATE POLICY auth_select_classifications ON public.classifications
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor());

-- ===== 2. supervisors: PII only for admin/supervisor =====
DROP POLICY IF EXISTS auth_select_supervisors ON public.supervisors;
CREATE POLICY auth_select_supervisors ON public.supervisors
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor());

-- ===== 3. daily_prompts_sent: admin/supervisor only =====
DROP POLICY IF EXISTS auth_select_daily_prompts_sent ON public.daily_prompts_sent;
CREATE POLICY auth_select_daily_prompts_sent ON public.daily_prompts_sent
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor());

-- ===== 4. cage_deliveries: split ALL → SELECT all auth, writes admin/supervisor =====
DROP POLICY IF EXISTS auth_all_cage_deliveries ON public.cage_deliveries;
CREATE POLICY cage_deliveries_select ON public.cage_deliveries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY cage_deliveries_write ON public.cage_deliveries
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor())
  WITH CHECK (public.is_admin_or_supervisor());

-- ===== 5. concrete_dockets =====
DROP POLICY IF EXISTS auth_all_concrete_dockets ON public.concrete_dockets;
CREATE POLICY concrete_dockets_select ON public.concrete_dockets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY concrete_dockets_write ON public.concrete_dockets
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor())
  WITH CHECK (public.is_admin_or_supervisor());

-- ===== 6. pile_events =====
DROP POLICY IF EXISTS auth_all_pile_events ON public.pile_events;
CREATE POLICY pile_events_select ON public.pile_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY pile_events_write ON public.pile_events
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor())
  WITH CHECK (public.is_admin_or_supervisor());

-- ===== 7. pile_schedule: writes admin/supervisor =====
DROP POLICY IF EXISTS auth_all_pile_schedule ON public.pile_schedule;
CREATE POLICY pile_schedule_select ON public.pile_schedule
  FOR SELECT TO authenticated USING (true);
CREATE POLICY pile_schedule_write ON public.pile_schedule
  FOR ALL TO authenticated
  USING (public.is_admin_or_supervisor())
  WITH CHECK (public.is_admin_or_supervisor());

-- ===== 8. equipment_catalogue: writes admin/supervisor =====
DROP POLICY IF EXISTS auth_insert_equipment_catalogue ON public.equipment_catalogue;
DROP POLICY IF EXISTS auth_update_equipment_catalogue ON public.equipment_catalogue;
DROP POLICY IF EXISTS auth_delete_equipment_catalogue ON public.equipment_catalogue;
CREATE POLICY equipment_catalogue_insert ON public.equipment_catalogue
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor());
CREATE POLICY equipment_catalogue_update ON public.equipment_catalogue
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor())
  WITH CHECK (public.is_admin_or_supervisor());
CREATE POLICY equipment_catalogue_delete ON public.equipment_catalogue
  FOR DELETE TO authenticated USING (public.is_admin_or_supervisor());

-- ===== 9. pits: writes admin/supervisor =====
DROP POLICY IF EXISTS auth_insert_pits ON public.pits;
DROP POLICY IF EXISTS auth_update_pits ON public.pits;
DROP POLICY IF EXISTS auth_delete_pits ON public.pits;
CREATE POLICY pits_insert ON public.pits
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_supervisor());
CREATE POLICY pits_update ON public.pits
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor())
  WITH CHECK (public.is_admin_or_supervisor());
CREATE POLICY pits_delete ON public.pits
  FOR DELETE TO authenticated USING (public.is_admin_or_supervisor());

-- ===== 10. labour_hire_rates: writes admin only; reads admin/supervisor =====
DROP POLICY IF EXISTS auth_all_labour_hire_rates ON public.labour_hire_rates;
CREATE POLICY labour_hire_rates_select ON public.labour_hire_rates
  FOR SELECT TO authenticated USING (public.is_admin_or_supervisor());
CREATE POLICY labour_hire_rates_write ON public.labour_hire_rates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ===== 11. plant_items: writes admin only =====
DROP POLICY IF EXISTS auth_insert_plant_items ON public.plant_items;
DROP POLICY IF EXISTS auth_update_plant_items ON public.plant_items;
DROP POLICY IF EXISTS auth_delete_plant_items ON public.plant_items;
CREATE POLICY plant_items_insert ON public.plant_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY plant_items_update ON public.plant_items
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY plant_items_delete ON public.plant_items
  FOR DELETE TO authenticated USING (public.is_admin());

-- ===== 12. separable_portions: writes admin only =====
DROP POLICY IF EXISTS auth_insert_separable_portions ON public.separable_portions;
DROP POLICY IF EXISTS auth_update_separable_portions ON public.separable_portions;
DROP POLICY IF EXISTS auth_delete_separable_portions ON public.separable_portions;
CREATE POLICY separable_portions_insert ON public.separable_portions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY separable_portions_update ON public.separable_portions
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY separable_portions_delete ON public.separable_portions
  FOR DELETE TO authenticated USING (public.is_admin());

-- ===== 13. storage: drop unsafe anon read on daywork-dockets bucket =====
-- Signed URLs are already used in the app; anon SELECT is unnecessary
-- and would let anyone with a path guess access daywork PDFs.
DROP POLICY IF EXISTS anon_read_daywork_dockets ON storage.objects;

-- ===== 14. Lock down EXECUTE on custom SECURITY DEFINER public functions =====
-- Remove default PUBLIC/anon EXECUTE; keep authenticated + service_role.
REVOKE EXECUTE ON FUNCTION public.check_eligibility(uuid, uuid, text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_person_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_supervisor_slack_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.insert_docket(date, uuid, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_engineer() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_supervisor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_daywork_reference(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trigger_allocation_eligibility_check() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_timesheets(date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.check_eligibility(uuid, uuid, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_person_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_supervisor_slack_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_docket(date, uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_engineer() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_supervisor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_daywork_reference(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_timesheets(date) TO authenticated, service_role;
