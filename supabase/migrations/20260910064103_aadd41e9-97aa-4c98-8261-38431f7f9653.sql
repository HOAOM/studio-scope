CREATE TABLE IF NOT EXISTS public.organization_limit_overrides (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  max_active_projects integer,
  max_storage_bytes bigint,
  max_addons integer,
  max_users_per_role integer,
  max_roles_per_user integer,
  max_super_role_extra integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_limit_overrides TO authenticated;
GRANT ALL ON public.organization_limit_overrides TO service_role;

ALTER TABLE public.organization_limit_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_limit_overrides_read ON public.organization_limit_overrides;
CREATE POLICY org_limit_overrides_read ON public.organization_limit_overrides
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS org_limit_overrides_platform_write ON public.organization_limit_overrides;
CREATE POLICY org_limit_overrides_platform_write ON public.organization_limit_overrides
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_org_limit_overrides()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END $fn$;

DROP TRIGGER IF EXISTS trg_touch_org_limit_overrides ON public.organization_limit_overrides;
CREATE TRIGGER trg_touch_org_limit_overrides
  BEFORE UPDATE ON public.organization_limit_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_org_limit_overrides();

CREATE OR REPLACE FUNCTION public.get_tier_limits(p_org uuid)
RETURNS public.tier_limits
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT jsonb_populate_record(
    NULL::public.tier_limits,
    to_jsonb(l) || COALESCE(
      CASE WHEN l.tier = 'enterprise' AND ov.organization_id IS NOT NULL
           THEN jsonb_strip_nulls(
                  to_jsonb(ov) - 'organization_id' - 'created_at' - 'updated_at')
      END, '{}'::jsonb)
  )
  FROM public.tier_limits l
  LEFT JOIN public.organization_limit_overrides ov ON ov.organization_id = p_org
  WHERE l.tier = public.get_org_effective_tier(p_org)
$fn$;

REVOKE ALL ON FUNCTION public.get_tier_limits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tier_limits(uuid) TO authenticated, service_role;