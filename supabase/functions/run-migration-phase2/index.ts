/**
 * run-migration-phase2
 *
 * One-shot, idempotent migrator for Phase 2 — Subscription lifecycle ("semaforo").
 *
 * Creates:
 *   - enum subscription_tier   (starter | pro | business)
 *   - enum subscription_status (active | grace | suspended | purge_pending | purged)
 *   - table organization_subscriptions (1:1 with organizations)
 *   - function get_org_subscription_status(p_org uuid)
 *   - function tick_subscription_lifecycle()  -- advances states based on dates
 *   - RLS: members read own org, admin manages all
 *   - updated_at trigger
 *
 * Backfill:
 *   - "Studio Scope" → business / active, period_end = now() + 10 years
 *
 * Safe to re-run. Wrapped in a single transaction.
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

-- 1. enums -------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.subscription_tier AS ENUM ('starter', 'pro', 'business');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM
    ('active', 'grace', 'suspended', 'purge_pending', 'purged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. organization_subscriptions ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL UNIQUE
                          REFERENCES public.organizations(id) ON DELETE CASCADE,
  tier                 public.subscription_tier   NOT NULL DEFAULT 'starter',
  status               public.subscription_status NOT NULL DEFAULT 'active',
  current_period_end   timestamptz NOT NULL,
  grace_until          timestamptz,
  suspend_at           timestamptz,
  purge_at             timestamptz,
  stripe_customer_id   text,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_subs_org    ON public.organization_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_subs_status ON public.organization_subscriptions(status);
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. helper: status getter ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_org_subscription_status(p_org uuid)
RETURNS public.subscription_status
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status FROM public.organization_subscriptions
  WHERE organization_id = p_org
$$;

-- 4. lifecycle tick ----------------------------------------------------------
-- Grace window / purge window per tier (in days)
-- starter:  15d grace, 30d purge   |  pro: 30d grace, 60d purge  |  business: 90d grace, 180d purge
CREATE OR REPLACE FUNCTION public.tick_subscription_lifecycle()
RETURNS TABLE(org_id uuid, old_status public.subscription_status, new_status public.subscription_status)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  grace_days int;
  purge_days int;
  v_old public.subscription_status;
  v_new public.subscription_status;
BEGIN
  FOR r IN SELECT * FROM public.organization_subscriptions LOOP
    grace_days := CASE r.tier WHEN 'starter' THEN 15 WHEN 'pro' THEN 30 ELSE 90 END;
    purge_days := CASE r.tier WHEN 'starter' THEN 30 WHEN 'pro' THEN 60 ELSE 180 END;
    v_old := r.status;
    v_new := r.status;

    -- active -> grace when period expires
    IF v_new = 'active' AND r.current_period_end < now() THEN
      v_new := 'grace';
    END IF;

    -- grace -> suspended after grace window
    IF v_new = 'grace'
       AND r.current_period_end + (grace_days || ' days')::interval < now() THEN
      v_new := 'suspended';
    END IF;

    -- suspended -> purge_pending after purge window (data still recoverable)
    IF v_new = 'suspended'
       AND r.current_period_end + (purge_days || ' days')::interval < now() THEN
      v_new := 'purge_pending';
    END IF;

    IF v_new <> v_old THEN
      UPDATE public.organization_subscriptions
         SET status      = v_new,
             grace_until = CASE WHEN v_new = 'grace'
                                THEN r.current_period_end + (grace_days || ' days')::interval
                                ELSE grace_until END,
             suspend_at  = CASE WHEN v_new = 'suspended' THEN now() ELSE suspend_at END,
             purge_at    = CASE WHEN v_new = 'purge_pending' THEN now() ELSE purge_at END,
             updated_at  = now()
       WHERE id = r.id;

      org_id := r.organization_id; old_status := v_old; new_status := v_new;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- 5. RLS policies ------------------------------------------------------------
DROP POLICY IF EXISTS "members view their subscription" ON public.organization_subscriptions;
DROP POLICY IF EXISTS "admin manages subscriptions"     ON public.organization_subscriptions;

CREATE POLICY "members view their subscription" ON public.organization_subscriptions
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin manages subscriptions" ON public.organization_subscriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. updated_at trigger ------------------------------------------------------
DROP TRIGGER IF EXISTS trg_org_subs_updated_at ON public.organization_subscriptions;
CREATE TRIGGER trg_org_subs_updated_at
  BEFORE UPDATE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Backfill default subscription for Studio Scope --------------------------
INSERT INTO public.organization_subscriptions (organization_id, tier, status, current_period_end)
SELECT id, 'business', 'active', now() + interval '10 years'
FROM public.organizations
WHERE slug = 'studio-scope'
ON CONFLICT (organization_id) DO NOTHING;

COMMIT;
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) return json({ error: "Unauthenticated" }, 401);

    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json({ error: "Admin role required" }, 403);

    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) return json({ error: "SUPABASE_DB_URL not configured" }, 500);

    const sql = postgres(dbUrl, { max: 1, prepare: false });
    try {
      await sql.unsafe(MIGRATION_SQL);

      const subs = await sql`
        SELECT o.slug, s.tier, s.status, s.current_period_end
        FROM public.organization_subscriptions s
        JOIN public.organizations o ON o.id = s.organization_id
        ORDER BY o.slug
      `;

      return json({ ok: true, phase: 2, subscriptions: subs });
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (err) {
    console.error("[run-migration-phase2]", err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
