import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- Colonne di contatto gestibili dal cliente sul sito pubblico
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS contact_name  text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS contact_email text;

-- Helper RLS: SECURITY DEFINER / STABLE / search_path fisso (no ricorsione RLS)
CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org AND user_id = auth.uid()
  )
$fn$;

CREATE OR REPLACE FUNCTION public.is_org_owner(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org AND user_id = auth.uid() AND is_owner = true
  )
$fn$;

-- 1) EXECUTE agli utenti autenticati (necessario: usate nelle policy via Data API)
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid)  TO authenticated;

-- 2) GRANT tabelle (nessun grant ad anon)
GRANT SELECT ON public.organization_members       TO authenticated;
GRANT SELECT ON public.organization_subscriptions TO authenticated;
GRANT SELECT, UPDATE ON public.organizations      TO authenticated;
GRANT ALL ON public.organization_members          TO service_role;
GRANT ALL ON public.organization_subscriptions    TO service_role;
GRANT ALL ON public.organizations                 TO service_role;

-- 3) Policy (create solo se mancanti)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organization_members' AND policyname='own membership rows readable') THEN
    CREATE POLICY "own membership rows readable" ON public.organization_members
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='members can view their org') THEN
    CREATE POLICY "members can view their org" ON public.organizations
      FOR SELECT TO authenticated USING (public.is_org_member(id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organizations' AND policyname='owners and admins can update org') THEN
    CREATE POLICY "owners and admins can update org" ON public.organizations
      FOR UPDATE TO authenticated
      USING (public.is_org_owner(id)) WITH CHECK (public.is_org_owner(id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='organization_subscriptions' AND policyname='members view their subscription') THEN
    CREATE POLICY "members view their subscription" ON public.organization_subscriptions
      FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
  END IF;
END $$;

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
    return json({ ok: true, message: "Kroneel org access migration applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
