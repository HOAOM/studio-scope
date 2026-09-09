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
      COALESCE(c.unit_cost, i.unit_cost)                 AS unit_cost,
      COALESCE(c.budget_unit_cost, i.budget_unit_cost)   AS budget_unit_cost,
      COALESCE(c.budget_estimate, i.budget_estimate)     AS budget_estimate,
      COALESCE(c.selling_price, i.selling_price)         AS selling_price,
      COALESCE(c.margin_percentage, i.margin_percentage) AS margin_percentage,
      COALESCE(c.delivery_cost, i.delivery_cost)         AS delivery_cost,
      COALESCE(c.installation_cost, i.installation_cost) AS installation_cost,
      COALESCE(c.insurance_cost, i.insurance_cost)       AS insurance_cost,
      COALESCE(c.duty_cost, i.duty_cost)                 AS duty_cost,
      COALESCE(c.custom_cost, i.custom_cost)             AS custom_cost,
      COALESCE(c.boxing_cost, i.boxing_cost)             AS boxing_cost,
      COALESCE(c.shifting_cost, i.shifting_cost)         AS shifting_cost,
      COALESCE(c.extra_safe_cost, i.extra_safe_cost)     AS extra_safe_cost
    FROM public.project_items i
    LEFT JOIN public.project_item_costs c ON c.item_id = i.id
    WHERE i.id = p_item_id
      AND public.can_see_costs()
      AND (
        public.is_project_in_my_org(i.project_id)
        OR public.is_project_member(i.project_id)
        OR public.is_project_owner(i.project_id)
      )
  ) x
$$;