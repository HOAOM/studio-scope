/**
 * run-migration-phase7
 *
 * Storage limits per subscription tier:
 *   - Starter:  2 GB
 *   - Pro:     10 GB
 *   - Business: unlimited (NULL)
 *
 * Adds:
 *   - public.tier_storage_limit_gb(t subscription_tier) RETURNS numeric  (NULL = unlimited)
 *   - public.tier_storage_limit_bytes(t subscription_tier) RETURNS bigint (NULL = unlimited)
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

CREATE OR REPLACE FUNCTION public.tier_storage_limit_gb(t public.subscription_tier)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'starter'  THEN 2::numeric
    WHEN 'pro'      THEN 10::numeric
    WHEN 'business' THEN NULL    -- unlimited
  END
$$;

CREATE OR REPLACE FUNCTION public.tier_storage_limit_bytes(t public.subscription_tier)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'starter'  THEN (2  * 1024 * 1024 * 1024)::bigint
    WHEN 'pro'      THEN (10 * 1024 * 1024 * 1024)::bigint
    WHEN 'business' THEN NULL
  END
$$;

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
      SELECT t,
             public.tier_storage_limit_gb(t)   AS limit_gb,
             public.tier_storage_limit_bytes(t) AS limit_bytes
        FROM unnest(ARRAY['starter','pro','business']::public.subscription_tier[]) AS t`;
    return json({ ok: true, phase: 7, message: "Phase 7 migration complete", limits: checks });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
