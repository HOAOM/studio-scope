CREATE OR REPLACE FUNCTION public.can_see_costs(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
  SELECT
    _user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = _project_id
        AND p.organization_id IS NOT NULL
        AND (
          (
            EXISTS (
              SELECT 1
              FROM public.organization_members om
              WHERE om.organization_id = p.organization_id
                AND om.user_id = _user_id
            )
            AND EXISTS (
              SELECT 1
              FROM public.user_roles ur
              WHERE ur.organization_id = p.organization_id
                AND ur.user_id = _user_id
                AND ur.role IN (
                  'admin','ceo','coo','project_manager','qs',
                  'procurement_manager','accountant','head_of_payments'
                )
            )
          )
          OR (
            _user_id = auth.uid()
            AND public.is_platform_admin(_user_id)
            AND public.impersonating_org() = p.organization_id
          )
        )
    )
$fn$;

CREATE OR REPLACE VIEW public.project_items_safe
WITH (security_barrier = true)
AS
SELECT
  i.id, i.project_id, i.category, i.area, i.description, i.image_3d_ref,
  i.boq_included, i.approval_status, i.purchased, i.purchase_order_ref,
  i.production_due_date, i.delivery_date, i.received, i.received_date,
  i.installed, i.installed_date, i.supplier, i.quantity, i.notes,
  i.created_at, i.updated_at, i.item_code, i.lifecycle_status,
  i.floor_id, i.room_id, i.item_type_id, i.subcategory_id, i.apartment_number,
  i.finish_material, i.finish_color, i.finish_notes, i.parent_item_id,
  i.is_selected_option, i.dimensions, i.room_number, i.production_time,
  i.reference_image_url, i.technical_drawing_url, i.company_product_url,
  i.site_movement_date, i.installation_start_date, i.sequence_number,
  i.revision_number, i.is_active, i.created_by, i.locked_fields,
  i.quotation_ref, i.po_number, i.proforma_url, i.approval_checklist,
  i.dynamic_finishes, i.is_custom
FROM public.project_items i
WHERE public.is_project_member(i.project_id)
   OR public.is_project_owner(i.project_id)
   OR public.is_project_in_my_org(i.project_id)
   OR public.is_platform_admin();

REVOKE ALL ON public.project_items_safe FROM PUBLIC, anon;
GRANT SELECT ON public.project_items_safe TO authenticated, service_role;