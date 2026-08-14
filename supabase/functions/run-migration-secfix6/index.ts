import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- 1) Helper: do I share an organization with the target user?
CREATE OR REPLACE FUNCTION public.shares_org_with(_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members them
      ON them.organization_id = me.organization_id
    WHERE me.user_id = auth.uid()
      AND them.user_id = _target
  )
$fn$;

REVOKE EXECUTE ON FUNCTION public.shares_org_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_org_with(uuid) TO authenticated, service_role;

-- 2) Notifications: only allow creating notifications for yourself or for
--    users you actually share an organization with.
DROP POLICY IF EXISTS "authenticated_insert_notifications" ON public.notifications;
CREATE POLICY "authenticated_insert_notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.shares_org_with(user_id)
  );

-- 3) user_roles: org owners may manage org-scoped roles but must never be able
--    to grant the platform-level 'admin' role.
DROP POLICY IF EXISTS "Org owners manage org roles" ON public.user_roles;

CREATE POLICY "Org owners view org roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_org_owner(organization_id));

CREATE POLICY "Org owners insert org roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_org_owner(organization_id) AND role <> 'admin'::public.app_role);

CREATE POLICY "Org owners update org roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_org_owner(organization_id) AND role <> 'admin'::public.app_role)
  WITH CHECK (public.is_org_owner(organization_id) AND role <> 'admin'::public.app_role);

CREATE POLICY "Org owners delete org roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_org_owner(organization_id) AND role <> 'admin'::public.app_role);

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
    return json({ ok: true, message: "secfix6 applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
