/**
 * run-migration-block2
 *
 * Server-side tier enforcement.
 * - tier_storage_limit_bytes (overrides phase7 so 'business' returns bigint-max instead of NULL)
 * - get_org_effective_tier(org)
 * - get_org_active_project_count(org)
 * - enforce_project_tier_limit() trigger on public.projects
 * - get_my_org_subscription_summary() RPC
 *
 * Idempotent. Admin-only.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- 1. Storage limit (bytes). Business = bigint max so JS can compare without nulls.
CREATE OR REPLACE FUNCTION public.tier_storage_limit_bytes(t public.subscription_tier)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'starter'  THEN  2::bigint * 1024 * 1024 * 1024
    WHEN 'pro'      THEN 10::bigint * 1024 * 1024 * 1024
    WHEN 'business' THEN 9223372036854775807::bigint
  END
$$;

-- 2. Effective tier (respects subscription status + grace window).
CREATE OR REPLACE FUNCTION public.get_org_effective_tier(_org_id uuid)
RETURNS public.subscription_tier
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (
      SELECT s.tier
      FROM public.organization_subscriptions s
      WHERE s.organization_id = _org_id
        AND s.status IN ('active','grace')
        AND (s.grace_until IS NULL OR s.grace_until > now())
      LIMIT 1
    ),
    'starter'::public.subscription_tier
  )
$$;

-- 3. Active project count (excludes archived).
CREATE OR REPLACE FUNCTION public.get_org_active_project_count(_org_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int
  FROM public.projects p
  WHERE p.organization_id = _org_id
    AND p.archived_at IS NULL
$$;

-- 4. Enforcement trigger on projects.
CREATE OR REPLACE FUNCTION public.enforce_project_tier_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tier  public.subscription_tier;
  v_limit integer;
  v_count integer;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_tier  := public.get_org_effective_tier(NEW.organization_id);
  v_limit := public.tier_project_limit(v_tier);
  v_count := public.get_org_active_project_count(NEW.organization_id);
  IF v_count >= v_limit THEN
    RAISE EXCEPTION
      'Project limit reached for tier % (% active / % allowed). Upgrade your plan to create more projects.',
      v_tier, v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_project_tier_limit ON public.projects;
CREATE TRIGGER trg_enforce_project_tier_limit
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_project_tier_limit();

-- 5. Per-caller subscription summary RPC.
CREATE OR REPLACE FUNCTION public.get_my_org_subscription_summary()
RETURNS TABLE (
  organization_id     uuid,
  organization_name   text,
  tier                public.subscription_tier,
  status              public.subscription_status,
  current_period_end  timestamptz,
  project_limit       integer,
  projects_used       integer,
  storage_limit_bytes bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH org AS (
    SELECT m.organization_id
    FROM public.organization_members m
    WHERE m.user_id = auth.uid()
    ORDER BY m.joined_at ASC, m.is_owner DESC
    LIMIT 1
  )
  SELECT
    o.id,
    o.name,
    public.get_org_effective_tier(o.id),
    COALESCE(s.status, 'suspended'::public.subscription_status),
    s.current_period_end,
    public.tier_project_limit(public.get_org_effective_tier(o.id)),
    public.get_org_active_project_count(o.id),
    public.tier_storage_limit_bytes(public.get_org_effective_tier(o.id))
  FROM org
  JOIN public.organizations o ON o.id = org.organization_id
  LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
$$;

GRANT EXECUTE ON FUNCTION public.get_my_org_subscription_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_effective_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_active_project_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tier_storage_limit_bytes(public.subscription_tier) TO authenticated;

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing Authorization header" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthenticated" }, 401);
  const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr || !isAdmin) return json({ error: "forbidden: admin only" }, 403);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    const checks = await sql`
      SELECT proname
      FROM pg_proc
      WHERE proname IN (
        'tier_storage_limit_bytes',
        'get_org_effective_tier',
        'get_org_active_project_count',
        'enforce_project_tier_limit',
        'get_my_org_subscription_summary'
      )
      ORDER BY proname`;
    const trig = await sql`
      SELECT tgname FROM pg_trigger
      WHERE tgname = 'trg_enforce_project_tier_limit'`;
    return json({ ok: true, functions: checks, triggers: trig });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
