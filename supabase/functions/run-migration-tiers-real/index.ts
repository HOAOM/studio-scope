/**
 * run-migration-tiers-real — allinea i piani ai nomi/limiti realmente venduti
 * (Basic / Advanced / Pro) e restringe la lettura del registro domini email.
 *
 * Idempotente. Gate: header x-migration-token.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key, x-migration-token",
};

const TOKEN = "mig-tiers-real-2026-08-18-7f3a1c";

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- 1. Rinomina i valori dell'enum sui nomi commerciali reali
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'subscription_tier' AND e.enumlabel = 'business') THEN
    ALTER TYPE public.subscription_tier RENAME VALUE 'pro' TO 'advanced';
    ALTER TYPE public.subscription_tier RENAME VALUE 'business' TO 'pro';
    ALTER TYPE public.subscription_tier RENAME VALUE 'starter' TO 'basic';
  END IF;
END
$do$;

-- 2. Nuove colonne di configurazione + numeri reali
ALTER TABLE public.tier_limits
  ADD COLUMN IF NOT EXISTS max_users_per_role integer,
  ADD COLUMN IF NOT EXISTS max_addons integer;

UPDATE public.tier_limits SET
  max_seats = NULL, max_active_projects = 10, max_boq_items_per_project = NULL,
  max_storage_bytes = 5::bigint * 1024 * 1024 * 1024,
  max_users_per_role = 1, max_addons = 1, updated_at = now()
WHERE tier = 'basic';

UPDATE public.tier_limits SET
  max_seats = NULL, max_active_projects = 30, max_boq_items_per_project = NULL,
  max_storage_bytes = 20::bigint * 1024 * 1024 * 1024,
  max_users_per_role = 5, max_addons = 3, updated_at = now()
WHERE tier = 'advanced';

UPDATE public.tier_limits SET
  max_seats = NULL, max_active_projects = NULL, max_boq_items_per_project = NULL,
  max_storage_bytes = NULL, max_users_per_role = NULL, max_addons = NULL, updated_at = now()
WHERE tier = 'pro';

-- 3. Funzioni legacy allineate
CREATE OR REPLACE FUNCTION public.tier_project_limit(t public.subscription_tier)
RETURNS integer LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE t WHEN 'basic' THEN 10 WHEN 'advanced' THEN 30 WHEN 'pro' THEN 2147483647 END
$fn$;

CREATE OR REPLACE FUNCTION public.tier_storage_limit_bytes(t public.subscription_tier)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE t
    WHEN 'basic'    THEN  5::bigint * 1024 * 1024 * 1024
    WHEN 'advanced' THEN 20::bigint * 1024 * 1024 * 1024
    WHEN 'pro'      THEN 9223372036854775807::bigint END
$fn$;

CREATE OR REPLACE FUNCTION public.tier_storage_limit_gb(t public.subscription_tier)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE t WHEN 'basic' THEN 5::numeric WHEN 'advanced' THEN 20::numeric WHEN 'pro' THEN NULL END
$fn$;

CREATE OR REPLACE FUNCTION public.get_org_effective_tier(_org_id uuid)
RETURNS public.subscription_tier
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT COALESCE(
    (SELECT s.tier FROM public.organization_subscriptions s
      WHERE s.organization_id = _org_id
        AND s.status IN ('active','grace')
        AND (s.grace_until IS NULL OR s.grace_until > now())
      LIMIT 1),
    'basic'::public.subscription_tier)
$fn$;

-- 4. Limite "utenti per ruolo"
CREATE OR REPLACE FUNCTION public.org_role_user_count(p_org uuid, p_role public.app_role)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT count(DISTINCT ur.user_id)::int FROM public.user_roles ur
  WHERE ur.organization_id = p_org AND ur.role = p_role
$fn$;

CREATE OR REPLACE FUNCTION public.enforce_org_role_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_limit integer; v_used integer; v_tier public.subscription_tier;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  IF public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;
  -- il titolare dell'organizzazione ha sempre diritto ai propri ruoli
  IF EXISTS (SELECT 1 FROM public.organization_members m
             WHERE m.organization_id = NEW.organization_id
               AND m.user_id = NEW.user_id AND m.is_owner) THEN
    RETURN NEW;
  END IF;

  SELECT max_users_per_role INTO v_limit FROM public.get_tier_limits(NEW.organization_id);
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles ur
             WHERE ur.organization_id = NEW.organization_id
               AND ur.role = NEW.role AND ur.user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  v_tier := public.get_org_effective_tier(NEW.organization_id);
  v_used := public.org_role_user_count(NEW.organization_id, NEW.role);
  IF v_used >= v_limit THEN
    RAISE EXCEPTION
      'Limite utenti per ruolo raggiunto per il piano % (% / % utenti con ruolo %). Serve un upgrade di piano.',
      v_tier, v_used, v_limit, NEW.role
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_role_limit ON public.user_roles;
CREATE TRIGGER trg_role_limit
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_org_role_limit();

REVOKE ALL ON FUNCTION public.org_role_user_count(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_org_role_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_role_user_count(uuid, public.app_role) TO authenticated, service_role;

-- 5. Riepilogo limiti/uso con i nuovi campi
DROP FUNCTION IF EXISTS public.my_org_limits_usage(uuid);
CREATE FUNCTION public.my_org_limits_usage(p_org uuid DEFAULT NULL)
RETURNS TABLE (
  organization_id uuid, tier public.subscription_tier,
  seats_used integer, max_seats integer,
  projects_used integer, max_active_projects integer,
  storage_used_bytes bigint, max_storage_bytes bigint,
  max_boq_items_per_project integer,
  max_users_per_role integer, max_addons integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  WITH org AS (
    SELECT COALESCE(p_org,
      (SELECT m.organization_id FROM public.organization_members m
        WHERE m.user_id = auth.uid() ORDER BY m.joined_at ASC LIMIT 1)) AS id
  )
  SELECT org.id, public.get_org_effective_tier(org.id),
    public.org_seat_count(org.id), l.max_seats,
    public.get_org_active_project_count(org.id), l.max_active_projects,
    public.org_storage_bytes(org.id), l.max_storage_bytes,
    l.max_boq_items_per_project, l.max_users_per_role, l.max_addons
  FROM org
  LEFT JOIN LATERAL public.get_tier_limits(org.id) l ON true
  WHERE org.id IS NOT NULL
    AND (public.is_org_member(org.id) OR public.is_platform_admin(auth.uid()))
$fn$;

REVOKE ALL ON FUNCTION public.my_org_limits_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_org_limits_usage(uuid) TO authenticated, service_role;

-- 6. Registro domini email: solo admin/owner dell'organizzazione
DROP POLICY IF EXISTS "Org members view domain audit" ON public.organization_domain_audit;
DROP POLICY IF EXISTS "Org admins view domain audit" ON public.organization_domain_audit;
CREATE POLICY "Org admins view domain audit" ON public.organization_domain_audit
  FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin(auth.uid()));

COMMIT;
`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("x-migration-token");
  const siteKey = req.headers.get("x-site-api-key");
  const ok = token === TOKEN || (siteKey && siteKey === Deno.env.get("SITE_API_KEY"));
  if (!ok) return json({ error: "forbidden" }, 403);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    const rows = await sql`SELECT * FROM public.tier_limits ORDER BY tier`;
    return json({ ok: true, tier_limits: rows });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
