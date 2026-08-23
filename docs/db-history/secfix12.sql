-- Archived from edge function run-migration-secfix12 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

ALTER FUNCTION public.tier_project_limit(public.subscription_tier) SET search_path = public;
ALTER FUNCTION public.tier_storage_limit_bytes(public.subscription_tier) SET search_path = public;
ALTER FUNCTION public.tier_storage_limit_gb(public.subscription_tier) SET search_path = public;

ALTER TABLE public.audit_log ALTER COLUMN user_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS users_insert_own_audit ON public.audit_log;
CREATE POLICY users_insert_own_audit ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND entity_type = 'item'
    AND EXISTS (
      SELECT 1 FROM public.project_items pi
      WHERE pi.id = audit_log.entity_id
        AND (public.is_project_member(pi.project_id) OR public.is_project_in_my_org(pi.project_id))
    )
  );

DROP POLICY IF EXISTS authenticated_insert_notifications ON public.notifications;
DROP POLICY IF EXISTS users_insert_project_notifications ON public.notifications;
CREATE POLICY users_insert_project_notifications ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    type IN ('mention', 'status_change')
    AND project_id IS NOT NULL
    AND public.is_project_member(project_id)
    AND EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = notifications.project_id
        AND pm.user_id = notifications.user_id
    )
    AND length(title) <= 200
    AND (body IS NULL OR length(body) <= 1000)
  );

COMMIT;

