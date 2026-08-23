-- Archived from edge function run-migration-secfix12b (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_user_project_member(p_project uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project AND pm.user_id = p_user
  )
$fn$;

REVOKE ALL ON FUNCTION public.is_user_project_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_project_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS users_insert_project_notifications ON public.notifications;
CREATE POLICY users_insert_project_notifications ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    type IN ('mention', 'status_change')
    AND project_id IS NOT NULL
    AND public.is_project_member(project_id)
    AND public.is_user_project_member(project_id, user_id)
    AND length(title) <= 200
    AND (body IS NULL OR length(body) <= 1000)
  );

COMMIT;

