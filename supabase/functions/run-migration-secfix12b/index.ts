/**
 * run-migration-secfix12b — fix della policy INSERT su notifications:
 * la verifica del destinatario deve usare un helper SECURITY DEFINER,
 * altrimenti RLS su project_members la rende sempre falsa.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

CREATE OR REPLACE FUNCTION public.is_user_project_member(p_project uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project AND pm.user_id = p_user
  )
$fn$;

REVOKE ALL ON FUNCTION public.is_user_project_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_project_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS users_insert_project_notifications ON public.notifications;
CREATE POLICY users_insert_project_notifications ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    type IN ('mention', 'status_change')
    AND project_id IS NOT NULL
    AND public.is_project_member(project_id)
    AND public.is_user_project_member(project_id, user_id)
    AND length(title) <= 200
    AND (body IS NULL OR length(body) <= 1000)
  );

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
  if (!key || key !== Deno.env.get("SITE_API_KEY")) return json({ error: "forbidden" }, 403);
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    return json({ ok: true, message: "secfix12b applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
