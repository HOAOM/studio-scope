DROP POLICY IF EXISTS "Org owners insert org roles" ON public.user_roles;
CREATE POLICY "Org owners insert org roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_owner(organization_id)
    AND role NOT IN ('admin'::public.app_role, 'ceo'::public.app_role, 'coo'::public.app_role)
    AND user_id <> auth.uid()
  );

DROP POLICY IF EXISTS "Org owners update org roles" ON public.user_roles;
CREATE POLICY "Org owners update org roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.is_org_owner(organization_id)
    AND role NOT IN ('admin'::public.app_role, 'ceo'::public.app_role, 'coo'::public.app_role)
    AND user_id <> auth.uid()
  )
  WITH CHECK (
    public.is_org_owner(organization_id)
    AND role NOT IN ('admin'::public.app_role, 'ceo'::public.app_role, 'coo'::public.app_role)
    AND user_id <> auth.uid()
  );