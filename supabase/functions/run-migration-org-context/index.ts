/**
 * run-migration-org-context — three linked fixes:
 *  1. every organization OWNER always holds the org-scoped 'admin' role
 *     (trigger + backfill), so studios created from the public onboarding
 *     can access their own Admin Panel. Strictly org-scoped: no cross-org
 *     escalation is possible (the role row carries the owner's own org id).
 *  2. set_org_custom_domain(): org owner or platform admin can set/clear the
 *     custom domain, validated and unique across organizations.
 *  3. real "View as": an active row in platform_impersonation_log grants the
 *     platform admin plain MEMBER-level visibility on the inspected org
 *     (no owner/admin powers), and the org shows up in get_my_organizations.
 *
 * Idempotent. Platform admin only.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIGRATION_SQL = /* sql */ `
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
`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing Authorization header" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthenticated" }, 401);
  const { data: isAdmin, error: roleErr } = await supabase.rpc("is_platform_admin");
  if (roleErr || !isAdmin) return json({ error: "forbidden: platform admin only" }, 403);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    return json({ ok: true, message: "owner admin role + custom domain rpc + real view-as" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
