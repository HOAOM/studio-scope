-- 1. org_positions: tipo scheda, appaltatore, catalogo
ALTER TABLE public.org_positions
  ADD COLUMN IF NOT EXISTS node_kind text NOT NULL DEFAULT 'person',
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_id uuid;

ALTER TABLE public.org_positions
  DROP CONSTRAINT IF EXISTS org_positions_node_kind_chk;
ALTER TABLE public.org_positions
  ADD CONSTRAINT org_positions_node_kind_chk
  CHECK (node_kind IN ('person','team','unit','contractor'));

CREATE INDEX IF NOT EXISTS idx_org_positions_org_manager
  ON public.org_positions (organization_id, manager_id);

-- 2. team_members: squadra primaria
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_primary
  ON public.team_members (organization_id, user_id)
  WHERE is_primary;

-- 3. profiles.phone
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

-- 4. catalogo posizioni master (globale, sola lettura)
CREATE TABLE IF NOT EXISTS public.position_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('L1_L2','L3','L4')),
  area text NOT NULL,
  title text NOT NULL,
  parent_title text,
  is_lead boolean NOT NULL DEFAULT false,
  min_size text NOT NULL DEFAULT 'small' CHECK (min_size IN ('small','medium','large')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_position_catalog_title
  ON public.position_catalog (level, area, title);

GRANT SELECT ON public.position_catalog TO authenticated;
GRANT ALL ON public.position_catalog TO service_role;

ALTER TABLE public.position_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog readable by authenticated" ON public.position_catalog;
CREATE POLICY "catalog readable by authenticated"
  ON public.position_catalog FOR SELECT TO authenticated USING (true);

ALTER TABLE public.org_positions
  DROP CONSTRAINT IF EXISTS org_positions_catalog_fk;
ALTER TABLE public.org_positions
  ADD CONSTRAINT org_positions_catalog_fk
  FOREIGN KEY (catalog_id) REFERENCES public.position_catalog(id) ON DELETE SET NULL;

-- 5. override individuale visibilita' costi
CREATE TABLE IF NOT EXISTS public.cost_visibility_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  can_see_costs boolean NOT NULL,
  set_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_visibility_overrides TO authenticated;
GRANT ALL ON public.cost_visibility_overrides TO service_role;

ALTER TABLE public.cost_visibility_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cvo read in org" ON public.cost_visibility_overrides;
CREATE POLICY "cvo read in org"
  ON public.cost_visibility_overrides FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "cvo write by org admin" ON public.cost_visibility_overrides;
CREATE POLICY "cvo write by org admin"
  ON public.cost_visibility_overrides FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_org_owner(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_admin(organization_id) OR public.is_org_owner(organization_id) OR public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.touch_cost_visibility_overrides()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_cvo ON public.cost_visibility_overrides;
CREATE TRIGGER trg_touch_cvo
  BEFORE UPDATE ON public.cost_visibility_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_cost_visibility_overrides();

-- 6. can_see_costs(): override individuale prima del ruolo
CREATE OR REPLACE FUNCTION public.can_see_costs()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT o.can_see_costs
      FROM public.cost_visibility_overrides o
      JOIN public.organization_members om
        ON om.organization_id = o.organization_id AND om.user_id = o.user_id
      WHERE o.user_id = auth.uid()
      ORDER BY o.updated_at DESC
      LIMIT 1
    ),
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','accountant','qs','head_of_payments','ceo')
    )
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.touch_cost_visibility_overrides() FROM PUBLIC, anon, authenticated;