-- Archived from edge function run-migration-phase4 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- 1. Schema additions on projects -------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE INDEX IF NOT EXISTS idx_projects_org_active
  ON public.projects (organization_id)
  WHERE archived_at IS NULL;

-- 2. Reopen log --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_reopen_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL,
  organization_id uuid NOT NULL,
  reopened_by   uuid,
  reopened_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reopen_log_org_time
  ON public.project_reopen_log (organization_id, reopened_at DESC);

ALTER TABLE public.project_reopen_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view reopen log" ON public.project_reopen_log;
CREATE POLICY "members view reopen log"
  ON public.project_reopen_log FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin manages reopen log" ON public.project_reopen_log;
CREATE POLICY "admin manages reopen log"
  ON public.project_reopen_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Helpers ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tier_project_limit(t public.subscription_tier)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'starter'  THEN 2
    WHEN 'pro'      THEN 8
    WHEN 'business' THEN 2147483647
  END
$$;

CREATE OR REPLACE FUNCTION public.org_active_project_count(p_org uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.projects
  WHERE organization_id = p_org AND archived_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.org_can_activate_project(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.org_active_project_count(p_org) <
    public.tier_project_limit(
      (SELECT tier FROM public.organization_subscriptions WHERE organization_id = p_org)
    )
$$;

CREATE OR REPLACE FUNCTION public.org_reopen_count_this_month(p_org uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.project_reopen_log
  WHERE organization_id = p_org
    AND reopened_at >= date_trunc('month', now())
$$;

-- 4. Enforcement trigger ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_project_archive_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin   boolean := public.has_role(auth.uid(), 'admin');
  v_unarchive  boolean := FALSE;
  v_create_act boolean := FALSE;
  v_limit      integer;
  v_count      integer;
  v_tier       public.subscription_tier;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW; -- legacy rows w/o org: skip
  END IF;

  IF TG_OP = 'INSERT' AND NEW.archived_at IS NULL THEN
    v_create_act := TRUE;
  ELSIF TG_OP = 'UPDATE'
    AND OLD.archived_at IS NOT NULL
    AND NEW.archived_at IS NULL THEN
    v_unarchive := TRUE;
  END IF;

  IF NOT (v_create_act OR v_unarchive) THEN
    RETURN NEW;
  END IF;

  IF v_is_admin THEN
    -- admin bypasses limits but reopen is still logged below
    IF v_unarchive THEN
      INSERT INTO public.project_reopen_log (project_id, organization_id, reopened_by)
      VALUES (NEW.id, NEW.organization_id, auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  SELECT tier INTO v_tier FROM public.organization_subscriptions
   WHERE organization_id = NEW.organization_id;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'organization has no subscription' USING ERRCODE = '22023';
  END IF;
  v_limit := public.tier_project_limit(v_tier);

  SELECT count(*) INTO v_count FROM public.projects
   WHERE organization_id = NEW.organization_id
     AND archived_at IS NULL
     AND id <> NEW.id;
  IF v_count + 1 > v_limit THEN
    RAISE EXCEPTION 'active project limit reached for tier % (limit %)', v_tier, v_limit
      USING ERRCODE = '22023';
  END IF;

  IF v_unarchive THEN
    IF public.org_reopen_count_this_month(NEW.organization_id) >= 2 THEN
      RAISE EXCEPTION 'reopen quota exceeded for this month (max 2)'
        USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.project_reopen_log (project_id, organization_id, reopened_by)
    VALUES (NEW.id, NEW.organization_id, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_project_archive_rules ON public.projects;
CREATE TRIGGER trg_enforce_project_archive_rules
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_project_archive_rules();

COMMIT;

