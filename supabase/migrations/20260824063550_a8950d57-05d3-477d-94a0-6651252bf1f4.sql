BEGIN;

CREATE OR REPLACE FUNCTION public.can_see_commercials()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','ceo','coo','project_manager','procurement_manager','accountant','qs','head_of_payments')
  )
$fn$;
REVOKE ALL   ON FUNCTION public.can_see_commercials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_commercials() TO authenticated, service_role;

DROP POLICY IF EXISTS members_view_quotations ON public.item_quotations;
CREATE POLICY members_view_quotations ON public.item_quotations
  FOR SELECT TO authenticated
  USING (
    public.is_item_project_owner(project_item_id)
    OR (
      public.can_see_commercials()
      AND EXISTS (
        SELECT 1 FROM public.project_items pi
        JOIN public.project_members pm ON pm.project_id = pi.project_id
        WHERE pi.id = item_quotations.project_item_id
          AND pm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS members_view_revisions ON public.item_revisions;
CREATE POLICY members_view_revisions ON public.item_revisions
  FOR SELECT TO authenticated
  USING (
    public.is_item_project_owner(item_id)
    OR (
      public.can_see_commercials()
      AND EXISTS (
        SELECT 1 FROM public.project_items pi
        JOIN public.project_members pm ON pm.project_id = pi.project_id
        WHERE pi.id = item_revisions.item_id
          AND pm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS members_view_item_messages ON public.item_messages;
CREATE POLICY members_view_item_messages ON public.item_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_items pi
      WHERE pi.id = item_messages.project_item_id
        AND (
          public.is_project_member(pi.project_id)
          OR public.is_project_owner(pi.project_id)
          OR public.is_project_in_my_org(pi.project_id)
        )
    )
  );

DROP POLICY IF EXISTS members_insert_item_messages ON public.item_messages;
CREATE POLICY members_insert_item_messages ON public.item_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_items pi
      WHERE pi.id = item_messages.project_item_id
        AND (
          public.is_project_member(pi.project_id)
          OR public.is_project_owner(pi.project_id)
          OR public.is_project_in_my_org(pi.project_id)
        )
    )
  );

COMMIT;