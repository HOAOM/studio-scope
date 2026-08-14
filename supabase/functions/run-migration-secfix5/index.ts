/**
 * run-migration-secfix5 — Security fixes.
 * 1) Revoke EXECUTE on the trigger-only SECURITY DEFINER function
 *    sync_project_membership() from PUBLIC/anon/authenticated.
 * 2) project_items: cost/margin columns are no longer readable directly by
 *    anon/authenticated (reads go through public.project_items_secure /
 *    public.item_cost_values), and writes to those columns are blocked by a
 *    trigger unless public.can_see_costs() is true.
 * Idempotent. Requires x-site-api-key.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- 1) Trigger-only function must not be callable from the API roles ----------
REVOKE EXECUTE ON FUNCTION public.sync_project_membership() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sync_project_membership() TO service_role;

-- 2) Cost / margin columns: no direct reads ---------------------------------
REVOKE ALL ON public.project_items FROM anon;
REVOKE SELECT (
  unit_cost, budget_unit_cost, budget_estimate, selling_price, margin_percentage,
  delivery_cost, installation_cost, insurance_cost, duty_cost, custom_cost,
  boxing_cost, shifting_cost, extra_safe_cost
) ON public.project_items FROM anon, authenticated;

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
`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const key = req.headers.get("x-site-api-key");
  if (!key || key !== Deno.env.get("SITE_API_KEY")) {
    return json({ error: "forbidden" }, 403);
  }

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    return json({ ok: true, message: "secfix5 applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
