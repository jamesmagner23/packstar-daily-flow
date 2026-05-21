
-- New bucket for operator pre-start photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('plant-prestart-evidence', 'plant-prestart-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Operators write to their own folder: {crew_members.id}/...
CREATE POLICY "Crew can upload own prestart evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'plant-prestart-evidence'
  AND (storage.foldername(name))[1] = current_user_person_id()::text
);

CREATE POLICY "Crew can read own prestart evidence"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'plant-prestart-evidence'
  AND (storage.foldername(name))[1] = current_user_person_id()::text
);

CREATE POLICY "Admins read all prestart evidence"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'plant-prestart-evidence'
  AND current_user_role() = 'admin'
);

CREATE POLICY "Supervisors read all prestart evidence"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'plant-prestart-evidence'
  AND current_user_role() = 'supervisor'
);

-- Crew need to read active plant_items (for asset picker + form header)
CREATE POLICY "crew_read_plant_items"
ON public.plant_items FOR SELECT TO authenticated
USING (current_user_role() = 'crew' AND COALESCE(active, true) = true);

-- Crew need to read prestart templates for assets
CREATE POLICY "crew_read_plant_prestart_templates"
ON public.plant_prestart_templates FOR SELECT TO authenticated
USING (current_user_role() = 'crew');

-- Crew insert own prestart log
CREATE POLICY "crew_insert_own_plant_prestart_logs"
ON public.plant_prestart_logs FOR INSERT TO authenticated
WITH CHECK (
  current_user_role() = 'crew'
  AND operator_person_id = current_user_person_id()
);

-- Crew need to read projects (to render job name on /today)
CREATE POLICY "crew_read_projects"
ON public.projects FOR SELECT TO authenticated
USING (current_user_role() = 'crew');

-- Crew need to read classifications (to render their classification on /today)
CREATE POLICY "crew_read_classifications"
ON public.classifications FOR SELECT TO authenticated
USING (current_user_role() = 'crew');

-- Crew need to read crew_members (their own row + supervisor name)
CREATE POLICY "crew_read_crew_members"
ON public.crew_members FOR SELECT TO authenticated
USING (current_user_role() = 'crew');
