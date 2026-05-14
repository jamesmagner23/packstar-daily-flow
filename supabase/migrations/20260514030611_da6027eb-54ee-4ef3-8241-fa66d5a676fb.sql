
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'projects','daily_reports','variation_flags','separable_portions','boq_lines',
    'pits','crew_members','classifications','plant_items','plant_hire_rate_card',
    'supervisors','variation_clauses','variation_triggers','rate_card_variations','photos'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS anon_select_%I ON public.%I', t, t);
    EXECUTE format('CREATE POLICY anon_select_%I ON public.%I FOR SELECT TO anon USING (true)', t, t);
  END LOOP;
END $$;
