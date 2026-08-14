/**
 * run-migration-secfix9 — profiles: rimozione della visibilità org-wide.
 *
 * La policy `users_read_profiles` permetteva a qualunque membro che
 * condivide un'organizzazione di leggere l'intera riga profilo (email
 * compresa a livello di policy). Ora la SELECT diretta è limitata a se
 * stessi e ai platform admin; i dati di directory (display_name, avatar,
 * ed email solo per owner/admin) passano da `public.directory_profiles()`.
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

DROP POLICY IF EXISTS users_read_profiles ON public.profiles;

CREATE POLICY users_read_own_profile ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- Hardening dei grant: nessun accesso alla colonna email dalla Data API,
-- nessuna scrittura anonima.
REVOKE ALL ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name, avatar_url, created_at) ON public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

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
    return json({ ok: true, message: "secfix9 applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
