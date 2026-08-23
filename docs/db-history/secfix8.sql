-- Archived from edge function run-migration-secfix8 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- 1) Hide the email column from the Data API (row policies stay unchanged).
REVOKE SELECT (email) ON public.profiles FROM PUBLIC, anon, authenticated;

-- 2) Internal-only role helper.
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role)
  TO service_role;

COMMIT;

