CREATE TABLE public.permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  capability text NOT NULL CHECK (capability IN ('can_see_costs','can_see_prices','can_see_margins','can_edit_items','can_approve_gates')),
  value boolean NOT NULL,
  set_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, capability)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_overrides TO authenticated;
GRANT ALL ON public.permission_overrides TO service_role;

ALTER TABLE public.permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own or org admin"
ON public.permission_overrides FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_org_admin(organization_id)
  OR public.is_org_owner(organization_id)
  OR public.is_platform_admin()
);

CREATE POLICY "admins manage overrides"
ON public.permission_overrides FOR ALL TO authenticated
USING (
  (public.is_org_admin(organization_id) OR public.is_org_owner(organization_id) OR public.is_platform_admin())
  AND public.is_org_member(organization_id)
)
WITH CHECK (
  (public.is_org_admin(organization_id) OR public.is_org_owner(organization_id) OR public.is_platform_admin())
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = permission_overrides.organization_id
      AND om.user_id = permission_overrides.user_id
  )
);

CREATE TRIGGER trg_permission_overrides_updated_at
BEFORE UPDATE ON public.permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.permission_overrides (organization_id, user_id, capability, value, set_by, created_at, updated_at)
SELECT o.organization_id, o.user_id, 'can_see_costs', o.can_see_costs, o.set_by, o.created_at, o.updated_at
FROM public.cost_visibility_overrides o
ON CONFLICT (organization_id, user_id, capability) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_capability(_capability text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    SELECT p.value
    FROM public.permission_overrides p
    JOIN public.organization_members om
      ON om.organization_id = p.organization_id AND om.user_id = p.user_id
    WHERE p.user_id = auth.uid() AND p.capability = _capability
    ORDER BY p.updated_at DESC
    LIMIT 1
  )
$$;

REVOKE ALL ON FUNCTION public.has_capability(text) FROM anon;

CREATE OR REPLACE FUNCTION public.can_see_costs()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    public.has_capability('can_see_costs'),
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','accountant','qs','head_of_payments','ceo')
    )
  )
$$;