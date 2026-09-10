DROP POLICY IF EXISTS "Members can view items of assigned projects" ON public.project_items;
DROP POLICY IF EXISTS "Users can view items of their projects" ON public.project_items;
DROP POLICY IF EXISTS "Org members can access org project items" ON public.project_items;

CREATE POLICY "Cost authorized users can read full project items"
ON public.project_items
FOR SELECT
TO authenticated
USING (public.user_can_see_project_costs(auth.uid(), project_id));

CREATE POLICY "Org members can insert org project items"
ON public.project_items
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_in_my_org(project_id) OR public.is_platform_admin());

CREATE POLICY "Org members can update org project items"
ON public.project_items
FOR UPDATE
TO authenticated
USING (public.is_project_in_my_org(project_id) OR public.is_platform_admin())
WITH CHECK (public.is_project_in_my_org(project_id) OR public.is_platform_admin());

CREATE POLICY "Org members can delete org project items"
ON public.project_items
FOR DELETE
TO authenticated
USING (public.is_project_in_my_org(project_id) OR public.is_platform_admin());

GRANT SELECT ON public.project_items TO authenticated;

ALTER VIEW public.project_items_safe SET (security_invoker = false, security_barrier = true);
REVOKE ALL ON public.project_items_safe FROM PUBLIC, anon;
GRANT SELECT ON public.project_items_safe TO authenticated, service_role;