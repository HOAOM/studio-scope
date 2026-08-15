/**
 * run-migration-company-settings-org — company_settings diventa per-organizzazione.
 *
 * 1) Aggiunge organization_id (FK organizations) a company_settings.
 * 2) Migra la riga globale esistente sulla prima organizzazione creata
 *    (Studio Scope), senza perdita dati; crea una riga per ogni altra org.
 * 3) Vincolo di unicità: una sola riga per organizzazione + trigger che crea
 *    automaticamente la riga alla creazione di una nuova organizzazione.
 * 4) RLS: lettura ai membri della propria org, scrittura solo ad admin/owner
 *    della propria org (o platform admin).
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

-- 1. colonna organization_id
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2. backfill: la riga globale esistente va alla prima org creata
UPDATE public.company_settings cs
SET organization_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE cs.organization_id IS NULL;

-- righe orfane (nessuna organizzazione presente): restano NULL, le eliminiamo
DELETE FROM public.company_settings WHERE organization_id IS NULL;

-- eventuali duplicati per org: teniamo la più vecchia
DELETE FROM public.company_settings a
USING public.company_settings b
WHERE a.organization_id = b.organization_id
  AND a.created_at > b.created_at;

ALTER TABLE public.company_settings ALTER COLUMN organization_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS company_settings_org_uidx
  ON public.company_settings(organization_id);

-- 3. una riga per ogni organizzazione esistente
INSERT INTO public.company_settings (organization_id, company_name)
SELECT o.id, o.name
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_settings cs WHERE cs.organization_id = o.id
);

-- trigger: crea la riga alla creazione di una nuova organizzazione
CREATE OR REPLACE FUNCTION public.create_company_settings_for_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_settings (organization_id, company_name)
  VALUES (NEW.id, NEW.name)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_company_settings_for_org() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_create_company_settings ON public.organizations;
CREATE TRIGGER trg_create_company_settings
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.create_company_settings_for_org();

-- 4. RLS per-organizzazione
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_manage_company_settings ON public.company_settings;
DROP POLICY IF EXISTS members_read_company_settings ON public.company_settings;
DROP POLICY IF EXISTS org_members_read_company_settings ON public.company_settings;
DROP POLICY IF EXISTS org_admins_manage_company_settings ON public.company_settings;

CREATE POLICY org_members_read_company_settings ON public.company_settings
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin());

CREATE POLICY org_admins_manage_company_settings ON public.company_settings
  FOR ALL TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR public.is_org_owner(organization_id)
    OR public.is_platform_admin()
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR public.is_org_owner(organization_id)
    OR public.is_platform_admin()
  );

REVOKE ALL ON public.company_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;

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
    const rows = await sql`
      SELECT cs.organization_id, o.name AS org_name, cs.company_name
      FROM public.company_settings cs
      JOIN public.organizations o ON o.id = cs.organization_id
      ORDER BY o.created_at`;
    return json({ ok: true, message: "company_settings per-org applied", rows });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
