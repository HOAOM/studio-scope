CREATE OR REPLACE FUNCTION public.can_manage_member(_actor uuid, _target uuid, _org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _actor IS NOT NULL AND _target IS NOT NULL AND _org IS NOT NULL
    AND (auth.uid() IS NULL OR _actor = auth.uid() OR public.is_platform_admin())
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
$$;

REVOKE ALL ON FUNCTION public.is_team_lead_of(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_direct_manager_of(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_lead_of(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_direct_manager_of(uuid, uuid, uuid) TO service_role;