-- Archived from edge function run-migration-secfix4 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- 1) Guarded accessor for financial columns ---------------------------------
CREATE OR REPLACE FUNCTION public.item_cost_values(p_item_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT to_jsonb(x)
  FROM (
    SELECT i.unit_cost, i.budget_unit_cost, i.budget_estimate, i.selling_price,
           i.margin_percentage, i.delivery_cost, i.installation_cost,
           i.insurance_cost, i.duty_cost, i.custom_cost, i.boxing_cost,
           i.shifting_cost, i.extra_safe_cost
    FROM public.project_items i
    WHERE i.id = p_item_id
      AND public.can_see_costs()
      AND (
        public.is_project_in_my_org(i.project_id)
        OR public.is_project_member(i.project_id)
        OR public.is_project_owner(i.project_id)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
  ) x
$fn$;

REVOKE ALL   ON FUNCTION public.item_cost_values(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.item_cost_values(uuid) TO authenticated, service_role;

-- 2) Recreate the read surface as a SECURITY INVOKER view --------------------
DROP VIEW IF EXISTS public.project_items_secure;

CREATE VIEW public.project_items_secure
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  i.id, i.project_id, i.category, i.area, i.description, i.image_3d_ref,
  i.boq_included, i.approval_status, i.purchased, i.purchase_order_ref,
  i.production_due_date, i.delivery_date, i.received, i.received_date,
  i.installed, i.installed_date, i.supplier, i.quantity, i.notes,
  i.created_at, i.updated_at, i.item_code, i.lifecycle_status, i.floor_id,
  i.room_id, i.item_type_id, i.subcategory_id, i.apartment_number,
  i.finish_material, i.finish_color, i.finish_notes, i.parent_item_id,
  i.is_selected_option, i.dimensions, i.room_number, i.production_time,
  i.reference_image_url, i.technical_drawing_url, i.company_product_url,
  i.site_movement_date, i.installation_start_date, i.sequence_number,
  i.revision_number, i.is_active, i.created_by, i.locked_fields,
  i.quotation_ref, i.po_number, i.proforma_url, i.approval_checklist,
  i.dynamic_finishes,
  (c.v->>'unit_cost')::numeric         AS unit_cost,
  (c.v->>'budget_unit_cost')::numeric  AS budget_unit_cost,
  (c.v->>'budget_estimate')::numeric   AS budget_estimate,
  (c.v->>'selling_price')::numeric     AS selling_price,
  (c.v->>'margin_percentage')::numeric AS margin_percentage,
  (c.v->>'delivery_cost')::numeric     AS delivery_cost,
  (c.v->>'installation_cost')::numeric AS installation_cost,
  (c.v->>'insurance_cost')::numeric    AS insurance_cost,
  (c.v->>'duty_cost')::numeric         AS duty_cost,
  (c.v->>'custom_cost')::numeric       AS custom_cost,
  (c.v->>'boxing_cost')::numeric       AS boxing_cost,
  (c.v->>'shifting_cost')::numeric     AS shifting_cost,
  (c.v->>'extra_safe_cost')::numeric   AS extra_safe_cost
FROM public.project_items i
LEFT JOIN LATERAL (SELECT public.item_cost_values(i.id) AS v) c ON true;

REVOKE ALL ON public.project_items_secure FROM PUBLIC, anon;
GRANT SELECT ON public.project_items_secure TO authenticated, service_role;

-- 3) Domain verification tokens: service role only --------------------------
REVOKE SELECT (verification_token) ON public.organization_domains FROM anon, authenticated;

COMMIT;

