DROP POLICY "Org owners insert org roles" ON public.user_roles;
CREATE POLICY "Org owners insert org roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  is_org_owner(organization_id)
  AND (role <> ALL (ARRAY['admin'::app_role, 'ceo'::app_role, 'coo'::app_role]))
);

DROP POLICY "Org owners update org roles" ON public.user_roles;
CREATE POLICY "Org owners update org roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  is_org_owner(organization_id)
  AND (role <> ALL (ARRAY['admin'::app_role, 'ceo'::app_role, 'coo'::app_role]))
)
WITH CHECK (
  is_org_owner(organization_id)
  AND (role <> ALL (ARRAY['admin'::app_role, 'ceo'::app_role, 'coo'::app_role]))
);