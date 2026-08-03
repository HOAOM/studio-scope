import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_domains (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain             text NOT NULL,
  status             text NOT NULL DEFAULT 'pending',
  verification_token text NOT NULL,
  last_error         text,
  last_checked_at    timestamptz,
  verified_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- un dominio appartiene a una sola organizzazione
CREATE UNIQUE INDEX IF NOT EXISTS organization_domains_domain_key
  ON public.organization_domains (lower(domain));
CREATE INDEX IF NOT EXISTS organization_domains_org_idx
  ON public.organization_domains (organization_id);
CREATE INDEX IF NOT EXISTS organization_domains_status_idx
  ON public.organization_domains (status);

DO $$ BEGIN
  ALTER TABLE public.organization_domains
    ADD CONSTRAINT organization_domains_status_chk
    CHECK (status IN ('pending','verifying','active','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS trg_org_domains_updated_at ON public.organization_domains;
CREATE TRIGGER trg_org_domains_updated_at
  BEFORE UPDATE ON public.organization_domains
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.organization_domains FROM PUBLIC, anon;
GRANT SELECT ON public.organization_domains TO authenticated;
GRANT ALL    ON public.organization_domains TO service_role;

ALTER TABLE public.organization_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own org domains" ON public.organization_domains;
CREATE POLICY "members read own org domains"
  ON public.organization_domains FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

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
    return json({ ok: true, message: "organization_domains migration applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
