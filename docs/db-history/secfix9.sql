-- Archived from edge function run-migration-secfix9 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

DROP POLICY IF EXISTS users_read_profiles ON public.profiles;

CREATE POLICY users_read_own_profile ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- Hardening dei grant: nessun accesso alla colonna email dalla Data API,
-- nessuna scrittura anonima.
REVOKE ALL ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name, avatar_url, created_at) ON public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

COMMIT;

