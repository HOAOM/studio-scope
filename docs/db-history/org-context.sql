-- Archived from edge function run-migration-org-context (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- 1) owner => org-scoped admin role -----------------------------------------
CREATE OR REPLACE FUNCTION public.grant_owner_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_owner THEN
    INSERT INTO public.user_roles (user_id, role, organization_id)
    VALUES (NEW.user_id, 'admin'::public.app_role, NEW.organization_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.grant_owner_admin_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_grant_owner_admin_role ON public.organization_members;
CREATE TRIGGER trg_grant_owner_admin_role
AFTER INSERT OR UPDATE OF is_owner ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.grant_owner_admin_role();

INSERT INTO public.user_roles (user_id, role, organization_id)
SELECT m.user_id, 'admin'::public.app_role, m.organization_id
FROM public.organization_members m
WHERE m.is_owner
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = m.user_id
      AND r.organization_id = m.organization_id
      AND r.role = 'admin'::public.app_role
  )
ON CONFLICT DO NOTHING;

-- 2) custom domain ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_org_custom_domain(p_org uuid, p_domain text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_domain text;
BEGIN
  IF NOT (public.is_platform_admin() OR public.is_org_owner(p_org)) THEN
    RAISE EXCEPTION 'forbidden: organization owner or platform admin required'
      USING ERRCODE = '42501';
  END IF;

  v_domain := btrim(lower(coalesce(p_domain, '')));
  v_domain := regexp_replace(v_domain, '^https?://', '');
  v_domain := regexp_replace(v_domain, '/.*$', '');
  v_domain := nullif(v_domain, '');

  IF v_domain IS NOT NULL THEN
    IF v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN
      RAISE EXCEPTION 'invalid_domain: %', v_domain USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.organizations
      WHERE lower(custom_domain) = v_domain AND id <> p_org
    ) THEN
      RAISE EXCEPTION 'domain_already_assigned: %', v_domain USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.organizations
     SET custom_domain = v_domain, updated_at = now()
   WHERE id = p_org;

  RETURN v_domain;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_org_custom_domain(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_org_custom_domain(uuid, text) TO authenticated;

-- 3) impersonation context --------------------------------------------------
CREATE OR REPLACE FUNCTION public.impersonating_org()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT l.target_organization_id
  FROM public.platform_impersonation_log l
  WHERE l.actor_user_id = auth.uid()
    AND l.ended_at IS NULL
    AND l.started_at > now() - interval '12 hours'
    AND public.is_platform_admin(auth.uid())
  ORDER BY l.started_at DESC
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.impersonating_org() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.impersonating_org() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_org IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_org AND user_id = auth.uid()
    )
    OR p_org = public.impersonating_org()
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_project_in_my_org(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND (
        EXISTS (
          SELECT 1 FROM public.organization_members m
          WHERE m.organization_id = p.organization_id AND m.user_id = auth.uid()
        )
        OR p.organization_id = public.impersonating_org()
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE(organization_id uuid, name text, slug text, is_owner boolean, tier text, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT o.id, o.name, o.slug, m.is_owner,
         COALESCE(public.get_org_effective_tier(o.id)::text, 'starter'),
         COALESCE(s.status::text, 'suspended')
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
  WHERE m.user_id = auth.uid()
  UNION
  SELECT o.id, o.name, o.slug, false,
         COALESCE(public.get_org_effective_tier(o.id)::text, 'starter'),
         COALESCE(s.status::text, 'suspended')
  FROM public.organizations o
  LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
  WHERE o.id = public.impersonating_org()
$function$;

CREATE OR REPLACE FUNCTION public.platform_impersonation_end_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden: platform admin access required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.platform_impersonation_log
     SET ended_at = now()
   WHERE actor_user_id = auth.uid() AND ended_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_impersonation_end_all() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_impersonation_end_all() TO authenticated;

COMMIT;

