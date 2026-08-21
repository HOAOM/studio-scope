-- =====================================================================
-- ORGANIGRAMMA / SQUADRE / CALENDARIZZAZIONE
-- =====================================================================

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.team_member_role AS ENUM ('member','lead');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.calendar_entry_type AS ENUM ('work','leave','permit','sick','travel','holiday','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.calendar_entry_status AS ENUM ('requested','confirmed','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- TEAMS ----------
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  discipline text,
  color text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select_org" ON public.teams FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY "teams_write_admin" ON public.teams FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_admin(organization_id) OR public.is_platform_admin());

CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_teams_org ON public.teams(organization_id);

-- ---------- TEAM MEMBERS ----------
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  member_role public.team_member_role NOT NULL DEFAULT 'member',
  valid_from date,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members_select_org" ON public.team_members FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY "team_members_write_admin" ON public.team_members FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_admin(organization_id) OR public.is_platform_admin());

CREATE TRIGGER trg_team_members_updated_at BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);

-- ---------- ORG POSITIONS (organigramma) ----------
CREATE TABLE IF NOT EXISTS public.org_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  user_id uuid,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES public.org_positions(id) ON DELETE SET NULL,
  base_role public.app_role,
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_positions TO authenticated;
GRANT ALL ON public.org_positions TO service_role;
ALTER TABLE public.org_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_positions_select_org" ON public.org_positions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY "org_positions_write_admin" ON public.org_positions FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_admin(organization_id) OR public.is_platform_admin());

CREATE TRIGGER trg_org_positions_updated_at BEFORE UPDATE ON public.org_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_org_positions_org ON public.org_positions(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_positions_manager ON public.org_positions(manager_id);

-- guard anti-ciclo + coerenza organizzazione
CREATE OR REPLACE FUNCTION public.guard_org_position_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cur uuid;
  v_org uuid;
  v_hops int := 0;
BEGIN
  IF NEW.manager_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'Una posizione non puo'' essere responsabile di se stessa';
  END IF;

  SELECT organization_id INTO v_org FROM public.org_positions WHERE id = NEW.manager_id;
  IF v_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Il responsabile deve appartenere alla stessa organizzazione';
  END IF;

  v_cur := NEW.manager_id;
  WHILE v_cur IS NOT NULL LOOP
    v_hops := v_hops + 1;
    IF v_hops > 200 THEN
      RAISE EXCEPTION 'Gerarchia organigramma troppo profonda o ciclica';
    END IF;
    IF v_cur = NEW.id THEN
      RAISE EXCEPTION 'Gerarchia circolare non consentita nell''organigramma';
    END IF;
    SELECT manager_id INTO v_cur FROM public.org_positions WHERE id = v_cur;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_org_positions_cycle
  BEFORE INSERT OR UPDATE OF manager_id, organization_id ON public.org_positions
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_position_cycle();

-- discendenti ricorsivi di una posizione
CREATE OR REPLACE FUNCTION public.org_reports(p_position uuid, p_include_self boolean DEFAULT false)
RETURNS TABLE(id uuid, organization_id uuid, title text, user_id uuid, manager_id uuid, depth integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE tree AS (
    SELECT p.id, p.organization_id, p.title, p.user_id, p.manager_id, 0 AS depth
    FROM public.org_positions p
    WHERE p.id = p_position
    UNION ALL
    SELECT c.id, c.organization_id, c.title, c.user_id, c.manager_id, t.depth + 1
    FROM public.org_positions c
    JOIN tree t ON c.manager_id = t.id
    WHERE t.depth < 50
  )
  SELECT t.id, t.organization_id, t.title, t.user_id, t.manager_id, t.depth
  FROM tree t
  WHERE (p_include_self OR t.depth > 0)
    AND (public.is_org_member(t.organization_id) OR public.is_platform_admin());
$$;

REVOKE ALL ON FUNCTION public.guard_org_position_cycle() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_reports(uuid, boolean) TO authenticated;

-- ---------- CALENDAR ENTRIES ----------
CREATE TABLE IF NOT EXISTS public.calendar_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  entry_type public.calendar_entry_type NOT NULL DEFAULT 'work',
  status public.calendar_entry_status NOT NULL DEFAULT 'confirmed',
  title text NOT NULL,
  notes text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  all_day boolean NOT NULL DEFAULT true,
  start_time time,
  end_time time,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_entries_dates_chk CHECK (end_date >= start_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_entries TO authenticated;
GRANT ALL ON public.calendar_entries TO service_role;
ALTER TABLE public.calendar_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_select_org" ON public.calendar_entries FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin());

CREATE POLICY "calendar_insert_self_or_admin" ON public.calendar_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(organization_id) OR public.is_platform_admin()
    OR (public.is_org_member(organization_id) AND user_id = auth.uid() AND created_by = auth.uid()
        AND status = 'requested'::public.calendar_entry_status)
  );

CREATE POLICY "calendar_update_self_pending_or_admin" ON public.calendar_entries FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(organization_id) OR public.is_platform_admin()
    OR (user_id = auth.uid() AND status = 'requested'::public.calendar_entry_status)
  )
  WITH CHECK (
    public.is_org_admin(organization_id) OR public.is_platform_admin()
    OR (user_id = auth.uid() AND status IN ('requested'::public.calendar_entry_status,
                                            'cancelled'::public.calendar_entry_status))
  );

CREATE POLICY "calendar_delete_self_pending_or_admin" ON public.calendar_entries FOR DELETE TO authenticated
  USING (
    public.is_org_admin(organization_id) OR public.is_platform_admin()
    OR (user_id = auth.uid() AND status = 'requested'::public.calendar_entry_status)
  );

CREATE TRIGGER trg_calendar_entries_updated_at BEFORE UPDATE ON public.calendar_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_calendar_org_dates ON public.calendar_entries(organization_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_user ON public.calendar_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_project ON public.calendar_entries(project_id);

-- ---------- SUPPLIERS: subappalto ----------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS is_subcontractor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- ---------- VISTA UNIFICATA ----------
CREATE OR REPLACE VIEW public.v_calendar
WITH (security_invoker = true) AS
  SELECT
    ce.id,
    'calendar'::text            AS source,
    ce.organization_id,
    ce.project_id,
    ce.task_id,
    ce.user_id                  AS assignee_id,
    ce.team_id,
    ce.supplier_id,
    ce.entry_type::text         AS entry_type,
    ce.status::text             AS status,
    ce.title,
    ce.start_date,
    ce.end_date,
    ce.all_day,
    ce.start_time,
    ce.end_time
  FROM public.calendar_entries ce
  UNION ALL
  SELECT
    pt.id,
    'task'::text                AS source,
    p.organization_id,
    pt.project_id,
    pt.id                       AS task_id,
    pt.assignee_id,
    NULL::uuid                  AS team_id,
    NULL::uuid                  AS supplier_id,
    'work'::text                AS entry_type,
    pt.status::text             AS status,
    pt.title,
    pt.start_date,
    COALESCE(pt.end_date, pt.start_date) AS end_date,
    true                        AS all_day,
    NULL::time                  AS start_time,
    NULL::time                  AS end_time
  FROM public.project_tasks pt
  JOIN public.projects p ON p.id = pt.project_id
  WHERE pt.start_date IS NOT NULL;

GRANT SELECT ON public.v_calendar TO authenticated;
GRANT SELECT ON public.v_calendar TO service_role;