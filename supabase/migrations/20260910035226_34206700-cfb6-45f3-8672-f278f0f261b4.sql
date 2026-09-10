BEGIN;

-- 1) Funzione unica per la visibilità costi -------------------------------
CREATE OR REPLACE FUNCTION public.user_can_see_project_costs(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
              SELECT 1 FROM public.organization_members om
              WHERE om.organization_id = p.organization_id AND om.user_id = _user_id
            )
            AND EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.organization_id = p.organization_id
                AND ur.user_id = _user_id
                AND ur.role IN ('admin','ceo','coo','project_manager','qs',
                                'procurement_manager','accountant','head_of_payments')
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
REVOKE ALL ON FUNCTION public.user_can_see_project_costs(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_see_project_costs(uuid, uuid) TO authenticated, service_role;

-- policies -> nuova funzione
DROP POLICY IF EXISTS "cost roles manage item costs" ON public.item_costs;
CREATE POLICY "cost roles manage item costs" ON public.item_costs FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_costs.project_item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_costs.project_item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)));

DROP POLICY IF EXISTS "cost roles read quotations" ON public.item_quotations;
CREATE POLICY "cost roles read quotations" ON public.item_quotations FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_quotations.project_item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)));
DROP POLICY IF EXISTS "cost roles insert quotations" ON public.item_quotations;
CREATE POLICY "cost roles insert quotations" ON public.item_quotations FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_quotations.project_item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)));
DROP POLICY IF EXISTS "cost roles update quotations" ON public.item_quotations;
CREATE POLICY "cost roles update quotations" ON public.item_quotations FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_quotations.project_item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_quotations.project_item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)));
DROP POLICY IF EXISTS "cost roles delete quotations" ON public.item_quotations;
CREATE POLICY "cost roles delete quotations" ON public.item_quotations FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_quotations.project_item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)));

DROP POLICY IF EXISTS "cost roles read revisions" ON public.item_revisions;
CREATE POLICY "cost roles read revisions" ON public.item_revisions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_revisions.item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)));
DROP POLICY IF EXISTS "cost roles insert revisions" ON public.item_revisions;
CREATE POLICY "cost roles insert revisions" ON public.item_revisions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_revisions.item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)));
DROP POLICY IF EXISTS "cost roles update revisions" ON public.item_revisions;
CREATE POLICY "cost roles update revisions" ON public.item_revisions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_revisions.item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_revisions.item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)));
DROP POLICY IF EXISTS "cost roles delete revisions" ON public.item_revisions;
CREATE POLICY "cost roles delete revisions" ON public.item_revisions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = item_revisions.item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)));

DROP POLICY IF EXISTS "cost roles read project item costs" ON public.project_item_costs;
CREATE POLICY "cost roles read project item costs" ON public.project_item_costs FOR SELECT TO authenticated
USING (public.user_can_see_project_costs(auth.uid(), project_id));
DROP POLICY IF EXISTS "cost roles insert project item costs" ON public.project_item_costs;
CREATE POLICY "cost roles insert project item costs" ON public.project_item_costs FOR INSERT TO authenticated
WITH CHECK (public.user_can_see_project_costs(auth.uid(), project_id)
  AND EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = project_item_costs.item_id AND pi.project_id = project_item_costs.project_id));
DROP POLICY IF EXISTS "cost roles update project item costs" ON public.project_item_costs;
CREATE POLICY "cost roles update project item costs" ON public.project_item_costs FOR UPDATE TO authenticated
USING (public.user_can_see_project_costs(auth.uid(), project_id))
WITH CHECK (public.user_can_see_project_costs(auth.uid(), project_id)
  AND EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = project_item_costs.item_id AND pi.project_id = project_item_costs.project_id));
DROP POLICY IF EXISTS "cost roles delete project item costs" ON public.project_item_costs;
CREATE POLICY "cost roles delete project item costs" ON public.project_item_costs FOR DELETE TO authenticated
USING (public.user_can_see_project_costs(auth.uid(), project_id));

DROP POLICY IF EXISTS "cost roles manage supplier payments" ON public.supplier_payments;
CREATE POLICY "cost roles manage supplier payments" ON public.supplier_payments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = supplier_payments.project_item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.project_items pi WHERE pi.id = supplier_payments.project_item_id AND public.user_can_see_project_costs(auth.uid(), pi.project_id)));

