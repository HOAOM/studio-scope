/**
 * run-migration-secfix13
 *  - workflow_role_ui_only: matrice transizioni in DB + trigger di enforcement
 *    su public.project_items (lifecycle_status / approval_status).
 *  - tier_limits_public_read: lettura limitata a platform admin e al piano
 *    della propria organizzazione.
 */
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-site-api-key",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

CREATE TABLE IF NOT EXISTS public.lifecycle_transition_roles (
  from_status text NOT NULL,
  to_status text NOT NULL,
  roles app_role[] NOT NULL,
  PRIMARY KEY (from_status, to_status)
);

GRANT SELECT ON public.lifecycle_transition_roles TO authenticated;
GRANT ALL ON public.lifecycle_transition_roles TO service_role;
ALTER TABLE public.lifecycle_transition_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ltr_read ON public.lifecycle_transition_roles;
CREATE POLICY ltr_read ON public.lifecycle_transition_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ltr_platform_write ON public.lifecycle_transition_roles;
CREATE POLICY ltr_platform_write ON public.lifecycle_transition_roles
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DELETE FROM public.lifecycle_transition_roles;
INSERT INTO public.lifecycle_transition_roles (from_status, to_status, roles) VALUES
('concept','in_design','{admin,coo,designer,architectural_dept,head_of_design,project_manager}'),
('in_design','design_ready','{admin,coo,designer,architectural_dept,head_of_design}'),
('design_ready','finishes_proposed','{admin,coo,designer,head_of_design}'),
('design_ready','in_design','{admin,coo,head_of_design}'),
('finishes_proposed','finishes_approved_designer','{admin,coo,designer,head_of_design}'),
('finishes_proposed','in_design','{admin,coo,head_of_design}'),
('finishes_approved_designer','finishes_approved_hod','{admin,coo,head_of_design}'),
('finishes_approved_designer','client_board_ready','{admin,coo,head_of_design,designer,project_manager}'),
('finishes_approved_designer','finishes_proposed','{admin,coo,head_of_design}'),
('finishes_approved_hod','client_board_ready','{admin,coo,head_of_design,designer,project_manager}'),
('finishes_approved_hod','finishes_proposed','{admin,coo,head_of_design}'),
('client_board_ready','client_board_waiting_signature','{admin,coo,project_manager,designer,head_of_design}'),
('client_board_waiting_signature','client_board_signed','{admin,coo,project_manager,client,ceo}'),
('client_board_waiting_signature','client_board_ready','{admin,coo,project_manager,client,ceo}'),
('client_board_signed','quotation_preparation','{admin,coo,qs,procurement_manager,project_manager}'),
('quotation_preparation','quotation_inserted','{admin,coo,qs,procurement_manager}'),
('quotation_preparation','finishes_approved_hod','{admin,coo,procurement_manager,qs,project_manager}'),
('quotation_inserted','quotation_approved_ops','{admin,coo,project_manager,qs}'),
('quotation_inserted','quotation_preparation','{admin,coo,project_manager,qs}'),
('quotation_approved_ops','quotation_approved_high','{admin,coo,ceo,head_of_design}'),
('quotation_approved_ops','po_issued','{admin,coo,procurement_manager,project_manager}'),
('quotation_approved_ops','quotation_preparation','{admin,coo,ceo,head_of_design}'),
('quotation_approved_high','po_issued','{admin,coo,procurement_manager,project_manager}'),
('quotation_approved_high','quotation_preparation','{admin,coo,ceo,head_of_design}'),
('po_issued','proforma_received','{admin,coo,procurement_manager,accountant}'),
('proforma_received','payment_approval','{admin,coo,accountant,head_of_payments,project_manager}'),
('payment_approval','payment_executed','{admin,coo,ceo,accountant,head_of_payments}'),
('payment_approval','proforma_received','{admin,coo}'),
('payment_executed','in_production','{admin,coo,procurement_manager,project_manager}'),
('in_production','ready_to_ship','{admin,coo,procurement_manager,project_manager}'),
('ready_to_ship','in_delivery','{admin,coo,procurement_manager,project_manager}'),
('in_delivery','delivered_to_site','{admin,coo,site_engineer,project_manager}'),
('delivered_to_site','installation_planned','{admin,coo,site_engineer,project_manager}'),
('installation_planned','installed','{admin,coo,site_engineer,project_manager}'),
('installed','snagging','{admin,coo,site_engineer,project_manager}'),
('installed','closed','{admin,coo,project_manager}'),
('snagging','installed','{admin,coo,site_engineer,project_manager}'),
('snagging','closed','{admin,coo,project_manager}'),
('on_hold','concept','{admin,coo,project_manager}');

