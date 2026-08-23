-- Archived from edge function run-migration-org-projects (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- Il progetto appartiene a un'organizzazione di cui sono membro?
CREATE OR REPLACE FUNCTION public.is_project_in_my_org(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.organization_members m
      ON m.organization_id = p.organization_id
    WHERE p.id = p_project_id
      AND m.user_id = auth.uid()
  )
$fn$;

-- Sono owner dell'organizzazione che possiede il progetto?
CREATE OR REPLACE FUNCTION public.is_project_org_owner(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.organization_members m
      ON m.organization_id = p.organization_id
    WHERE p.id = p_project_id
      AND m.user_id = auth.uid()
      AND m.is_owner = true
  )
$fn$;

GRANT EXECUTE ON FUNCTION public.is_project_in_my_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_org_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_item_project_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE(organization_id uuid, name text, slug text, is_owner boolean, tier text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT o.id, o.name, o.slug, m.is_owner,
         COALESCE(public.get_org_effective_tier(o.id)::text, 'starter'),
         COALESCE(s.status::text, 'suspended')
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
  WHERE m.user_id = auth.uid()
  ORDER BY m.joined_at ASC
$fn$;
GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated;

DO $$
BEGIN
  -- PROJECTS: tutti i membri dell'org vedono i progetti dell'org
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='Org members can view org projects') THEN
    CREATE POLICY "Org members can view org projects" ON public.projects
      FOR SELECT TO authenticated
      USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  -- PROJECTS: org owner e super-admin possono modificare
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='Org owners can update org projects') THEN
    CREATE POLICY "Org owners can update org projects" ON public.projects
      FOR UPDATE TO authenticated
      USING (public.is_org_owner(organization_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.is_org_owner(organization_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='Org owners can delete org projects') THEN
    CREATE POLICY "Org owners can delete org projects" ON public.projects
      FOR DELETE TO authenticated
      USING (public.is_org_owner(organization_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  -- PROJECT_ITEMS: accesso completo ai membri dell'org proprietaria
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_items' AND policyname='Org members can access org project items') THEN
    CREATE POLICY "Org members can access org project items" ON public.project_items
      FOR ALL TO authenticated
      USING (public.is_project_in_my_org(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.is_project_in_my_org(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  -- PROJECT_TASKS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_tasks' AND policyname='Org members can access org project tasks') THEN
    CREATE POLICY "Org members can access org project tasks" ON public.project_tasks
      FOR ALL TO authenticated
      USING (public.is_project_in_my_org(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.is_project_in_my_org(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  -- PROJECT_MEMBERS
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_members' AND policyname='Org members can view org project members') THEN
    CREATE POLICY "Org members can view org project members" ON public.project_members
      FOR SELECT TO authenticated
      USING (public.is_project_in_my_org(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  -- BOQ COVERAGE
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='boq_coverage' AND policyname='Org members can access org boq coverage') THEN
    CREATE POLICY "Org members can access org boq coverage" ON public.boq_coverage
      FOR ALL TO authenticated
      USING (public.is_project_in_my_org(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.is_project_in_my_org(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  -- MILESTONES
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_milestones' AND policyname='Org members can access org milestones') THEN
    CREATE POLICY "Org members can access org milestones" ON public.project_milestones
      FOR ALL TO authenticated
      USING (public.is_project_in_my_org(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
      WITH CHECK (public.is_project_in_my_org(project_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

COMMIT;

