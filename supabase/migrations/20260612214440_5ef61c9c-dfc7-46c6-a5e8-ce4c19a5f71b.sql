
CREATE POLICY "auth_read_daywork_dockets" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'daywork-dockets');
CREATE POLICY "auth_write_daywork_dockets" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'daywork-dockets');
CREATE POLICY "auth_update_daywork_dockets" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'daywork-dockets');
CREATE POLICY "auth_delete_daywork_dockets" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'daywork-dockets');
CREATE POLICY "anon_read_daywork_dockets" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'daywork-dockets');
