-- 1) Catalogo: ruolo funzionale predefinito -------------------------------
ALTER TABLE public.position_catalog
  ADD COLUMN IF NOT EXISTS default_app_role public.app_role;

UPDATE public.position_catalog SET default_app_role = m.role::public.app_role FROM (VALUES
  ('CEO','ceo'),
  ('COO','coo'),
  ('CFO','head_of_payments'),
  ('Chief Accountant','accountant'),
  ('Junior Accountant','accountant'),
  ('Financial Controller','accountant'),
  ('Cost Auditor','accountant'),
  ('Head of Design / Art Director','head_of_design'),
  ('Senior Architect','architectural_dept'),
  ('Junior Architect','architectural_dept'),
  ('Geometra / Draftsman','architectural_dept'),
  ('BIM Coordinator','architectural_dept'),
  ('Senior Interior Designer','designer'),
  ('Junior Interior Designer','designer'),
  ('Material Consultant','designer'),
  ('3D Artist / Renderista','designer'),
  ('Landscape Architect','designer'),
  ('Lighting Designer','designer'),
  ('Project Director','project_manager'),
  ('Senior Project Manager','project_manager'),
  ('Junior Project Manager','project_manager'),
  ('Chief Engineer','site_engineer'),
  ('Structural Engineer','site_engineer'),
  ('MEP / Plant Engineer','mep_engineer'),
  ('Chief Quantity Surveyor','qs'),
  ('Junior Quantity Surveyor','qs'),
  ('Procurement Manager','procurement_manager'),
  ('Buyer / Expeditor','procurement_manager'),
  ('Logistics Coordinator','procurement_manager'),
  ('Construction Manager','site_engineer'),
  ('Site Manager (Capo Cantiere)','site_engineer'),
  ('HSE Officer (Sicurezza)','site_engineer')
) AS m(title, role)
WHERE public.position_catalog.title = m.title;

-- 2) Override per singola organizzazione ----------------------------------
CREATE TABLE IF NOT EXISTS public.org_position_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.position_catalog(id) ON DELETE CASCADE,
  app_role public.app_role,
  set_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, catalog_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_position_overrides TO authenticated;
GRANT ALL ON public.org_position_overrides TO service_role;
ALTER TABLE public.org_position_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read position overrides"
  ON public.org_position_overrides FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Admins manage position overrides"
  ON public.org_position_overrides FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_org_owner(organization_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_org_admin(organization_id) OR public.is_org_owner(organization_id) OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_org_position_overrides_updated_at
  BEFORE UPDATE ON public.org_position_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Ruolo effettivo di una posizione -------------------------------------
CREATE OR REPLACE FUNCTION public.org_position_app_role(p_position uuid)
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(o.app_role, c.default_app_role, p.base_role)
  FROM public.org_positions p
  LEFT JOIN public.position_catalog c ON c.id = p.catalog_id
  LEFT JOIN public.org_position_overrides o
    ON o.organization_id = p.organization_id AND o.catalog_id = p.catalog_id
  WHERE p.id = p_position
$$;

REVOKE ALL ON FUNCTION public.org_position_app_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_position_app_role(uuid) TO authenticated, service_role;

-- 4) Nuovi tetti di piano --------------------------------------------------
ALTER TABLE public.tier_limits
  ADD COLUMN IF NOT EXISTS max_roles_per_user integer,
  ADD COLUMN IF NOT EXISTS max_super_role_extra integer,
  ADD COLUMN IF NOT EXISTS archive_retention_hours integer;

INSERT INTO public.tier_limits (tier, max_active_projects, max_storage_bytes, max_users_per_role, max_roles_per_user, max_super_role_extra, max_addons, archive_retention_hours)
VALUES
  ('basic',       3,  5368709120,  3,  3, 0, 1, 24),
  ('advanced',    8, 10737418240,  8,  5, 1, 3, 168),
  ('pro',        15, 21474836480, 20,  8, 3, 5, 720),
  ('enterprise', NULL, NULL,     NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (tier) DO UPDATE SET
  max_active_projects     = EXCLUDED.max_active_projects,
  max_storage_bytes       = EXCLUDED.max_storage_bytes,
  max_users_per_role      = EXCLUDED.max_users_per_role,
  max_roles_per_user      = EXCLUDED.max_roles_per_user,
  max_super_role_extra    = EXCLUDED.max_super_role_extra,
  max_addons              = EXCLUDED.max_addons,
  archive_retention_hours = EXCLUDED.archive_retention_hours,
  updated_at              = now();

-- 5) Conteggi quota --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_super_role_user_count(p_org uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT ur.user_id)::int
  FROM public.user_roles ur
  WHERE ur.organization_id = p_org
    AND ur.role IN ('admin','coo')
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = p_org AND m.user_id = ur.user_id
        AND (m.is_owner OR m.is_complimentary OR m.is_over_tier_limit))
$$;

CREATE OR REPLACE FUNCTION public.org_user_role_count(p_org uuid, p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT ur.role)::int FROM public.user_roles ur
  WHERE ur.organization_id = p_org AND ur.user_id = p_user
