BEGIN;

CREATE OR REPLACE FUNCTION public.can_see_costs(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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
            AND (
              COALESCE((
                SELECT po.value
                FROM public.permission_overrides po
                WHERE po.organization_id = p.organization_id
                  AND po.user_id = _user_id
                  AND po.capability = 'can_see_costs'
                ORDER BY po.updated_at DESC
                LIMIT 1
              ), EXISTS (
                SELECT 1
                FROM public.user_roles ur
                WHERE ur.organization_id = p.organization_id
                  AND ur.user_id = _user_id
                  AND ur.role IN (
                    'admin','ceo','coo','project_manager','qs',
                    'procurement_manager','accountant','head_of_payments'
                  )
              ))
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

REVOKE ALL ON FUNCTION public.can_see_costs(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_costs(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_see_costs()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE public.can_see_costs(auth.uid(), p.id)
  )
$fn$;

REVOKE ALL ON FUNCTION public.can_see_costs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_costs() TO authenticated, service_role;

CREATE TABLE public.project_item_costs (
  item_id uuid PRIMARY KEY REFERENCES public.project_items(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  unit_cost numeric,
  budget_unit_cost numeric,
  budget_estimate numeric DEFAULT 0,
  selling_price numeric,
  margin_percentage numeric DEFAULT 0,
  delivery_cost numeric DEFAULT 0,
  installation_cost numeric DEFAULT 0,
  insurance_cost numeric DEFAULT 0,
  duty_cost numeric DEFAULT 0,
  custom_cost numeric DEFAULT 0,
  boxing_cost numeric DEFAULT 0,
  shifting_cost numeric DEFAULT 0,
  extra_safe_cost numeric DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_item_costs TO authenticated;
GRANT ALL ON public.project_item_costs TO service_role;

ALTER TABLE public.project_item_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost roles read project item costs"
ON public.project_item_costs FOR SELECT TO authenticated
USING (public.can_see_costs(auth.uid(), project_id));

CREATE POLICY "cost roles insert project item costs"
ON public.project_item_costs FOR INSERT TO authenticated
WITH CHECK (
  public.can_see_costs(auth.uid(), project_id)
  AND EXISTS (
    SELECT 1 FROM public.project_items pi
    WHERE pi.id = project_item_costs.item_id
      AND pi.project_id = project_item_costs.project_id
  )
);

CREATE POLICY "cost roles update project item costs"
ON public.project_item_costs FOR UPDATE TO authenticated
USING (public.can_see_costs(auth.uid(), project_id))
WITH CHECK (
  public.can_see_costs(auth.uid(), project_id)
  AND EXISTS (
    SELECT 1 FROM public.project_items pi
    WHERE pi.id = project_item_costs.item_id
      AND pi.project_id = project_item_costs.project_id
  )
);

CREATE POLICY "cost roles delete project item costs"
ON public.project_item_costs FOR DELETE TO authenticated
USING (public.can_see_costs(auth.uid(), project_id));

CREATE TRIGGER project_item_costs_updated_at
BEFORE UPDATE ON public.project_item_costs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.project_item_costs (
  item_id, project_id, unit_cost, budget_unit_cost, budget_estimate,
  selling_price, margin_percentage, delivery_cost, installation_cost,
  insurance_cost, duty_cost, custom_cost, boxing_cost, shifting_cost,
  extra_safe_cost, updated_at, updated_by
)
SELECT
  id, project_id, unit_cost, budget_unit_cost, budget_estimate,
  selling_price, margin_percentage, delivery_cost, installation_cost,
  insurance_cost, duty_cost, custom_cost, boxing_cost, shifting_cost,
  extra_safe_cost, updated_at, created_by
FROM public.project_items
ON CONFLICT (item_id) DO NOTHING;

CREATE VIEW public.project_items_safe
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
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
FROM public.project_items;

REVOKE ALL ON public.project_items_safe FROM PUBLIC, anon;
GRANT SELECT ON public.project_items_safe TO authenticated, service_role;

REVOKE SELECT (
  unit_cost, budget_unit_cost, budget_estimate, selling_price,
  margin_percentage, delivery_cost, installation_cost, insurance_cost,
  duty_cost, custom_cost, boxing_cost, shifting_cost, extra_safe_cost
) ON public.project_items FROM authenticated;

DROP POLICY IF EXISTS members_view_quotations ON public.item_quotations;
DROP POLICY IF EXISTS owners_manage_quotations ON public.item_quotations;

CREATE POLICY "cost roles read quotations"
ON public.item_quotations FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_quotations.project_item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
));

CREATE POLICY "cost roles insert quotations"
ON public.item_quotations FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_quotations.project_item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
));

CREATE POLICY "cost roles update quotations"
ON public.item_quotations FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_quotations.project_item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_quotations.project_item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
));

