-- Archived from edge function run-migration-secfix5 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- 1) Trigger-only function must not be callable from the API roles ----------
REVOKE EXECUTE ON FUNCTION public.sync_project_membership() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sync_project_membership() TO service_role;

-- 2) Cost / margin columns: no direct reads ---------------------------------
REVOKE ALL ON public.project_items FROM anon;

DO $do$
DECLARE
  cost_cols text[] := ARRAY['unit_cost','budget_unit_cost','budget_estimate','selling_price',
    'margin_percentage','delivery_cost','installation_cost','insurance_cost','duty_cost',
    'custom_cost','boxing_cost','shifting_cost','extra_safe_cost'];
  safe_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO safe_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'project_items'
     AND NOT (column_name = ANY(cost_cols));

  -- table-level SELECT implies every column, so replace it with a column list
  EXECUTE 'REVOKE SELECT ON public.project_items FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.project_items TO authenticated', safe_cols);
END $do$;


-- 3) Cost / margin columns: writes only for cost-visible roles --------------
CREATE OR REPLACE FUNCTION public.guard_item_cost_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  changed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service_role / internal jobs
  END IF;
  IF public.can_see_costs() THEN
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
    RAISE EXCEPTION 'not authorized to modify cost or margin fields'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.guard_item_cost_writes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_item_cost_writes ON public.project_items;
CREATE TRIGGER trg_guard_item_cost_writes
  BEFORE INSERT OR UPDATE ON public.project_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_item_cost_writes();

COMMIT;