$$;

REVOKE ALL ON FUNCTION public.org_super_role_user_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_user_role_count(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_super_role_user_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_user_role_count(uuid, uuid) TO authenticated, service_role;

-- 6) Enforcement dei tetti su user_roles -----------------------------------
CREATE OR REPLACE FUNCTION public.enforce_org_role_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lim public.tier_limits; v_used integer; v_tier public.subscription_tier;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  IF public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members m
             WHERE m.organization_id = NEW.organization_id
               AND m.user_id = NEW.user_id AND m.is_owner) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles ur
             WHERE ur.organization_id = NEW.organization_id
               AND ur.role = NEW.role AND ur.user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_lim FROM public.get_tier_limits(NEW.organization_id);
  v_tier := public.get_org_effective_tier(NEW.organization_id);

  -- ruoli cumulabili sulla stessa persona
  IF v_lim.max_roles_per_user IS NOT NULL THEN
    v_used := public.org_user_role_count(NEW.organization_id, NEW.user_id);
    IF v_used >= v_lim.max_roles_per_user THEN
      RAISE EXCEPTION
        'Limite ruoli per persona raggiunto per il piano % (% / %). Serve un upgrade di piano.',
        v_tier, v_used, v_lim.max_roles_per_user USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.role IN ('admin','coo') THEN
    -- tetto dedicato alle persone con poteri di bypass, oltre al titolare
    IF v_lim.max_super_role_extra IS NOT NULL THEN
      v_used := public.org_super_role_user_count(NEW.organization_id);
      IF NOT EXISTS (SELECT 1 FROM public.user_roles ur
                     WHERE ur.organization_id = NEW.organization_id
                       AND ur.user_id = NEW.user_id AND ur.role IN ('admin','coo'))
         AND v_used >= v_lim.max_super_role_extra THEN
        RAISE EXCEPTION
          'Limite persone con ruolo admin/coo raggiunto per il piano % (% / %). Serve un upgrade di piano.',
          v_tier, v_used, v_lim.max_super_role_extra USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_lim.max_users_per_role IS NOT NULL THEN
    v_used := public.org_role_user_count(NEW.organization_id, NEW.role);
    IF v_used >= v_lim.max_users_per_role THEN
      RAISE EXCEPTION
        'Limite utenti per ruolo raggiunto per il piano % (% / % utenti con ruolo %). Serve un upgrade di piano.',
        v_tier, v_used, v_lim.max_users_per_role, NEW.role USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 7) Nessun ruolo funzionale => nessun ruolo di progetto o eccezione -------
CREATE OR REPLACE FUNCTION public.enforce_requires_org_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  IF TG_TABLE_NAME = 'project_assignments' THEN
    SELECT p.organization_id INTO v_org FROM public.projects p WHERE p.id = NEW.project_id;
  ELSE
    v_org := NEW.organization_id;
  END IF;
  IF v_org IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members m
             WHERE m.organization_id = v_org AND m.user_id = NEW.user_id AND m.is_owner) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.organization_id = v_org AND ur.user_id = NEW.user_id) THEN
    RAISE EXCEPTION
      'Questa persona non ha ancora un ruolo funzionale nell''organigramma: assegnalo prima di dare accessi operativi.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_requires_org_role ON public.project_assignments;
CREATE TRIGGER trg_assignment_requires_org_role
  BEFORE INSERT OR UPDATE ON public.project_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_requires_org_role();

DROP TRIGGER IF EXISTS trg_override_requires_org_role ON public.permission_overrides;
CREATE TRIGGER trg_override_requires_org_role
  BEFORE INSERT OR UPDATE ON public.permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.enforce_requires_org_role();

-- 8) Segnale interno anti "revolving door" ---------------------------------
CREATE TABLE IF NOT EXISTS public.org_role_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  previous_change_at timestamptz,
  is_revolving boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.org_role_change_log TO authenticated;
GRANT ALL ON public.org_role_change_log TO service_role;
ALTER TABLE public.org_role_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read role change log"
  ON public.org_role_change_log FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_org_owner(organization_id) OR public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_org_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.user_roles; v_prev timestamptz;
BEGIN
  v_row := COALESCE(NEW, OLD);
  SELECT max(l.created_at) INTO v_prev FROM public.org_role_change_log l
   WHERE l.organization_id = v_row.organization_id AND l.user_id = v_row.user_id;
  INSERT INTO public.org_role_change_log
    (organization_id, user_id, role, action, actor_id, previous_change_at, is_revolving)
  VALUES (v_row.organization_id, v_row.user_id, v_row.role,
          CASE WHEN TG_OP = 'INSERT' THEN 'granted' ELSE 'revoked' END,
          auth.uid(), v_prev,
          v_prev IS NOT NULL AND v_prev > now() - interval '10 days');
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_org_role_change ON public.user_roles;
CREATE TRIGGER trg_log_org_role_change
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_org_role_change();

