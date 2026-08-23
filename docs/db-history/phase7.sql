-- Archived from edge function run-migration-phase7 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

CREATE OR REPLACE FUNCTION public.tier_storage_limit_gb(t public.subscription_tier)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'starter'  THEN 2::numeric
    WHEN 'pro'      THEN 10::numeric
    WHEN 'business' THEN NULL    -- unlimited
  END
$$;

CREATE OR REPLACE FUNCTION public.tier_storage_limit_bytes(t public.subscription_tier)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'starter'  THEN (2::bigint  * 1024 * 1024 * 1024)
    WHEN 'pro'      THEN (10::bigint * 1024 * 1024 * 1024)
    WHEN 'business' THEN NULL
  END
$$;

COMMIT;