-- funzioni dipendenti -> nuova funzione, project-scoped
CREATE OR REPLACE FUNCTION public.item_cost_values(p_item_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
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
      AND public.user_can_see_project_costs(auth.uid(), i.project_id)
  ) x
$fn$;

CREATE OR REPLACE FUNCTION public.guard_item_cost_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  changed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.user_can_see_project_costs(auth.uid(), NEW.project_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    changed := COALESCE(NEW.unit_cost, NEW.budget_unit_cost, NEW.budget_estimate,
                        NEW.selling_price, NEW.margin_percentage, NEW.delivery_cost,
                        NEW.installation_cost, NEW.insurance_cost, NEW.duty_cost,
                        NEW.custom_cost, NEW.boxing_cost, NEW.shifting_cost,
                        NEW.extra_safe_cost) IS NOT NULL;
  ELSE
    changed :=
      NEW.unit_cost         IS DISTINCT FROM OLD.unit_cost         OR
      NEW.budget_unit_cost  IS DISTINCT FROM OLD.budget_unit_cost  OR
      NEW.budget_estimate   IS DISTINCT FROM OLD.budget_estimate   OR
      NEW.selling_price     IS DISTINCT FROM OLD.selling_price     OR
      NEW.margin_percentage IS DISTINCT FROM OLD.margin_percentage OR
      NEW.delivery_cost     IS DISTINCT FROM OLD.delivery_cost     OR
      NEW.installation_cost IS DISTINCT FROM OLD.installation_cost OR
      NEW.insurance_cost    IS DISTINCT FROM OLD.insurance_cost    OR
      NEW.duty_cost         IS DISTINCT FROM OLD.duty_cost         OR
      NEW.custom_cost       IS DISTINCT FROM OLD.custom_cost       OR
      NEW.boxing_cost       IS DISTINCT FROM OLD.boxing_cost       OR
      NEW.shifting_cost     IS DISTINCT FROM OLD.shifting_cost     OR
      NEW.extra_safe_cost   IS DISTINCT FROM OLD.extra_safe_cost;
  END IF;

  IF changed THEN
    RAISE EXCEPTION 'not authorized to modify cost or margin fields' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_item_cost_writes() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.can_see_costs();
DROP FUNCTION IF EXISTS public.can_see_costs(uuid, uuid);

-- 2) item_messages: solo partecipanti reali del progetto -------------------
DROP POLICY IF EXISTS "members_view_item_messages" ON public.item_messages;
CREATE POLICY "members_view_item_messages" ON public.item_messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_messages.project_item_id
    AND (public.is_project_member(pi.project_id) OR public.is_project_owner(pi.project_id))
));
DROP POLICY IF EXISTS "members_insert_item_messages" ON public.item_messages;
CREATE POLICY "members_insert_item_messages" ON public.item_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.project_items pi
  WHERE pi.id = item_messages.project_item_id
    AND (public.is_project_member(pi.project_id) OR public.is_project_owner(pi.project_id))
));

-- 3) gerarchia ruoli centralizzata ----------------------------------------
CREATE OR REPLACE FUNCTION public.is_elevated_app_role(_role public.app_role)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $fn$ SELECT _role IN ('admin'::public.app_role, 'ceo'::public.app_role, 'coo'::public.app_role) $fn$;

CREATE OR REPLACE FUNCTION public.guard_role_assignment_hierarchy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  actor uuid := auth.uid();
  target_is_owner boolean;
BEGIN
  IF actor IS NULL THEN
    RETURN NEW; -- service_role / job interni
  END IF;
  IF public.is_platform_admin(actor) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(bool_or(om.is_owner), false) INTO target_is_owner
  FROM public.organization_members om
  WHERE om.organization_id = NEW.organization_id AND om.user_id = NEW.user_id;

  -- bootstrap: il titolare dell'organizzazione riceve 'admin'
  IF public.is_elevated_app_role(NEW.role) AND target_is_owner AND NEW.role = 'admin'::public.app_role THEN
    RETURN NEW;
  END IF;

  IF public.is_elevated_app_role(NEW.role) THEN
    RAISE EXCEPTION 'Ruolo elevato assegnabile solo dal platform admin' USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id = actor THEN
    RAISE EXCEPTION 'Non puoi assegnare o modificare un ruolo su te stesso' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.guard_role_assignment_hierarchy() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_role_assignment_hierarchy ON public.user_roles;
CREATE TRIGGER trg_guard_role_assignment_hierarchy
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_role_assignment_hierarchy();

COMMIT;