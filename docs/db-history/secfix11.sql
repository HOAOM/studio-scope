-- Archived from edge function run-migration-secfix11 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;
REVOKE EXECUTE ON FUNCTION public.enforce_boq_item_limit()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_org_seat_limit()  FROM PUBLIC, anon, authenticated;
COMMIT;

