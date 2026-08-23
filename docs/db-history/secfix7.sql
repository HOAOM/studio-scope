-- Archived from edge function run-migration-secfix7 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;
REVOKE EXECUTE ON FUNCTION public.peek_org_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.peek_org_invite(text) TO authenticated, service_role;
COMMIT;