-- 9) Riepilogo quote per il client -----------------------------------------
DROP FUNCTION IF EXISTS public.my_org_limits_usage(uuid);
CREATE FUNCTION public.my_org_limits_usage(p_org uuid DEFAULT NULL::uuid)
RETURNS TABLE(organization_id uuid, tier public.subscription_tier, seats_used integer,
  max_seats integer, projects_used integer, max_active_projects integer,
  storage_used_bytes bigint, max_storage_bytes bigint, max_boq_items_per_project integer,
  max_users_per_role integer, max_addons integer, max_roles_per_user integer,
  max_super_role_extra integer, super_roles_used integer, archive_retention_hours integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH org AS (
    SELECT COALESCE(p_org,
      (SELECT m.organization_id FROM public.organization_members m
        WHERE m.user_id = auth.uid() ORDER BY m.joined_at ASC LIMIT 1)) AS id
  )
  SELECT org.id, public.get_org_effective_tier(org.id),
    public.org_seat_count(org.id), l.max_seats,
    public.get_org_active_project_count(org.id), l.max_active_projects,
    public.org_storage_bytes(org.id), l.max_storage_bytes,
    l.max_boq_items_per_project, l.max_users_per_role, l.max_addons,
    l.max_roles_per_user, l.max_super_role_extra,
    public.org_super_role_user_count(org.id), l.archive_retention_hours
  FROM org
  LEFT JOIN LATERAL public.get_tier_limits(org.id) l ON true
  WHERE org.id IS NOT NULL
    AND (public.is_org_member(org.id) OR public.is_platform_admin(auth.uid()))
$$;

REVOKE ALL ON FUNCTION public.my_org_limits_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_org_limits_usage(uuid) TO authenticated, service_role;

-- 10) Template iniziale di onboarding (posizioni, non persone) -------------
CREATE OR REPLACE FUNCTION public.seed_org_chart_template(p_org uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer := 0; v_root uuid;
  v_design uuid; v_ops uuid; v_proc uuid; v_fin uuid; v_site uuid;
  r record; v_id uuid; v_i integer := 0;
BEGIN
  IF NOT (public.is_org_admin(p_org) OR public.is_org_owner(p_org) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;
  SELECT count(*) INTO v_count FROM public.org_positions WHERE organization_id = p_org;
  IF v_count > 0 THEN RETURN 0; END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('CEO', NULL::text, 'Leadership'),
      ('COO', 'CEO', 'Leadership'),
      ('Head of Design / Art Director', 'CEO', 'Design and Technical'),
      ('Senior Architect', 'Head of Design / Art Director', 'Design and Technical'),
      ('Senior Interior Designer', 'Head of Design / Art Director', 'Design and Technical'),
      ('Junior Interior Designer', 'Senior Interior Designer', 'Design and Technical'),
      ('BIM Coordinator', 'Head of Design / Art Director', 'Design and Technical'),
      ('3D Artist / Renderista', 'Head of Design / Art Director', 'Design and Technical'),
      ('Project Director', 'COO', 'Operations'),
      ('Senior Project Manager', 'Project Director', 'Operations'),
      ('Junior Project Manager', 'Project Director', 'Operations'),
      ('Chief Quantity Surveyor', 'COO', 'Operations'),
      ('Junior Quantity Surveyor', 'Chief Quantity Surveyor', 'Operations'),
      ('Procurement Manager', 'COO', 'Procurement'),
      ('Buyer / Expeditor', 'Procurement Manager', 'Procurement'),
      ('Logistics Coordinator', 'Procurement Manager', 'Procurement'),
      ('CFO', 'CEO', 'Finance'),
      ('Chief Accountant', 'CFO', 'Finance'),
      ('Financial Controller', 'CFO', 'Finance'),
      ('Construction Manager', 'COO', 'Site and Support'),
      ('Site Manager (Capo Cantiere)', 'Construction Manager', 'Site and Support'),
      ('MEP / Plant Engineer', 'Construction Manager', 'Site and Support'),
      ('HSE Officer (Sicurezza)', 'Construction Manager', 'Site and Support'),
      ('Office Manager / Segreteria', 'CEO', 'Site and Support')
    ) AS t(title, parent, dept)
  LOOP
    v_i := v_i + 1;
    INSERT INTO public.org_positions
      (organization_id, title, node_kind, manager_id, catalog_id, base_role, sort_order, x, y, created_by, notes)
    SELECT p_org, r.title, 'person',
      (SELECT id FROM public.org_positions WHERE organization_id = p_org AND title = r.parent LIMIT 1),
      c.id,
      c.default_app_role,
      v_i, 0, 0, auth.uid(), r.dept
    FROM (SELECT id, default_app_role FROM public.position_catalog WHERE title = r.title LIMIT 1) c
    RIGHT JOIN (SELECT 1) x ON true
    RETURNING id INTO v_id;
  END LOOP;

  SELECT count(*)::int INTO v_count FROM public.org_positions WHERE organization_id = p_org;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_org_chart_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_org_chart_template(uuid) TO authenticated, service_role;