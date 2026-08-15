/**
 * run-migration-block6
 *  A) Session guard hardening: stale session rows must not kill a legit login.
 *     - register_login() now considers only sessions that are still alive in
 *       auth.sessions AND seen in the last 5 minutes.
 *     - new RPC touch_login_session() refreshes last_seen_at (heartbeat).
 *  B) Master data becomes per-organization (same pattern as company_settings):
 *     master_floors, master_rooms, master_item_types, master_subcategories,
 *     cost_categories get organization_id + org-scoped RLS + auto-seed for new orgs.
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

-- =========================================================
-- A) SESSION GUARD
-- =========================================================
CREATE OR REPLACE FUNCTION public.register_login(
  p_session_id text,
  p_ip text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid        uuid := auth.uid();
  v_conflict   boolean := false;
  v_locations  int;
  v_devices    int;
  v_triggers   text[] := '{}';
  v_org        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  -- garbage-collect rows left open by crashes / closed tabs:
  -- either no longer present in auth.sessions, or not seen for 5 minutes.
  UPDATE public.user_login_sessions s
     SET revoked_at = now(), revoke_reason = 'stale'
   WHERE s.user_id = v_uid
     AND s.revoked_at IS NULL
     AND s.session_id IS DISTINCT FROM p_session_id
     AND (
       s.last_seen_at < now() - interval '2 minutes'
       OR NOT EXISTS (
         SELECT 1 FROM auth.sessions a
          WHERE a.user_id = v_uid AND a.id::text = s.session_id
       )
     );

  -- genuine concurrency: another session still alive right now
  SELECT EXISTS (
    SELECT 1 FROM public.user_login_sessions s
    WHERE s.user_id = v_uid
      AND s.revoked_at IS NULL
      AND s.session_id IS DISTINCT FROM p_session_id
  ) INTO v_conflict;

  INSERT INTO public.user_login_sessions (user_id, session_id, ip, city, country, user_agent)
  VALUES (v_uid, p_session_id, p_ip, p_city, p_country, p_user_agent)
  ON CONFLICT (user_id, session_id) WHERE session_id IS NOT NULL DO UPDATE
    SET last_seen_at = now(),
        revoked_at = NULL,
        revoke_reason = NULL,
        ip = COALESCE(EXCLUDED.ip, public.user_login_sessions.ip),
        city = COALESCE(EXCLUDED.city, public.user_login_sessions.city),
        country = COALESCE(EXCLUDED.country, public.user_login_sessions.country),
        user_agent = COALESCE(EXCLUDED.user_agent, public.user_login_sessions.user_agent);

  SELECT
    count(DISTINCT COALESCE(NULLIF(btrim(coalesce(city,'') || '/' || coalesce(country,'')), '/'), 'unknown'))
      FILTER (WHERE city IS NOT NULL OR country IS NOT NULL),
    count(DISTINCT user_agent) FILTER (WHERE user_agent IS NOT NULL)
  INTO v_locations, v_devices
  FROM public.user_login_sessions
  WHERE user_id = v_uid AND created_at > now() - interval '7 days';

  IF COALESCE(v_locations, 0) > 2 THEN v_triggers := v_triggers || 'multi_location'; END IF;
  IF COALESCE(v_devices, 0)   > 2 THEN v_triggers := v_triggers || 'multi_device';   END IF;

  IF array_length(v_triggers, 1) > 0 THEN
    SELECT organization_id INTO v_org
    FROM public.organization_members WHERE user_id = v_uid
    ORDER BY joined_at ASC LIMIT 1;

    IF NOT EXISTS (
      SELECT 1 FROM public.security_flags f
      WHERE f.user_id = v_uid
        AND f.review_needed
        AND f.created_at > now() - interval '7 days'
        AND f.triggers @> v_triggers AND v_triggers @> f.triggers
    ) THEN
      INSERT INTO public.security_flags (user_id, organization_id, flag_type, triggers, details)
      VALUES (v_uid, v_org, 'credential_sharing', v_triggers,
              jsonb_build_object('distinct_locations_7d', v_locations,
                                 'distinct_devices_7d', v_devices));
    END IF;
  END IF;

  IF v_conflict THEN
    UPDATE public.user_login_sessions
       SET revoked_at = now(), revoke_reason = 'concurrent_login'
     WHERE user_id = v_uid AND revoked_at IS NULL;
  END IF;

  RETURN jsonb_build_object('revoke_all', v_conflict, 'triggers', to_jsonb(v_triggers));
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.register_login(text,text,text,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_login(text,text,text,text,text) TO authenticated;

-- heartbeat: keeps the row fresh and reports revocation
CREATE OR REPLACE FUNCTION public.touch_login_session(p_session_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_revoked timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN true; END IF;
  UPDATE public.user_login_sessions
     SET last_seen_at = now()
   WHERE user_id = v_uid AND session_id = p_session_id AND revoked_at IS NULL;
  SELECT revoked_at INTO v_revoked
    FROM public.user_login_sessions
   WHERE user_id = v_uid AND session_id = p_session_id;
  RETURN v_revoked IS NOT NULL;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.touch_login_session(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.touch_login_session(text) TO authenticated;

-- =========================================================
-- B) MASTER DATA PER ORGANIZATION
-- =========================================================
ALTER TABLE public.master_floors        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.master_rooms         ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.master_item_types    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.master_subcategories ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.cost_categories      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- backfill to the oldest organization (the historical owner of this data)
DO $$
DECLARE v_org uuid;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at ASC LIMIT 1;
  IF v_org IS NOT NULL THEN
    UPDATE public.master_floors        SET organization_id = v_org WHERE organization_id IS NULL;
    UPDATE public.master_rooms         SET organization_id = v_org WHERE organization_id IS NULL;
    UPDATE public.master_item_types    SET organization_id = v_org WHERE organization_id IS NULL;
    UPDATE public.master_subcategories SET organization_id = v_org WHERE organization_id IS NULL;
    UPDATE public.cost_categories      SET organization_id = v_org WHERE organization_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.master_floors        ALTER COLUMN organization_id SET DEFAULT public.get_user_org();
ALTER TABLE public.master_rooms         ALTER COLUMN organization_id SET DEFAULT public.get_user_org();
ALTER TABLE public.master_item_types    ALTER COLUMN organization_id SET DEFAULT public.get_user_org();
ALTER TABLE public.master_subcategories ALTER COLUMN organization_id SET DEFAULT public.get_user_org();
ALTER TABLE public.cost_categories      ALTER COLUMN organization_id SET DEFAULT public.get_user_org();

ALTER TABLE public.master_floors        ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.master_rooms         ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.master_item_types    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.master_subcategories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.cost_categories      ALTER COLUMN organization_id SET NOT NULL;

-- codes are unique per organization, not globally
ALTER TABLE public.master_floors        DROP CONSTRAINT IF EXISTS master_floors_code_key;
ALTER TABLE public.master_rooms         DROP CONSTRAINT IF EXISTS master_rooms_code_key;
ALTER TABLE public.master_item_types    DROP CONSTRAINT IF EXISTS master_item_types_code_key;
ALTER TABLE public.cost_categories      DROP CONSTRAINT IF EXISTS cost_categories_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS master_floors_org_code_key        ON public.master_floors (organization_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS master_rooms_org_code_key         ON public.master_rooms (organization_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS master_item_types_org_code_key    ON public.master_item_types (organization_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS cost_categories_org_code_key      ON public.cost_categories (organization_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS master_subcategories_org_code_key ON public.master_subcategories (organization_id, item_type_id, code);

-- RLS: read = org members, write = org admins (platform admins bypass via is_platform_admin)
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['master_floors','master_rooms','master_item_types','master_subcategories','cost_categories'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()))
    $f$, t||'_org_select', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (public.is_org_admin(organization_id) OR public.is_platform_admin(auth.uid()))
    $f$, t||'_org_insert', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (public.is_org_admin(organization_id) OR public.is_platform_admin(auth.uid()))
      WITH CHECK (public.is_org_admin(organization_id) OR public.is_platform_admin(auth.uid()))
    $f$, t||'_org_update', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (public.is_org_admin(organization_id) OR public.is_platform_admin(auth.uid()))
    $f$, t||'_org_delete', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- seed a brand new organization with a copy of the template (oldest org) master data
CREATE OR REPLACE FUNCTION public.seed_master_data_for_org(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_tpl uuid;
BEGIN
  SELECT id INTO v_tpl FROM public.organizations
   WHERE id <> p_org ORDER BY created_at ASC LIMIT 1;
  IF v_tpl IS NULL THEN RETURN; END IF;

  INSERT INTO public.master_floors (organization_id, name, code, sort_order)
  SELECT p_org, name, code, sort_order FROM public.master_floors WHERE organization_id = v_tpl
  ON CONFLICT DO NOTHING;

  INSERT INTO public.master_rooms (organization_id, name, code, sort_order)
  SELECT p_org, name, code, sort_order FROM public.master_rooms WHERE organization_id = v_tpl
  ON CONFLICT DO NOTHING;

  INSERT INTO public.cost_categories (organization_id, name, code, sort_order, is_active)
  SELECT p_org, name, code, sort_order, is_active FROM public.cost_categories WHERE organization_id = v_tpl
  ON CONFLICT DO NOTHING;

  INSERT INTO public.master_item_types (organization_id, name, code, sort_order, allowed_categories)
  SELECT p_org, name, code, sort_order, allowed_categories FROM public.master_item_types WHERE organization_id = v_tpl
  ON CONFLICT DO NOTHING;

  INSERT INTO public.master_subcategories (organization_id, item_type_id, name, code, sort_order)
  SELECT p_org, newt.id, s.name, s.code, s.sort_order
    FROM public.master_subcategories s
    JOIN public.master_item_types oldt ON oldt.id = s.item_type_id AND oldt.organization_id = v_tpl
    JOIN public.master_item_types newt ON newt.organization_id = p_org AND newt.code = oldt.code
   WHERE s.organization_id = v_tpl
  ON CONFLICT DO NOTHING;

  -- sottocategorie senza tipo collegato (legacy): copiate per parità col template
  INSERT INTO public.master_subcategories (organization_id, item_type_id, name, code, sort_order)
  SELECT p_org, NULL, s.name, s.code, s.sort_order
    FROM public.master_subcategories s
   WHERE s.organization_id = v_tpl AND s.item_type_id IS NULL
  ON CONFLICT DO NOTHING;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.seed_master_data_for_org(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_seed_master_data_for_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM public.seed_master_data_for_org(NEW.id);
  RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.trg_seed_master_data_for_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_seed_master_data ON public.organizations;
CREATE TRIGGER trg_seed_master_data
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.trg_seed_master_data_for_org();

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
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) return json({ error: "forbidden: platform admin only" }, 403);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    const cols = await sql`
      SELECT table_name FROM information_schema.columns
       WHERE table_schema='public' AND column_name='organization_id'
         AND table_name IN ('master_floors','master_rooms','master_item_types','master_subcategories','cost_categories')
       ORDER BY table_name`;
    return json({ ok: true, message: "block6 applied", scoped_tables: cols });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
