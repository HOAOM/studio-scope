-- Archived from edge function run-migration-secfix6 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

CREATE OR REPLACE FUNCTION public.directory_profiles(p_ids uuid[] DEFAULT NULL)
RETURNS TABLE (id uuid, display_name text, avatar_url text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    CASE
      WHEN p.id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR EXISTS (
             SELECT 1
             FROM public.organization_members a
             JOIN public.organization_members b ON a.organization_id = b.organization_id
             WHERE a.user_id = auth.uid() AND a.is_owner AND b.user_id = p.id
           )
      THEN p.email
      ELSE NULL
    END AS email
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND (p_ids IS NULL OR p.id = ANY(p_ids))
    AND (
      p.id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
           SELECT 1
           FROM public.organization_members a
           JOIN public.organization_members b ON a.organization_id = b.organization_id
           WHERE a.user_id = auth.uid() AND b.user_id = p.id
         )
    )
$fn$;

REVOKE ALL ON FUNCTION public.directory_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.directory_profiles(uuid[]) TO authenticated, service_role;

-- niente più SELECT su profiles.email per gli utenti autenticati
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, display_name, avatar_url, created_at) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

COMMIT;

