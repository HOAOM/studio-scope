-- 1) can_manage_member: rimuove il bypass quando auth.uid() è NULL
CREATE OR REPLACE FUNCTION public.can_manage_member(_actor uuid, _target uuid, _org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _actor IS NOT NULL AND _target IS NOT NULL AND _org IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (_actor = auth.uid() OR public.is_platform_admin())
    AND (
      EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = _org AND om.user_id = _actor AND om.is_owner
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = _actor AND ur.organization_id = _org
          AND ur.role = 'admin'::public.app_role
      )
      OR public.is_direct_manager_of(_actor, _target, _org)
      OR public.is_team_lead_of(_actor, _target, _org)
    )
$function$;

-- 2) item-files: policy UPDATE esplicita, con lo stesso perimetro di ownership/progetto
DROP POLICY IF EXISTS "Authenticated update own item files" ON storage.objects;
CREATE POLICY "Authenticated update own item files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'item-files'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.item_file_project_access(name)
      OR public.is_platform_admin(auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'item-files'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.item_file_project_access(name)
      OR public.is_platform_admin(auth.uid())
    )
  );