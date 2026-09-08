GRANT SELECT (
  id, project_id, category, area, description, image_3d_ref, boq_included,
  approval_status, purchased, purchase_order_ref, production_due_date,
  delivery_date, received, received_date, installed, installed_date, supplier,
  quantity, notes, created_at, updated_at, item_code, lifecycle_status,
  floor_id, room_id, item_type_id, subcategory_id, apartment_number,
  finish_material, finish_color, finish_notes, parent_item_id,
  is_selected_option, dimensions, room_number, production_time,
  reference_image_url, technical_drawing_url, company_product_url,
  site_movement_date, installation_start_date, sequence_number,
  revision_number, is_active, created_by, locked_fields, quotation_ref,
  po_number, proforma_url, approval_checklist, dynamic_finishes, is_custom
) ON public.project_items TO authenticated;

ALTER VIEW public.project_items_safe SET (security_invoker = true);