import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- 1) Revoke EXECUTE from authenticated/anon/public on SECURITY DEFINER helpers
--    that are only used internally (RLS helpers / triggers). Functions still
--    invoked via .rpc() by the app keep their EXECUTE grant.
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'get_org_active_project_count(uuid)',
    'get_org_effective_tier(uuid)',
    'get_org_role_labels(uuid)',
    'get_org_subscription_status(uuid)',
    'get_role_label(uuid, public.app_role)',
    'get_user_org()',
    'is_item_project_owner(uuid)',
    'is_org_member(uuid)',
    'is_org_owner(uuid)',
    'is_project_member(uuid)',
    'is_project_owner(uuid)',
    'org_active_project_count(uuid)',
    'org_can_activate_project(uuid)',
    'org_reopen_count_this_month(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- 2) Re-scope presentations policies from public role to authenticated
DROP POLICY IF EXISTS "Users can create presentations for their projects" ON public.presentations;
DROP POLICY IF EXISTS "Users can delete presentations from their projects" ON public.presentations;
DROP POLICY IF EXISTS "Users can update presentations of their projects" ON public.presentations;
DROP POLICY IF EXISTS "Users can view presentations of their projects" ON public.presentations;

CREATE POLICY "Users can view presentations of their projects"
  ON public.presentations FOR SELECT TO authenticated
  USING (public.is_project_owner(project_id));

CREATE POLICY "Users can create presentations for their projects"
  ON public.presentations FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id));

CREATE POLICY "Users can update presentations of their projects"
  ON public.presentations FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id))
  WITH CHECK (public.is_project_owner(project_id));

CREATE POLICY "Users can delete presentations from their projects"
  ON public.presentations FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id));

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
    return json({ ok: true, message: "Security migration applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