INSERT INTO public.lifecycle_transition_roles (from_status, to_status, roles)
SELECT s.from_status, 'on_hold', '{admin,coo,project_manager}'::app_role[]
FROM (SELECT unnest(enum_range(NULL::item_lifecycle_status))::text AS from_status) s
WHERE s.from_status NOT IN ('on_hold','cancelled','closed')
ON CONFLICT DO NOTHING;

INSERT INTO public.lifecycle_transition_roles (from_status, to_status, roles)
SELECT s.from_status, 'cancelled', '{admin,coo}'::app_role[]
FROM (SELECT unnest(enum_range(NULL::item_lifecycle_status))::text AS from_status) s
WHERE s.from_status NOT IN ('cancelled','closed')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_project_function_role(p_project uuid, p_roles app_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT public.is_platform_admin(auth.uid())
      OR public.is_project_org_owner(p_project)
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.projects p ON p.id = p_project
        WHERE ur.user_id = auth.uid()
          AND ur.organization_id = p.organization_id
          AND ur.role = ANY (p_roles)
      )
      OR EXISTS (
        SELECT 1 FROM public.project_assignments pa
        WHERE pa.project_id = p_project
          AND pa.user_id = auth.uid()
          AND pa.function_role = ANY (p_roles)
      );
$fn$;

REVOKE ALL ON FUNCTION public.has_project_function_role(uuid, app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_project_function_role(uuid, app_role[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_item_lifecycle_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_roles app_role[];
  v_known boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status AND OLD.lifecycle_status IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.lifecycle_transition_roles
      WHERE from_status = OLD.lifecycle_status::text
    ) INTO v_known;

    IF v_known THEN
      SELECT roles INTO v_roles
      FROM public.lifecycle_transition_roles
      WHERE from_status = OLD.lifecycle_status::text
        AND to_status = NEW.lifecycle_status::text;

      IF v_roles IS NULL THEN
        RAISE EXCEPTION 'Transizione di stato non consentita: % -> %', OLD.lifecycle_status, NEW.lifecycle_status;
      END IF;

      IF NOT public.has_project_function_role(NEW.project_id, v_roles) THEN
        RAISE EXCEPTION 'Ruolo non autorizzato per la transizione % -> %', OLD.lifecycle_status, NEW.lifecycle_status;
      END IF;
    END IF;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NOT public.has_project_function_role(
         NEW.project_id,
         '{admin,coo,ceo,head_of_design,project_manager,qs}'::app_role[]
       ) THEN
      RAISE EXCEPTION 'Ruolo non autorizzato per modificare lo stato di approvazione';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enforce_item_lifecycle_role() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_item_lifecycle_role ON public.project_items;
CREATE TRIGGER trg_enforce_item_lifecycle_role
  BEFORE UPDATE ON public.project_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_item_lifecycle_role();

DROP POLICY IF EXISTS tier_limits_read ON public.tier_limits;
CREATE POLICY tier_limits_read ON public.tier_limits
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.organization_subscriptions os
      WHERE os.tier = tier_limits.tier
        AND public.is_org_member(os.organization_id)
    )
  );

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
  if (!key || key !== Deno.env.get("SITE_API_KEY")) return json({ error: "forbidden" }, 403);
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    return json({ ok: true, message: "secfix13 applied" });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
