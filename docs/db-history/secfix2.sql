-- Archived from edge function run-migration-secfix2 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- 1) Fixed search_path on email-queue helpers (all calls are schema-qualified)
ALTER FUNCTION public.enqueue_email(text, jsonb)                     SET search_path = '';
ALTER FUNCTION public.read_email_batch(text, integer, integer)       SET search_path = '';
ALTER FUNCTION public.delete_email(text, bigint)                     SET search_path = '';
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)         SET search_path = '';

-- 2) Internal-only queue/cron functions: service_role only
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake()                       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)               TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint)               TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch()                   TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_wake()                       TO service_role;

-- 3) Signed-in-only helpers must not be callable by anonymous visitors
REVOKE EXECUTE ON FUNCTION public.get_my_organizations()        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_in_my_org(uuid)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_org_owner(uuid)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_organizations()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_in_my_org(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_org_owner(uuid)  TO authenticated;

COMMIT;

