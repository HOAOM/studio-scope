DROP POLICY IF EXISTS "Project docs read" ON storage.objects;
CREATE POLICY "Project docs read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-docs' AND (public.item_file_project_access(name) OR public.is_platform_admin()));

DROP POLICY IF EXISTS "Project docs upload" ON storage.objects;
CREATE POLICY "Project docs upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-docs' AND public.item_file_project_access(name));

DROP POLICY IF EXISTS "Project docs remove" ON storage.objects;
CREATE POLICY "Project docs remove" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'project-docs' AND (owner = auth.uid() OR public.is_platform_admin()));