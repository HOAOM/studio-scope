/**
 * run-migration-secfix3 — Security fixes.
 * 1) Revoke EXECUTE from authenticated on SECURITY DEFINER functions that are
 *    only invoked server-side (service_role) — discount/referral helpers.
 * 2) Hide cost/margin columns of public.project_items from roles that must not
 *    see them (client, designer, ...) via column-level revoke + a hardened view.
 * Idempotent. Requires x-site-api-key.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- 1) Discount / referral helpers are only called from edge functions with the
--    service role. Signed-in users must not be able to invoke them directly.
REVOKE EXECUTE ON FUNCTION public.apply_referral(text, uuid)                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_discount(text, uuid)                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_discount(text, uuid, public.subscription_tier) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_referral(text, uuid)                              TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_discount(text, uuid)                             TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_discount(text, uuid, public.subscription_tier) TO service_role;

-- 2) Cost / margin protection on project_items -------------------------------

CREATE OR REPLACE FUNCTION public.can_see_costs()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','accountant','qs','head_of_payments','ceo')
  )
$fn$;
REVOKE EXECUTE ON FUNCTION public.can_see_costs() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_see_costs() TO authenticated, service_role;

-- Remove direct column-level read access to financial data.
REVOKE SELECT (
  unit_cost, budget_unit_cost, budget_estimate, selling_price, margin_percentage,
  delivery_cost, installation_cost, insurance_cost, duty_cost, custom_cost,
  boxing_cost, shifting_cost, extra_safe_cost
) ON public.project_items FROM anon, authenticated;

-- Hardened read surface: same rows as RLS would allow, financial columns
-- returned only to cost-visible roles.
CREATE OR REPLACE VIEW public.project_items_secure
WITH (security_barrier = true) AS
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
  CASE WHEN public.can_see_costs() THEN i.unit_cost          END AS unit_cost,
  CASE WHEN public.can_see_costs() THEN i.budget_unit_cost   END AS budget_unit_cost,
  CASE WHEN public.can_see_costs() THEN i.budget_estimate    END AS budget_estimate,
  CASE WHEN public.can_see_costs() THEN i.selling_price      END AS selling_price,
  CASE WHEN public.can_see_costs() THEN i.margin_percentage  END AS margin_percentage,
  CASE WHEN public.can_see_costs() THEN i.delivery_cost      END AS delivery_cost,
  CASE WHEN public.can_see_costs() THEN i.installation_cost  END AS installation_cost,
  CASE WHEN public.can_see_costs() THEN i.insurance_cost     END AS insurance_cost,
  CASE WHEN public.can_see_costs() THEN i.duty_cost          END AS duty_cost,
  CASE WHEN public.can_see_costs() THEN i.custom_cost        END AS custom_cost,
  CASE WHEN public.can_see_costs() THEN i.boxing_cost        END AS boxing_cost,
  CASE WHEN public.can_see_costs() THEN i.shifting_cost      END AS shifting_cost,
  CASE WHEN public.can_see_costs() THEN i.extra_safe_cost    END AS extra_safe_cost
FROM public.project_items i
WHERE public.is_project_in_my_org(i.project_id)
   OR public.is_project_member(i.project_id)
   OR public.is_project_owner(i.project_id)
   OR public.has_role(auth.uid(), 'admin'::public.app_role);

REVOKE ALL ON public.project_items_secure FROM PUBLIC, anon;
GRANT SELECT ON public.project_items_secure TO authenticated, service_role;

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
    return json({ ok: true, message: "secfix3 applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
