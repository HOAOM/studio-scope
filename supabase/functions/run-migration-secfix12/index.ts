/**
 * run-migration-secfix12
 * 1. search_path esplicito sulle funzioni tier_* (Function Search Path Mutable)
 * 2. audit_log: INSERT solo su entità realmente accessibili dall'utente
 * 3. notifications: INSERT limitato a tipi utente e membri dello stesso progetto
 * Idempotente. Richiede x-site-api-key.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

ALTER FUNCTION public.tier_project_limit(public.subscription_tier) SET search_path = public;
ALTER FUNCTION public.tier_storage_limit_bytes(public.subscription_tier) SET search_path = public;
ALTER FUNCTION public.tier_storage_limit_gb(public.subscription_tier) SET search_path = public;

ALTER TABLE public.audit_log ALTER COLUMN user_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS users_insert_own_audit ON public.audit_log;
CREATE POLICY users_insert_own_audit ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND entity_type = 'item'
    AND EXISTS (
      SELECT 1 FROM public.project_items pi
      WHERE pi.id = audit_log.entity_id
        AND (public.is_project_member(pi.project_id) OR public.is_project_in_my_org(pi.project_id))
    )
  );

DROP POLICY IF EXISTS authenticated_insert_notifications ON public.notifications;
DROP POLICY IF EXISTS users_insert_project_notifications ON public.notifications;
CREATE POLICY users_insert_project_notifications ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    type IN ('mention', 'status_change')
    AND project_id IS NOT NULL
    AND public.is_project_member(project_id)
    AND EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = notifications.project_id
        AND pm.user_id = notifications.user_id
    )
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
  if (!key || key !== Deno.env.get("SITE_API_KEY")) {
    return json({ error: "forbidden" }, 403);
  }

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    return json({ ok: true, message: "secfix12 applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
