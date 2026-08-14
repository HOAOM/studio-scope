/**
 * run-migration-secfix10 — chiusura di due escalation di privilegio:
 *
 * 1) organization_members: la policy ALL "owners can manage org members" era
 *    agganciata a is_org_admin(), quindi un admin di organizzazione poteva
 *    fare UPDATE della propria riga impostando is_owner = true.
 * 2) user_roles: le policy "Org admins insert/update/delete org roles" non
 *    avevano il vincolo role <> 'admin' presente invece nelle policy owner,
 *    quindi un admin poteva assegnare il ruolo 'admin' a sé o ad altri.
 *
 * Inoltre: hardening esplicito dei grant su platform_admins (nessuna
 * scrittura possibile da anon/authenticated; solo le RPC SECURITY DEFINER
 * platform_admin_set_grade / platform_admin_revoke, riservate ai platform
 * owner, possono scrivere).
 *
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

-- ---------------------------------------------------------------
-- 1. organization_members: solo owner (o platform admin) toccano is_owner
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "owners can manage org members" ON public.organization_members;
DROP POLICY IF EXISTS org_owners_manage_members ON public.organization_members;
DROP POLICY IF EXISTS org_admins_manage_non_owner_members ON public.organization_members;

CREATE POLICY org_owners_manage_members ON public.organization_members
  FOR ALL TO authenticated
  USING (public.is_org_owner(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_owner(organization_id) OR public.is_platform_admin());

-- Gli admin di org gestiscono solo membri non-owner e non possono creare
-- né promuovere righe con is_owner = true.
CREATE POLICY org_admins_manage_non_owner_members ON public.organization_members
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) AND is_owner = false)
  WITH CHECK (public.is_org_admin(organization_id) AND is_owner = false);

-- ---------------------------------------------------------------
-- 2. user_roles: gli admin di org non possono conferire il ruolo 'admin'
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Org admins insert org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins update org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins delete org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Platform admins manage roles" ON public.user_roles;

CREATE POLICY "Org admins insert org roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id) AND role <> 'admin'::public.app_role);

CREATE POLICY "Org admins update org roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id) AND role <> 'admin'::public.app_role)
  WITH CHECK (public.is_org_admin(organization_id) AND role <> 'admin'::public.app_role);

CREATE POLICY "Org admins delete org roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) AND role <> 'admin'::public.app_role);

-- I platform admin restano pienamente operativi su tutte le org.
CREATE POLICY "Platform admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------
-- 3. platform_admins: nessuna scrittura dai ruoli client
-- ---------------------------------------------------------------
REVOKE ALL ON public.platform_admins FROM anon;
REVOKE ALL ON public.platform_admins FROM authenticated;
REVOKE ALL ON public.platform_admins FROM PUBLIC;
GRANT SELECT ON public.platform_admins TO authenticated; -- letture filtrate da RLS
GRANT ALL ON public.platform_admins TO service_role;

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
    return json({ ok: true, message: "secfix10 applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
