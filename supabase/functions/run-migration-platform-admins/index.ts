/**
 * run-migration-platform-admins — fondamenta del livello super-admin di piattaforma.
 *
 * Crea:
 *  - public.platform_admins (grade: staff | owner) — completamente separata
 *    dall'enum app_role usato dai clienti. Nessun GRANT ad anon/authenticated:
 *    l'unico accesso passa dalle RPC platform_* (SECURITY DEFINER) che
 *    verificano l'appartenenza. Un admin cliente riceve 42501 esplicito.
 *  - public.platform_impersonation_log — tracciamento impersonazioni,
 *    leggibile solo dagli owner di piattaforma.
 *  - helper is_platform_admin() / is_platform_owner()
 *  - RPC: platform_admin_list, platform_admin_set_grade, platform_admin_revoke,
 *         platform_impersonation_start, platform_impersonation_end,
 *         platform_impersonation_log_list
 *
 * NON tocca admin_*, app_role 'admin', tier o enforcement. Idempotente.
 * Richiede x-site-api-key.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

DO $$ BEGIN
  CREATE TYPE public.platform_admin_grade AS ENUM ('staff','owner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  grade public.platform_admin_grade NOT NULL DEFAULT 'staff',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  actor_grade public.platform_admin_grade NOT NULL,
  target_user_id uuid,
  target_organization_id uuid NOT NULL,
  reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_imp_log_actor ON public.platform_impersonation_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_imp_log_org   ON public.platform_impersonation_log(target_organization_id);

-- Nessun accesso Data API diretto: solo service_role. I client passano dalle RPC.
REVOKE ALL ON public.platform_admins            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_impersonation_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_admins            TO service_role;
GRANT ALL ON public.platform_impersonation_log TO service_role;

ALTER TABLE public.platform_admins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_impersonation_log ENABLE ROW LEVEL SECURITY;

-- Helper (SECURITY DEFINER: leggono la tabella bypassando i GRANT)
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id)
$fn$;

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = _user_id AND grade = 'owner'::public.platform_admin_grade
  )
$fn$;

-- RLS: lettura ai soli platform admin, scrittura ai soli platform owner.
DROP POLICY IF EXISTS "platform admins can read roster" ON public.platform_admins;
CREATE POLICY "platform admins can read roster" ON public.platform_admins
  FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform owners manage roster" ON public.platform_admins;
CREATE POLICY "platform owners manage roster" ON public.platform_admins
  FOR ALL TO authenticated
  USING (public.is_platform_owner())
  WITH CHECK (public.is_platform_owner());

DROP POLICY IF EXISTS "platform owners read impersonation log" ON public.platform_impersonation_log;
CREATE POLICY "platform owners read impersonation log" ON public.platform_impersonation_log
  FOR SELECT TO authenticated USING (public.is_platform_owner());

-- ---------- RPC roster ----------
CREATE OR REPLACE FUNCTION public.platform_admin_list()
RETURNS TABLE(user_id uuid, email text, display_name text, grade text,
              notes text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden: platform admin access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT pa.user_id, p.email, p.display_name, pa.grade::text, pa.notes, pa.created_at
    FROM public.platform_admins pa
    LEFT JOIN public.profiles p ON p.id = pa.user_id
    ORDER BY pa.created_at;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_admin_set_grade(p_email text, p_grade text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'forbidden: platform owner access required' USING ERRCODE = '42501';
  END IF;
  IF p_grade NOT IN ('staff','owner') THEN
    RAISE EXCEPTION 'invalid grade %', p_grade USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(p_email);
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;
  INSERT INTO public.platform_admins (user_id, grade, created_by)
  VALUES (v_uid, p_grade::public.platform_admin_grade, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET grade = EXCLUDED.grade, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'user_id', v_uid, 'grade', p_grade);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_admin_revoke(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid;
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'forbidden: platform owner access required' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(p_email);
  IF v_uid = auth.uid() THEN
    RAISE EXCEPTION 'cannot revoke your own platform access' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.platform_admins WHERE user_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END;
$fn$;

-- ---------- RPC impersonazione ----------
CREATE OR REPLACE FUNCTION public.platform_impersonation_start(
  p_organization_id uuid, p_target_user_id uuid DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_id uuid; v_grade public.platform_admin_grade;
BEGIN
  SELECT grade INTO v_grade FROM public.platform_admins WHERE user_id = auth.uid();
  IF v_grade IS NULL THEN
    RAISE EXCEPTION 'forbidden: platform admin access required to impersonate'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.platform_impersonation_log
    (actor_user_id, actor_grade, target_user_id, target_organization_id, reason)
  VALUES (auth.uid(), v_grade, p_target_user_id, p_organization_id, p_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_impersonation_end(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden: platform admin access required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.platform_impersonation_log
     SET ended_at = now()
   WHERE id = p_session_id AND actor_user_id = auth.uid() AND ended_at IS NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_impersonation_log_list(p_limit int DEFAULT 200)
RETURNS TABLE(id uuid, actor_user_id uuid, actor_email text, actor_grade text,
              target_user_id uuid, target_email text, target_organization_id uuid,
              organization_name text, reason text,
              started_at timestamptz, ended_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'forbidden: platform owner access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT l.id, l.actor_user_id, pa.email, l.actor_grade::text,
           l.target_user_id, pt.email, l.target_organization_id, o.name,
           l.reason, l.started_at, l.ended_at
    FROM public.platform_impersonation_log l
    LEFT JOIN public.profiles pa ON pa.id = l.actor_user_id
    LEFT JOIN public.profiles pt ON pt.id = l.target_user_id
    LEFT JOIN public.organizations o ON o.id = l.target_organization_id
    ORDER BY l.started_at DESC
    LIMIT p_limit;
END;
$fn$;

-- EXECUTE: mai ad anon.
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_owner(uuid)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_admin_list()                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_admin_set_grade(text, text)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_admin_revoke(text)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_impersonation_start(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_impersonation_end(uuid)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_impersonation_log_list(int)          FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_admin_list()                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_admin_set_grade(text, text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_admin_revoke(text)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_impersonation_start(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_impersonation_end(uuid)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_impersonation_log_list(int)          TO authenticated, service_role;

-- Primo owner di piattaforma
INSERT INTO public.platform_admins (user_id, grade, notes)
SELECT id, 'owner'::public.platform_admin_grade, 'bootstrap platform owner'
FROM auth.users WHERE lower(email) = 'hoaoperation@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET grade = 'owner'::public.platform_admin_grade;

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

  const key = req.headers.get("x-site-api-key");
  if (!key || key !== Deno.env.get("SITE_API_KEY")) {
    return json({ error: "forbidden" }, 403);
  }

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    const roster = await sql`
      SELECT pa.grade, u.email
      FROM public.platform_admins pa JOIN auth.users u ON u.id = pa.user_id`;
    const grants = await sql`
      SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_name = 'platform_admins'`;
    return json({ ok: true, roster, grants });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
