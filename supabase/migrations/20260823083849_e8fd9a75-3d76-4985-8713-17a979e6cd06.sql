CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_org IS NOT NULL AND (
    public.is_org_owner(p_org)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = p_org
        AND ur.role = 'admin'::public.app_role
    )
    OR p_org = public.impersonating_org()
  )
$function$;