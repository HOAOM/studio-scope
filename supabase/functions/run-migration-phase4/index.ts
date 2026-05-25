/**
 * run-migration-phase4
 *
 * Idempotent migrator — Phase 4: Project archive + per-tier active limits.
 *
 * Adds:
 *   - projects.archived_at (nullable timestamptz)  → NULL = active, set = archived
 *   - projects.archived_by (nullable uuid)
 *   - project_reopen_log (id, project_id, org_id, reopened_by, reopened_at)
 *     → tracks unarchive events for anti-abuse rate-limit
 *   - helper fn tier_project_limit(t subscription_tier) → int
 *       starter=2, pro=8, business=2147483647 (unlimited sentinel)
 *   - helper fn org_active_project_count(p_org uuid) → int
 *   - helper fn org_can_activate_project(p_org uuid) → boolean
 *       (count(active) < tier limit)
 *   - helper fn org_reopen_count_this_month(p_org uuid) → int
 *   - trigger trg_enforce_project_archive_rules on projects
 *       BEFORE INSERT/UPDATE → if creating active OR un-archiving,
 *       enforces tier limit; on un-archive also enforces ≤2 reopens / month
 *       (admin bypasses).
 *
 * RLS: project_reopen_log readable by org members + admin.
 *
 * No data is destroyed. All existing projects remain active (archived_at NULL).
 *
 * Auth: callable only by an authenticated admin.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- 1. Schema additions on projects -------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE INDEX IF NOT EXISTS idx_projects_org_active
  ON public.projects (organization_id)
  WHERE archived_at IS NULL;

-- 2. Reopen log --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_reopen_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL,
  organization_id uuid NOT NULL,
  reopened_by   uuid,
  reopened_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reopen_log_org_time
  ON public.project_reopen_log (organization_id, reopened_at DESC);

ALTER TABLE public.project_reopen_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view reopen log" ON public.project_reopen_log;
CREATE POLICY "members view reopen log"
  ON public.project_reopen_log FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin manages reopen log" ON public.project_reopen_log;
CREATE POLICY "admin manages reopen log"
  ON public.project_reopen_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Helpers ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tier_project_limit(t public.subscription_tier)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'starter'  THEN 2
    WHEN 'pro'      THEN 8
    WHEN 'business' THEN 2147483647
  END
$$;

CREATE OR REPLACE FUNCTION public.org_active_project_count(p_org uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.projects
  WHERE organization_id = p_org AND archived_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.org_can_activate_project(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.org_active_project_count(p_org) <
    public.tier_project_limit(
      (SELECT tier FROM public.organization_subscriptions WHERE organization_id = p_org)
    )
$$;

CREATE OR REPLACE FUNCTION public.org_reopen_count_this_month(p_org uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.project_reopen_log
  WHERE organization_id = p_org
    AND reopened_at >= date_trunc('month', now())
$$;

-- 4. Enforcement trigger ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_project_archive_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin   boolean := public.has_role(auth.uid(), 'admin');
  v_unarchive  boolean := FALSE;
  v_create_act boolean := FALSE;
  v_limit      integer;
  v_count      integer;
  v_tier       public.subscription_tier;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW; -- legacy rows w/o org: skip
  END IF;

  IF TG_OP = 'INSERT' AND NEW.archived_at IS NULL THEN
    v_create_act := TRUE;
  ELSIF TG_OP = 'UPDATE'
    AND OLD.archived_at IS NOT NULL
    AND NEW.archived_at IS NULL THEN
    v_unarchive := TRUE;
  END IF;

  IF NOT (v_create_act OR v_unarchive) THEN
    RETURN NEW;
  END IF;

  IF v_is_admin THEN
    -- admin bypasses limits but reopen is still logged below
    IF v_unarchive THEN
      INSERT INTO public.project_reopen_log (project_id, organization_id, reopened_by)
      VALUES (NEW.id, NEW.organization_id, auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  SELECT tier INTO v_tier FROM public.organization_subscriptions
   WHERE organization_id = NEW.organization_id;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'organization has no subscription' USING ERRCODE = '22023';
  END IF;
  v_limit := public.tier_project_limit(v_tier);

  SELECT count(*) INTO v_count FROM public.projects
   WHERE organization_id = NEW.organization_id
     AND archived_at IS NULL
     AND id <> NEW.id;
  IF v_count + 1 > v_limit THEN
    RAISE EXCEPTION 'active project limit reached for tier % (limit %)', v_tier, v_limit
      USING ERRCODE = '22023';
  END IF;

  IF v_unarchive THEN
    IF public.org_reopen_count_this_month(NEW.organization_id) >= 2 THEN
      RAISE EXCEPTION 'reopen quota exceeded for this month (max 2)'
        USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.project_reopen_log (project_id, organization_id, reopened_by)
    VALUES (NEW.id, NEW.organization_id, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_project_archive_rules ON public.projects;
CREATE TRIGGER trg_enforce_project_archive_rules
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_project_archive_rules();

COMMIT;
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
    prepare: false,
    max: 1,
  });
  try {
    await sql.unsafe(MIGRATION_SQL);

    const stats = await sql`
      SELECT
        o.id AS org_id, o.name,
        s.tier, public.tier_project_limit(s.tier) AS limit,
        public.org_active_project_count(o.id)     AS active_count,
        (SELECT count(*) FROM public.projects p
          WHERE p.organization_id = o.id AND p.archived_at IS NOT NULL) AS archived_count
      FROM public.organizations o
      LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
      ORDER BY o.created_at
    `;

    return json({
      ok: true,
      phase: 4,
      message: "Phase 4 migration complete",
      stats,
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
