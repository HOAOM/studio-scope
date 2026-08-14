/**
 * run-migration-secfix6 — email visibility hardening.
 *
 * profiles.email non è più leggibile da tutti i membri che condividono
 * un'organizzazione: la colonna viene tolta dai grant di `authenticated`
 * e l'accesso passa dalla funzione `public.directory_profiles()`, che
 * restituisce l'email solo a: se stessi, admin di piattaforma, owner di
 * un'organizzazione condivisa. Gli altri vedono display_name/avatar.
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

CREATE OR REPLACE FUNCTION public.directory_profiles(p_ids uuid[] DEFAULT NULL)
RETURNS TABLE (id uuid, display_name text, avatar_url text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    CASE
      WHEN p.id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR EXISTS (
             SELECT 1
             FROM public.organization_members a
             JOIN public.organization_members b ON a.organization_id = b.organization_id
             WHERE a.user_id = auth.uid() AND a.is_owner AND b.user_id = p.id
           )
      THEN p.email
      ELSE NULL
    END AS email
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND (p_ids IS NULL OR p.id = ANY(p_ids))
    AND (
      p.id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
           SELECT 1
           FROM public.organization_members a
           JOIN public.organization_members b ON a.organization_id = b.organization_id
           WHERE a.user_id = auth.uid() AND b.user_id = p.id
         )
    )
$fn$;

REVOKE ALL ON FUNCTION public.directory_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.directory_profiles(uuid[]) TO authenticated, service_role;

-- niente più SELECT su profiles.email per gli utenti autenticati
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, display_name, avatar_url, created_at) ON public.profiles TO authenticated;
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
    return json({ ok: true, message: "secfix6 applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
