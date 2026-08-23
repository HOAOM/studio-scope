-- Archived from edge function run-migration-phase1 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- 1. organizations ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  custom_domain text UNIQUE,
  branding      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. organization_members ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  is_owner        boolean NOT NULL DEFAULT false,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org  ON public.organization_members(organization_id);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 3. organization_role_labels (rename-only) ----------------------------------
CREATE TABLE IF NOT EXISTS public.organization_role_labels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  base_role       text NOT NULL,
  custom_label    text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, base_role)
);
ALTER TABLE public.organization_role_labels ENABLE ROW LEVEL SECURITY;

-- 4. helper functions --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org AND user_id = auth.uid() AND is_owner = true
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_org()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.organization_members
  WHERE user_id = auth.uid()
  ORDER BY joined_at ASC
  LIMIT 1
$$;

-- 5. RLS policies ------------------------------------------------------------
DROP POLICY IF EXISTS "members can view their org"        ON public.organizations;
DROP POLICY IF EXISTS "owners and admins can update org"  ON public.organizations;
DROP POLICY IF EXISTS "admins can manage all orgs"        ON public.organizations;

CREATE POLICY "members can view their org" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "owners and admins can update org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_owner(id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_org_owner(id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can manage all orgs" ON public.organizations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "members can view org members"  ON public.organization_members;
DROP POLICY IF EXISTS "owners can manage org members" ON public.organization_members;

CREATE POLICY "members can view org members" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "owners can manage org members" ON public.organization_members
  FOR ALL TO authenticated
  USING (public.is_org_owner(organization_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_org_owner(organization_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "members can view role labels"   ON public.organization_role_labels;
DROP POLICY IF EXISTS "owners can manage role labels"  ON public.organization_role_labels;

CREATE POLICY "members can view role labels" ON public.organization_role_labels
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "owners can manage role labels" ON public.organization_role_labels
  FOR ALL TO authenticated
  USING (public.is_org_owner(organization_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_org_owner(organization_id) OR public.has_role(auth.uid(), 'admin'));

-- 6. updated_at triggers -----------------------------------------------------
DROP TRIGGER IF EXISTS trg_orgs_updated_at        ON public.organizations;
DROP TRIGGER IF EXISTS trg_role_labels_updated_at ON public.organization_role_labels;

CREATE TRIGGER trg_orgs_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_role_labels_updated_at
  BEFORE UPDATE ON public.organization_role_labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. projects.organization_id (nullable for now) -----------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_org ON public.projects(organization_id);

-- 8. Backfill ----------------------------------------------------------------
INSERT INTO public.organizations (name, slug)
  VALUES ('Studio Scope', 'studio-scope')
  ON CONFLICT (slug) DO NOTHING;

WITH org AS (SELECT id FROM public.organizations WHERE slug = 'studio-scope')
INSERT INTO public.organization_members (organization_id, user_id, is_owner)
SELECT org.id, u.id, public.has_role(u.id, 'admin')
FROM auth.users u CROSS JOIN org
ON CONFLICT (organization_id, user_id) DO NOTHING;

UPDATE public.projects
   SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'studio-scope')
 WHERE organization_id IS NULL;

COMMIT;

