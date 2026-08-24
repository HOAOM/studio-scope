DROP FUNCTION IF EXISTS public.directory_profiles(uuid[]);

CREATE OR REPLACE FUNCTION public.directory_profiles(p_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(id uuid, display_name text, avatar_url text, email text, phone text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.display_name, p.avatar_url,
    CASE
      WHEN p.id = auth.uid()
        OR public.is_platform_admin()
        OR EXISTS (
             SELECT 1 FROM public.organization_members a
             JOIN public.organization_members b ON a.organization_id = b.organization_id
             WHERE a.user_id = auth.uid()
               AND (a.is_owner OR public.is_org_admin(a.organization_id))
               AND b.user_id = p.id)
      THEN p.email ELSE NULL
    END AS email,
    p.phone AS phone
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND (p_ids IS NULL OR p.id = ANY(p_ids))
    AND (
      p.id = auth.uid()
      OR public.is_platform_admin()
      OR EXISTS (
           SELECT 1 FROM public.organization_members a
           JOIN public.organization_members b ON a.organization_id = b.organization_id
           WHERE a.user_id = auth.uid() AND b.user_id = p.id)
    )
$function$;

REVOKE EXECUTE ON FUNCTION public.directory_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.directory_profiles(uuid[]) TO authenticated;