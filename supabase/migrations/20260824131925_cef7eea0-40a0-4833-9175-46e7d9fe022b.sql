CREATE OR REPLACE FUNCTION public.is_lead_of_team(_team uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = _team
      AND tm.user_id = auth.uid()
      AND tm.member_role = 'lead'::team_member_role
  )
$$;

REVOKE ALL ON FUNCTION public.is_lead_of_team(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_lead_of_team(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS team_members_write_admin ON public.team_members;

CREATE POLICY team_members_write_admin ON public.team_members
FOR ALL
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR public.is_platform_admin()
  OR (public.is_org_member(organization_id) AND public.is_lead_of_team(team_id))
)
WITH CHECK (
  public.is_org_admin(organization_id)
  OR public.is_platform_admin()
  OR (public.is_org_member(organization_id) AND public.is_lead_of_team(team_id))
);