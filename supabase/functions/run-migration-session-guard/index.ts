/**
 * run-migration-session-guard — anti credential-sharing infrastructure.
 *
 *  1) public.user_login_sessions   — login log (ts, ip, city/country, user agent)
 *  2) public.security_flags        — suspicious pattern flags (review_needed)
 *  3) public.organization_domain_audit — orgs with mixed email domains
 *  4) public.register_login(...)   — single-session enforcement + pattern detection
 *  5) public.org_primary_email_domain(uuid) / public.record_invite_domain(uuid, text)
 *
 * Idempotent. Requires x-site-api-key.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- 1) Login/session log -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_login_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  session_id   text,
  ip           text,
  city         text,
  country      text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  revoke_reason text
);
CREATE INDEX IF NOT EXISTS idx_uls_user_created ON public.user_login_sessions (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_uls_user_session ON public.user_login_sessions (user_id, session_id)
  WHERE session_id IS NOT NULL;

GRANT SELECT ON public.user_login_sessions TO authenticated;
GRANT ALL    ON public.user_login_sessions TO service_role;
ALTER TABLE public.user_login_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own login sessions" ON public.user_login_sessions;
CREATE POLICY "Users view own login sessions" ON public.user_login_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) Suspicious pattern flags -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_flags (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  organization_id uuid,
  flag_type      text NOT NULL,               -- 'credential_sharing'
  triggers       text[] NOT NULL DEFAULT '{}',-- 'multi_location' | 'multi_device'
  details        jsonb  NOT NULL DEFAULT '{}'::jsonb,
  review_needed  boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid
);
CREATE INDEX IF NOT EXISTS idx_secflags_user ON public.security_flags (user_id, created_at DESC);

GRANT SELECT ON public.security_flags TO authenticated;
GRANT ALL    ON public.security_flags TO service_role;
ALTER TABLE public.security_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view security flags" ON public.security_flags;
CREATE POLICY "Admins view security flags" ON public.security_flags
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Organization email-domain audit ----------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_domain_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  primary_domain  text,
  foreign_domain  text NOT NULL,
  email           text NOT NULL,
  source          text NOT NULL DEFAULT 'invite',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);
CREATE INDEX IF NOT EXISTS idx_orgdomaudit_org ON public.organization_domain_audit (organization_id);

GRANT SELECT ON public.organization_domain_audit TO authenticated;
GRANT ALL    ON public.organization_domain_audit TO service_role;
ALTER TABLE public.organization_domain_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view domain audit" ON public.organization_domain_audit;
CREATE POLICY "Org members view domain audit" ON public.organization_domain_audit
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) register_login ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_login(
  p_session_id text,
  p_ip         text DEFAULT NULL,
  p_city       text DEFAULT NULL,
  p_country    text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
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

  -- another live session for the same user?
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
        ip = COALESCE(EXCLUDED.ip, public.user_login_sessions.ip),
        city = COALESCE(EXCLUDED.city, public.user_login_sessions.city),
        country = COALESCE(EXCLUDED.country, public.user_login_sessions.country),
        user_agent = COALESCE(EXCLUDED.user_agent, public.user_login_sessions.user_agent);

  -- 7-day suspicious pattern detection
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

  -- single session policy: any concurrency kills every session, new one included
  IF v_conflict THEN
    UPDATE public.user_login_sessions
       SET revoked_at = now(), revoke_reason = 'concurrent_login'
     WHERE user_id = v_uid AND revoked_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'revoke_all', v_conflict,
    'triggers', to_jsonb(v_triggers)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.register_login(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_login(text, text, text, text, text) TO authenticated, service_role;

-- mark sessions revoked on explicit sign-out
CREATE OR REPLACE FUNCTION public.close_login_sessions(p_reason text DEFAULT 'signed_out')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $fn$
  UPDATE public.user_login_sessions
     SET revoked_at = now(), revoke_reason = p_reason
   WHERE user_id = auth.uid() AND revoked_at IS NULL;
$fn$;
REVOKE ALL ON FUNCTION public.close_login_sessions(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_login_sessions(text) TO authenticated, service_role;

-- 5) Organization email domain helpers --------------------------------------
CREATE OR REPLACE FUNCTION public.org_primary_email_domain(p_org uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT lower(split_part(p.email, '@', 2))
  FROM public.organization_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.organization_id = p_org
    AND p.email IS NOT NULL
    AND (public.is_org_member(p_org) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ORDER BY m.is_owner DESC, m.joined_at ASC
  LIMIT 1
$fn$;
REVOKE ALL ON FUNCTION public.org_primary_email_domain(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_primary_email_domain(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_invite_domain(p_org uuid, p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_primary text;
  v_domain  text := lower(split_part(p_email, '@', 2));
BEGIN
  IF NOT (public.is_org_member(p_org) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_primary := public.org_primary_email_domain(p_org);
  IF v_primary IS NULL OR v_domain = '' OR v_domain = v_primary THEN
    RETURN jsonb_build_object('mismatch', false, 'primary_domain', v_primary);
  END IF;

  INSERT INTO public.organization_domain_audit (organization_id, primary_domain, foreign_domain, email)
  VALUES (p_org, v_primary, v_domain, lower(p_email))
  ON CONFLICT (organization_id, email) DO NOTHING;

  RETURN jsonb_build_object('mismatch', true, 'primary_domain', v_primary, 'domain', v_domain);
END;
$fn$;
REVOKE ALL ON FUNCTION public.record_invite_domain(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invite_domain(uuid, text) TO authenticated, service_role;

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
    return json({ ok: true, message: "session-guard applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
