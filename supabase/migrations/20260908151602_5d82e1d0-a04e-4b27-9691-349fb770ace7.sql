-- 1) cost_visibility_overrides: il target deve essere membro della stessa org
DROP POLICY IF EXISTS "cvo write by org admin" ON public.cost_visibility_overrides;
CREATE POLICY "cvo write by org admin" ON public.cost_visibility_overrides
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_org_owner(organization_id) OR public.is_platform_admin())
  WITH CHECK (
    (public.is_org_admin(organization_id) OR public.is_org_owner(organization_id) OR public.is_platform_admin())
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = cost_visibility_overrides.organization_id
        AND om.user_id = cost_visibility_overrides.user_id
    )
  );

-- 2) item-files: valida che il primo segmento sia un progetto reale accessibile
CREATE OR REPLACE FUNCTION public.item_file_project_access(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  seg text := (storage.foldername(p_name))[1];
  pid uuid;
BEGIN
  IF seg IS NULL OR seg !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;
  pid := seg::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = pid) THEN
    RETURN false;
  END IF;
  RETURN public.is_project_member(pid)
      OR public.is_project_owner(pid)
      OR public.is_project_in_my_org(pid);
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.item_file_project_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.item_file_project_access(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated upload own item files" ON storage.objects;
CREATE POLICY "Authenticated upload own item files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'item-files'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.item_file_project_access(name)
      OR public.is_platform_admin(auth.uid())
    )
    AND storage_upload_within_limit(bucket_id, name)
  );

DROP POLICY IF EXISTS "Authenticated read item files" ON storage.objects;
CREATE POLICY "Authenticated read item files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'item-files'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.is_platform_admin(auth.uid())
      OR public.item_file_project_access(name)
    )
  );
