-- Archived from edge function run-migration-secfix14 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin_in_shared_org(_target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members them
      ON them.organization_id = me.organization_id
     AND them.user_id = _target
    JOIN public.user_roles r
      ON r.organization_id = me.organization_id
     AND r.user_id = me.user_id
     AND r.role = 'admin'::app_role
    WHERE me.user_id = auth.uid()
  )
$fn$;

REVOKE ALL ON FUNCTION public.is_admin_in_shared_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_in_shared_org(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "members_update_suppliers" ON public.suppliers;
CREATE POLICY "members_update_suppliers" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_platform_admin()
    OR (created_by IS NOT NULL AND public.is_admin_in_shared_org(created_by))
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.is_platform_admin()
    OR (created_by IS NOT NULL AND public.is_admin_in_shared_org(created_by))
  );

DROP POLICY IF EXISTS "admin_delete_suppliers" ON public.suppliers;
CREATE POLICY "admin_delete_suppliers" ON public.suppliers
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_platform_admin()
    OR (created_by IS NOT NULL AND public.is_admin_in_shared_org(created_by))
  );

DROP POLICY IF EXISTS "authors_delete_supplier_comments" ON public.supplier_comments;
CREATE POLICY "authors_delete_supplier_comments" ON public.supplier_comments
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.is_platform_admin()
    OR (author_id IS NOT NULL AND public.is_admin_in_shared_org(author_id))
  );

DROP POLICY IF EXISTS "Users view own login sessions" ON public.user_login_sessions;
CREATE POLICY "Users view own login sessions" ON public.user_login_sessions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin()
    OR public.is_admin_in_shared_org(user_id)
  );

REVOKE EXECUTE ON FUNCTION public.org_storage_bytes(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.project_boq_item_count(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.org_role_user_count(uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.org_primary_email_domain(uuid) FROM authenticated;

COMMIT;

