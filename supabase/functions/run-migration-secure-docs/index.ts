/**
 * run-migration-secure-docs — RLS policies for the private "secure-docs" bucket.
 * Path convention: <project_id>/<item_id>/<filename>
 * Only users with access to the project (org member, project member, project
 * owner or platform admin) can read/write objects.
 * Idempotent. Requires x-site-api-key.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_project_file(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_project uuid;
BEGIN
  BEGIN
    v_project := (split_part(p_name, '/', 1))::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;
  RETURN public.is_project_in_my_org(v_project)
      OR public.is_project_member(v_project)
      OR public.is_project_owner(v_project)
      OR public.has_role(auth.uid(), 'admin'::public.app_role);
END;
$fn$;

REVOKE ALL   ON FUNCTION public.can_access_project_file(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_project_file(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "secure_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "secure_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "secure_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "secure_docs_delete" ON storage.objects;

CREATE POLICY "secure_docs_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'secure-docs' AND public.can_access_project_file(name));

CREATE POLICY "secure_docs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'secure-docs' AND public.can_access_project_file(name));

CREATE POLICY "secure_docs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'secure-docs' AND public.can_access_project_file(name))
  WITH CHECK (bucket_id = 'secure-docs' AND public.can_access_project_file(name));

CREATE POLICY "secure_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'secure-docs' AND public.can_access_project_file(name));

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
    return json({ ok: true, message: "secure-docs policies applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
