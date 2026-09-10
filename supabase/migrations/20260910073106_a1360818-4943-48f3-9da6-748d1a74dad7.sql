DROP VIEW IF EXISTS public.project_items_secure;

DROP TRIGGER IF EXISTS trg_guard_item_cost_writes ON public.project_items;
DROP FUNCTION IF EXISTS public.guard_item_cost_writes();

CREATE OR REPLACE FUNCTION public.item_cost_values(p_item_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(x)
  FROM (
    SELECT
      c.unit_cost,
      c.budget_unit_cost,
      c.budget_estimate,
      c.selling_price,
      c.margin_percentage,
      c.delivery_cost,
      c.installation_cost,
      c.insurance_cost,
      c.duty_cost,
      c.custom_cost,
      c.boxing_cost,
      c.shifting_cost,
      c.extra_safe_cost
    FROM public.project_item_costs c
    WHERE c.item_id = p_item_id
      AND public.user_can_see_project_costs(auth.uid(), c.project_id)
  ) x
$$;

REVOKE ALL ON FUNCTION public.item_cost_values(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.item_cost_values(uuid) TO authenticated, service_role;

ALTER TABLE public.project_items
  DROP COLUMN unit_cost,
  DROP COLUMN selling_price,
  DROP COLUMN margin_percentage,
  DROP COLUMN budget_estimate,
  DROP COLUMN budget_unit_cost,
  DROP COLUMN delivery_cost,
  DROP COLUMN installation_cost,
  DROP COLUMN insurance_cost,
  DROP COLUMN duty_cost,
  DROP COLUMN custom_cost,
  DROP COLUMN boxing_cost,
  DROP COLUMN shifting_cost,
  DROP COLUMN extra_safe_cost;

DROP POLICY IF EXISTS "Cost authorized users can read full project items" ON public.project_items;
DROP POLICY IF EXISTS "Org members can insert org project items" ON public.project_items;
DROP POLICY IF EXISTS "Org members can update org project items" ON public.project_items;
DROP POLICY IF EXISTS "Org members can delete org project items" ON public.project_items;

CREATE POLICY "Members can view items of assigned projects"
ON public.project_items FOR SELECT TO authenticated
USING (public.is_project_member(project_id));

CREATE POLICY "Users can view items of their projects"
ON public.project_items FOR SELECT TO authenticated
USING (public.is_project_owner(project_id));

CREATE POLICY "Org members can access org project items"
ON public.project_items FOR ALL TO authenticated
USING (public.is_project_in_my_org(project_id) OR public.is_platform_admin())
WITH CHECK (public.is_project_in_my_org(project_id) OR public.is_platform_admin());

ALTER VIEW public.project_items_safe SET (security_invoker = true, security_barrier = true);

CREATE VIEW public.project_items_secure
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  i.*,
  c.unit_cost,
  c.budget_unit_cost,
  c.budget_estimate,
  c.selling_price,
  c.margin_percentage,
  c.delivery_cost,
  c.installation_cost,
  c.insurance_cost,
  c.duty_cost,
  c.custom_cost,
  c.boxing_cost,
  c.shifting_cost,
  c.extra_safe_cost
FROM public.project_items i
LEFT JOIN public.project_item_costs c
  ON c.item_id = i.id
 AND public.user_can_see_project_costs(auth.uid(), i.project_id);

REVOKE ALL ON public.project_items_secure FROM PUBLIC, anon;
GRANT SELECT ON public.project_items_secure TO authenticated, service_role;