/**
 * run-migration-block4 — Super-Admin RPCs & helpers.
 * Idempotent. Callable only by app_role='admin'.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- 1) Admin: list every organization with owner, tier, usage
CREATE OR REPLACE FUNCTION public.admin_list_all_orgs()
RETURNS TABLE(
  organization_id uuid,
  name text,
  slug text,
  created_at timestamptz,
  owner_email text,
  owner_user_id uuid,
  tier text,
  status text,
  current_period_end timestamptz,
  active_projects int,
  project_limit int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    o.id,
    o.name,
    o.slug,
    o.created_at,
    p.email,
    p.id,
    COALESCE(public.get_org_effective_tier(o.id)::text, 'starter'),
    COALESCE(s.status::text, 'suspended'),
    s.current_period_end,
    public.get_org_active_project_count(o.id),
    public.tier_project_limit(public.get_org_effective_tier(o.id))
  FROM public.organizations o
  LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
  LEFT JOIN LATERAL (
    SELECT m.user_id FROM public.organization_members m
    WHERE m.organization_id = o.id AND m.is_owner = true
    ORDER BY m.joined_at ASC LIMIT 1
  ) ow ON true
  LEFT JOIN public.profiles p ON p.id = ow.user_id
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY o.created_at DESC;
$$;

-- 2) Admin: change tier (upserts subscription row)
CREATE OR REPLACE FUNCTION public.admin_set_org_tier(p_org uuid, p_tier text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.organization_subscriptions (organization_id, tier, status, current_period_end)
  VALUES (p_org, p_tier::public.subscription_tier, 'active'::public.subscription_status, now() + interval '1 year')
  ON CONFLICT (organization_id) DO UPDATE
    SET tier = EXCLUDED.tier, updated_at = now();
END;
$$;

-- 3) Admin: change status
CREATE OR REPLACE FUNCTION public.admin_set_org_status(p_org uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.organization_subscriptions
     SET status = p_status::public.subscription_status, updated_at = now()
   WHERE organization_id = p_org;
END;
$$;

-- 4) Admin: global metrics
CREATE OR REPLACE FUNCTION public.admin_global_metrics()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_orgs', (SELECT count(*) FROM public.organizations),
    'orgs_by_tier', (
      SELECT jsonb_object_agg(tier, c) FROM (
        SELECT COALESCE(s.tier::text,'starter') AS tier, count(*) c
        FROM public.organizations o
        LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
        GROUP BY 1
      ) x
    ),
    'orgs_by_status', (
      SELECT jsonb_object_agg(status, c) FROM (
        SELECT COALESCE(s.status::text,'suspended') AS status, count(*) c
        FROM public.organizations o
        LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
        GROUP BY 1
      ) x
    ),
    'new_orgs_30d', (
      SELECT count(*) FROM public.organizations WHERE created_at > now() - interval '30 days'
    ),
    'total_projects', (SELECT count(*) FROM public.projects WHERE archived_at IS NULL),
    'top_orgs', (
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT o.name, count(p.id) AS active_projects
        FROM public.organizations o
        LEFT JOIN public.projects p ON p.organization_id = o.id AND p.archived_at IS NULL
        GROUP BY o.id, o.name
        ORDER BY count(p.id) DESC
        LIMIT 5
      ) t
    )
  )
  WHERE public.has_role(auth.uid(), 'admin'::app_role);
$$;

-- 5) Admin: get an org by id (used by impersonate banner)
CREATE OR REPLACE FUNCTION public.admin_get_org(p_org uuid)
RETURNS TABLE(id uuid, name text, slug text, tier text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.slug,
         COALESCE(public.get_org_effective_tier(o.id)::text, 'starter'),
         COALESCE(s.status::text, 'suspended')
  FROM public.organizations o
  LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
  WHERE o.id = p_org
    AND public.has_role(auth.uid(), 'admin'::app_role);
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_all_orgs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_org_tier(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_org_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_global_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_org(uuid) TO authenticated;

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
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "forbidden: admin only" }, 403);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    const fns = await sql`
      SELECT proname FROM pg_proc
      WHERE proname IN ('admin_list_all_orgs','admin_set_org_tier','admin_set_org_status','admin_global_metrics','admin_get_org')
      ORDER BY proname`;
    return json({ ok: true, functions: fns });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