CREATE POLICY "cost roles delete quotations"
ON public.item_quotations FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_quotations.project_item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
));

DROP POLICY IF EXISTS members_view_revisions ON public.item_revisions;
DROP POLICY IF EXISTS project_owner_manage_revisions ON public.item_revisions;

CREATE POLICY "cost roles read revisions"
ON public.item_revisions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_revisions.item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
));

CREATE POLICY "cost roles insert revisions"
ON public.item_revisions FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_revisions.item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
));

CREATE POLICY "cost roles update revisions"
ON public.item_revisions FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_revisions.item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_revisions.item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
));

CREATE POLICY "cost roles delete revisions"
ON public.item_revisions FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_revisions.item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
));

CREATE OR REPLACE FUNCTION public.log_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'item_revisions' THEN
    NEW.snapshot := COALESCE(NEW.snapshot, '{}'::jsonb)
      - 'unit_cost' - 'budget_unit_cost' - 'budget_estimate'
      - 'selling_price' - 'margin_percentage' - 'delivery_cost'
      - 'installation_cost' - 'insurance_cost' - 'duty_cost'
      - 'custom_cost' - 'boxing_cost' - 'shifting_cost'
      - 'extra_safe_cost';
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status THEN
    INSERT INTO public.audit_log (entity_type, entity_id, action, user_id, summary)
    VALUES ('item', NEW.id, 'status_change', auth.uid(),
      format('%s → %s | %s', COALESCE(OLD.lifecycle_status::text, 'null'), COALESCE(NEW.lifecycle_status::text, 'null'), COALESCE(NEW.item_code, NEW.description)));
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    INSERT INTO public.audit_log (entity_type, entity_id, action, user_id, summary)
    VALUES ('item', NEW.id,
      CASE WHEN NEW.approval_status = 'approved' THEN 'approve'
           WHEN NEW.approval_status = 'rejected' THEN 'reject'
           ELSE 'update' END,
      auth.uid(),
      format('approval: %s → %s | %s', OLD.approval_status::text, NEW.approval_status::text, COALESCE(NEW.item_code, NEW.description)));
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.revision_number IS DISTINCT FROM NEW.revision_number THEN
    INSERT INTO public.audit_log (entity_type, entity_id, action, user_id, summary)
    VALUES ('item', NEW.id, 'revision', auth.uid(),
      format('revision R%s → R%s | %s', COALESCE(OLD.revision_number, 1), COALESCE(NEW.revision_number, 1), COALESCE(NEW.item_code, NEW.description)));
  END IF;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (entity_type, entity_id, action, user_id, summary)
    VALUES ('item', OLD.id, 'delete', auth.uid(), format('deleted: %s', COALESCE(OLD.item_code, OLD.description)));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_sanitize_item_revision_snapshot ON public.item_revisions;
CREATE TRIGGER trg_sanitize_item_revision_snapshot
BEFORE INSERT OR UPDATE OF snapshot ON public.item_revisions
FOR EACH ROW EXECUTE FUNCTION public.log_item_change();

DROP POLICY IF EXISTS owners_manage_payments ON public.supplier_payments;
CREATE POLICY "cost roles manage supplier payments"
ON public.supplier_payments FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = supplier_payments.project_item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = supplier_payments.project_item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
));

DROP POLICY IF EXISTS owners_manage_item_costs ON public.item_costs;
CREATE POLICY "cost roles manage item costs"
ON public.item_costs FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_costs.project_item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_costs.project_item_id
    AND public.can_see_costs(auth.uid(), pi.project_id)
));

COMMIT;