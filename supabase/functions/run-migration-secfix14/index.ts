/**
 * run-migration-secfix14 — scoping organizzativo dei controlli admin.
 *
 *  1) Nuovo helper is_admin_in_shared_org(uuid): vero solo se il chiamante ha
 *     il ruolo 'admin' NELLA STESSA organizzazione dell'utente target.
 *  2) suppliers (UPDATE/DELETE) e supplier_comments (DELETE): sostituito
 *     has_role(auth.uid(),'admin') + shares_org_with() con l'helper scoped.
 *  3) user_login_sessions (SELECT): stessa correzione, così un admin non vede
 *     IP/geolocalizzazione di utenti di altre organizzazioni.
 *  4) Revocato EXECUTE a 'authenticated' su helper SECURITY DEFINER interni,
 *     invocati solo da altre funzioni/trigger definer.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin_in_shared_org(_target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members them
      ON them.organization_id = me.organization_id
     AND them.user_id = _target
    JOIN public.user_roles r
      ON r.organization_id = me.organization_id
     AND r.user_id = me.user_id
     AND r.role = 'admin'::app_role
    WHERE me.user_id = auth.uid()
  )
$fn$;

REVOKE ALL ON FUNCTION public.is_admin_in_shared_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_in_shared_org(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "members_update_suppliers" ON public.suppliers;
CREATE POLICY "members_update_suppliers" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_platform_admin()
    OR (created_by IS NOT NULL AND public.is_admin_in_shared_org(created_by))
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.is_platform_admin()
    OR (created_by IS NOT NULL AND public.is_admin_in_shared_org(created_by))
  );

DROP POLICY IF EXISTS "admin_delete_suppliers" ON public.suppliers;
CREATE POLICY "admin_delete_suppliers" ON public.suppliers
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_platform_admin()
    OR (created_by IS NOT NULL AND public.is_admin_in_shared_org(created_by))
  );

DROP POLICY IF EXISTS "authors_delete_supplier_comments" ON public.supplier_comments;
CREATE POLICY "authors_delete_supplier_comments" ON public.supplier_comments
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.is_platform_admin()
    OR (author_id IS NOT NULL AND public.is_admin_in_shared_org(author_id))
  );

DROP POLICY IF EXISTS "Users view own login sessions" ON public.user_login_sessions;
CREATE POLICY "Users view own login sessions" ON public.user_login_sessions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin()
    OR public.is_admin_in_shared_org(user_id)
  );

REVOKE EXECUTE ON FUNCTION public.org_storage_bytes(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.project_boq_item_count(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.org_role_user_count(uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.org_primary_email_domain(uuid) FROM authenticated;

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
    return json({ ok: true, message: "secfix14 applied" });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  } finally {
    await sql.end();
  }
});
