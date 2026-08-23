-- Archived from edge function run-migration-block2 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- 1. Storage limit (bytes). Business = bigint max so JS can compare without nulls.
CREATE OR REPLACE FUNCTION public.tier_storage_limit_bytes(t public.subscription_tier)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE t
    WHEN 'starter'  THEN  2::bigint * 1024 * 1024 * 1024
    WHEN 'pro'      THEN 10::bigint * 1024 * 1024 * 1024
    WHEN 'business' THEN 9223372036854775807::bigint
  END
$$;

-- 2. Effective tier (respects subscription status + grace window).
CREATE OR REPLACE FUNCTION public.get_org_effective_tier(_org_id uuid)
RETURNS public.subscription_tier
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (
      SELECT s.tier
      FROM public.organization_subscriptions s
      WHERE s.organization_id = _org_id
        AND s.status IN ('active','grace')
        AND (s.grace_until IS NULL OR s.grace_until > now())
      LIMIT 1
    ),
    'starter'::public.subscription_tier
  )
$$;

-- 3. Active project count (excludes archived).
CREATE OR REPLACE FUNCTION public.get_org_active_project_count(_org_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int
  FROM public.projects p
  WHERE p.organization_id = _org_id
    AND p.archived_at IS NULL
$$;

-- 4. Enforcement trigger on projects.
CREATE OR REPLACE FUNCTION public.enforce_project_tier_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tier  public.subscription_tier;
  v_limit integer;
  v_count integer;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_tier  := public.get_org_effective_tier(NEW.organization_id);
  v_limit := public.tier_project_limit(v_tier);
  v_count := public.get_org_active_project_count(NEW.organization_id);
  IF v_count >= v_limit THEN
    RAISE EXCEPTION
      'Project limit reached for tier % (% active / % allowed). Upgrade your plan to create more projects.',
      v_tier, v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_project_tier_limit ON public.projects;
CREATE TRIGGER trg_enforce_project_tier_limit
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_project_tier_limit();

-- 5. Per-caller subscription summary RPC.
CREATE OR REPLACE FUNCTION public.get_my_org_subscription_summary()
RETURNS TABLE (
  organization_id     uuid,
  organization_name   text,
  tier                public.subscription_tier,
  status              public.subscription_status,
  current_period_end  timestamptz,
  project_limit       integer,
  projects_used       integer,
  storage_limit_bytes bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH org AS (
    SELECT m.organization_id
    FROM public.organization_members m
    WHERE m.user_id = auth.uid()
    ORDER BY m.joined_at ASC, m.is_owner DESC
    LIMIT 1
  )
  SELECT
    o.id,
    o.name,
    public.get_org_effective_tier(o.id),
    COALESCE(s.status, 'suspended'::public.subscription_status),
    s.current_period_end,
    public.tier_project_limit(public.get_org_effective_tier(o.id)),
    public.get_org_active_project_count(o.id),
    public.tier_storage_limit_bytes(public.get_org_effective_tier(o.id))
  FROM org
  JOIN public.organizations o ON o.id = org.organization_id
  LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
$$;

GRANT EXECUTE ON FUNCTION public.get_my_org_subscription_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_effective_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_active_project_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tier_storage_limit_bytes(public.subscription_tier) TO authenticated;

COMMIT;

