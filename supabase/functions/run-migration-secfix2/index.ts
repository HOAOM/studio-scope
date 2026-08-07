/**
 * run-migration-secfix2 — Security linter fixes.
 * - Sets a fixed search_path on the email-queue helper functions.
 * - Revokes EXECUTE on SECURITY DEFINER functions from anon/PUBLIC.
 * - Revokes EXECUTE from authenticated on internal-only email-queue functions.
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

-- 1) Fixed search_path on email-queue helpers (all calls are schema-qualified)
ALTER FUNCTION public.enqueue_email(text, jsonb)                     SET search_path = '';
ALTER FUNCTION public.read_email_batch(text, integer, integer)       SET search_path = '';
ALTER FUNCTION public.delete_email(text, bigint)                     SET search_path = '';
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)         SET search_path = '';

-- 2) Internal-only queue/cron functions: service_role only
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake()                       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)               TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint)               TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch()                   TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_wake()                       TO service_role;

-- 3) Signed-in-only helpers must not be callable by anonymous visitors
REVOKE EXECUTE ON FUNCTION public.get_my_organizations()        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_in_my_org(uuid)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_project_org_owner(uuid)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_organizations()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_in_my_org(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_org_owner(uuid)  TO authenticated;

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
    return json({ ok: true, message: "Security linter migration applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
