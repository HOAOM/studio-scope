-- Archived from edge function run-migration-roles-2level (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- =====================================================================
-- LEVEL 1 — organization-scoped roles
-- =====================================================================
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill: existing roles belong to the user's org, or to the only org present.
UPDATE public.user_roles ur
SET organization_id = COALESCE(
  (SELECT om.organization_id FROM public.organization_members om
    WHERE om.user_id = ur.user_id ORDER BY om.joined_at ASC LIMIT 1),
  (SELECT o.id FROM public.organizations o ORDER BY o.created_at ASC LIMIT 1)
)
WHERE ur.organization_id IS NULL;

DELETE FROM public.user_roles WHERE organization_id IS NULL;

ALTER TABLE public.user_roles ALTER COLUMN organization_id SET NOT NULL;

-- Replace the old (user_id, role) uniqueness with an org-scoped one.
DO $do$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.user_roles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $do$;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_org_role_key
  ON public.user_roles (user_id, organization_id, role);
CREATE INDEX IF NOT EXISTS user_roles_org_idx ON public.user_roles (organization_id);

-- Org-scoped role check helper
CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND organization_id = _org AND role = _role
  )
$fn$;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role) TO authenticated, service_role;

-- Visibility of roles inside one's own organization + owner management
DROP POLICY IF EXISTS "Org members can view org roles" ON public.user_roles;
CREATE POLICY "Org members can view org roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Org owners manage org roles" ON public.user_roles;
CREATE POLICY "Org owners manage org roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_org_owner(organization_id))
  WITH CHECK (public.is_org_owner(organization_id));

-- =====================================================================
-- LEVEL 2 — per-project operational assignments
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.project_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  function_role public.app_role NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_assignments_unique
  ON public.project_assignments (project_id, user_id, function_role);
CREATE INDEX IF NOT EXISTS project_assignments_project_idx
  ON public.project_assignments (project_id);
CREATE INDEX IF NOT EXISTS project_assignments_user_idx
  ON public.project_assignments (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_assignments TO authenticated;
GRANT ALL ON public.project_assignments TO service_role;

ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View project assignments" ON public.project_assignments;
CREATE POLICY "View project assignments" ON public.project_assignments
  FOR SELECT TO authenticated
  USING (
    public.is_project_in_my_org(project_id)
    OR public.is_project_member(project_id)
    OR public.is_project_owner(project_id)
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Manage project assignments" ON public.project_assignments;
CREATE POLICY "Manage project assignments" ON public.project_assignments
  FOR ALL TO authenticated
  USING (
    public.is_project_owner(project_id)
    OR public.is_project_org_owner(project_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.is_project_owner(project_id)
    OR public.is_project_org_owner(project_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP TRIGGER IF EXISTS trg_project_assignments_updated_at ON public.project_assignments;
CREATE TRIGGER trg_project_assignments_updated_at
  BEFORE UPDATE ON public.project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Keep project_members (access layer) in sync with assignments
CREATE OR REPLACE FUNCTION public.sync_project_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  SELECT NEW.project_id, NEW.user_id, NEW.function_role
  WHERE NOT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = NEW.project_id AND user_id = NEW.user_id
  );
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_sync_project_membership ON public.project_assignments;
CREATE TRIGGER trg_sync_project_membership
  AFTER INSERT ON public.project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.sync_project_membership();

-- Backfill from existing project_members (Section Responsibility data)
INSERT INTO public.project_assignments (project_id, user_id, function_role, notes)
SELECT pm.project_id, pm.user_id, pm.role, 'migrated from project_members'
FROM public.project_members pm
ON CONFLICT DO NOTHING;

COMMIT;

