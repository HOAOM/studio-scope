-- Archived from edge function run-migration-company-settings-org (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

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

