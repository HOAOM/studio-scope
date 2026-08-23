-- Archived from edge function run-migration-kroneel-access (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

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

