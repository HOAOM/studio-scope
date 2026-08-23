-- Archived from edge function run-migration-security-fix (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- 1) Revoke EXECUTE from authenticated/anon/public on SECURITY DEFINER helpers
--    that are only used internally (RLS helpers / triggers). Functions still
--    invoked via .rpc() by the app keep their EXECUTE grant.
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'get_org_active_project_count(uuid)',
    'get_org_effective_tier(uuid)',
    'get_org_role_labels(uuid)',
    'get_org_subscription_status(uuid)',
    'get_role_label(uuid, public.app_role)',
    'get_user_org()',
    'is_item_project_owner(uuid)',
    'is_org_member(uuid)',
    'is_org_owner(uuid)',
    'is_project_member(uuid)',
    'is_project_owner(uuid)',
    'org_active_project_count(uuid)',
    'org_can_activate_project(uuid)',
    'org_reopen_count_this_month(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- 2) Re-scope presentations policies from public role to authenticated
DROP POLICY IF EXISTS "Users can create presentations for their projects" ON public.presentations;
DROP POLICY IF EXISTS "Users can delete presentations from their projects" ON public.presentations;
DROP POLICY IF EXISTS "Users can update presentations of their projects" ON public.presentations;
DROP POLICY IF EXISTS "Users can view presentations of their projects" ON public.presentations;

CREATE POLICY "Users can view presentations of their projects"
  ON public.presentations FOR SELECT TO authenticated
  USING (public.is_project_owner(project_id));

CREATE POLICY "Users can create presentations for their projects"
  ON public.presentations FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id));

CREATE POLICY "Users can update presentations of their projects"
  ON public.presentations FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id))
  WITH CHECK (public.is_project_owner(project_id));

CREATE POLICY "Users can delete presentations from their projects"
  ON public.presentations FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id));

COMMIT;

