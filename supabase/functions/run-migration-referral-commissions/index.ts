import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-migration-token",
};

/** One-time throwaway token: this runner is meant to be deleted after use. */
const ONE_TIME_TOKEN = "rfc-2026-08-20-9f3a7c11";

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- =========================================================
-- Referral commission system — schema + calculation engine
-- =========================================================

CREATE TABLE IF NOT EXISTS public.referral_commission_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id uuid NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  percentage numeric(6,3) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  valid_from timestamptz NOT NULL DEFAULT now(),
  set_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.referral_commission_rates TO authenticated;
GRANT ALL ON public.referral_commission_rates TO service_role;

ALTER TABLE public.referral_commission_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_admins_read_rates ON public.referral_commission_rates;
CREATE POLICY platform_admins_read_rates
  ON public.referral_commission_rates FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS platform_admins_insert_rates ON public.referral_commission_rates;
CREATE POLICY platform_admins_insert_rates
  ON public.referral_commission_rates FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()) AND set_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_referral_rates_code_from
  ON public.referral_commission_rates (referral_code_id, valid_from DESC);


CREATE TABLE IF NOT EXISTS public.referral_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id uuid NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  referred_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_id text,
  payment_amount numeric(12,2) NOT NULL CHECK (payment_amount >= 0),
  locked_price numeric(12,2) NOT NULL CHECK (locked_price >= 0),
  commission_percentage numeric(6,3) NOT NULL,
  commission_amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending_hold'
    CHECK (status IN ('pending_hold','claimable','paid')),
  payment_date timestamptz NOT NULL DEFAULT now(),
  claimable_from timestamptz NOT NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_payouts_payment
  ON public.referral_payouts (referred_org_id, payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_payouts_referrer
  ON public.referral_payouts (referrer_id, status);

GRANT SELECT, UPDATE ON public.referral_payouts TO authenticated;
GRANT ALL ON public.referral_payouts TO service_role;

ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_admins_read_payouts ON public.referral_payouts;
CREATE POLICY platform_admins_read_payouts
  ON public.referral_payouts FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS platform_owners_update_payouts ON public.referral_payouts;
CREATE POLICY platform_owners_update_payouts
  ON public.referral_payouts FOR UPDATE TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

DROP TRIGGER IF EXISTS trg_referral_payouts_updated_at ON public.referral_payouts;
CREATE TRIGGER trg_referral_payouts_updated_at
  BEFORE UPDATE ON public.referral_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Active percentage for a referral code at a given instant
CREATE OR REPLACE FUNCTION public.referral_rate_at(_code_id uuid, _at timestamptz DEFAULT now())
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT COALESCE((
    SELECT r.percentage
    FROM public.referral_commission_rates r
    WHERE r.referral_code_id = _code_id
      AND r.valid_from <= _at
    ORDER BY r.valid_from DESC, r.created_at DESC
    LIMIT 1
  ), 0);
$fn$;

REVOKE ALL ON FUNCTION public.referral_rate_at(uuid, timestamptz) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_rate_at(uuid, timestamptz) TO service_role;


-- Calculation engine: register a collected subscription payment
CREATE OR REPLACE FUNCTION public.record_referral_payment(
  _org_id uuid,
  _amount numeric,
  _payment_id text DEFAULT NULL,
  _payment_date timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_code_id uuid;
  v_referrer uuid;
  v_baseline numeric;
  v_locked numeric;
  v_pct numeric;
  v_id uuid;
BEGIN
  SELECT rr.referral_code_id, rc.organization_id
    INTO v_code_id, v_referrer
  FROM public.referral_redemptions rr
  JOIN public.referral_codes rc ON rc.id = rr.referral_code_id
  WHERE rr.referred_org_id = _org_id
  ORDER BY rr.redeemed_at ASC
  LIMIT 1;

  IF v_code_id IS NULL THEN
    RETURN NULL; -- no referral attached to this organization
  END IF;

  -- reference price = MIN(price of the very first subscription under this
  -- referral, price actually paid now)
  SELECT MIN(p.payment_amount) INTO v_baseline
  FROM public.referral_payouts p
  WHERE p.referred_org_id = _org_id
    AND p.referral_code_id = v_code_id;

  v_locked := LEAST(COALESCE(v_baseline, _amount), _amount);
  v_pct := public.referral_rate_at(v_code_id, _payment_date);

  INSERT INTO public.referral_payouts (
    referral_code_id, referred_org_id, referrer_id, payment_id,
    payment_amount, locked_price, commission_percentage, commission_amount,
    status, payment_date, claimable_from
  ) VALUES (
    v_code_id, _org_id, v_referrer, _payment_id,
    _amount, v_locked, v_pct, ROUND(v_locked * v_pct / 100.0, 2),
    CASE WHEN _payment_date + interval '45 days' <= now() THEN 'claimable' ELSE 'pending_hold' END,
    _payment_date, _payment_date + interval '45 days'
  )
  ON CONFLICT (referred_org_id, payment_id) WHERE payment_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_referral_payment(uuid, numeric, text, timestamptz) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_referral_payment(uuid, numeric, text, timestamptz) TO service_role;


-- Maturity job: pending_hold -> claimable once the 45-day hold has elapsed
CREATE OR REPLACE FUNCTION public.refresh_referral_payout_status()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_count integer;
BEGIN
  UPDATE public.referral_payouts
     SET status = 'claimable'
   WHERE status = 'pending_hold'
     AND claimable_from <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.refresh_referral_payout_status() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_referral_payout_status() TO authenticated, service_role;

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

  const token = req.headers.get("x-migration-token");
  if (token !== ONE_TIME_TOKEN) return json({ error: "forbidden" }, 403);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    const check = await sql`
      SELECT
        (SELECT count(*)::int FROM public.referral_commission_rates) AS rates,
        (SELECT count(*)::int FROM public.referral_payouts) AS payouts,
        (SELECT count(*)::int FROM public.referral_codes) AS codes`;
    return json({ ok: true, message: "referral commissions applied", check: check[0] });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
