/**
 * run-migration-phase5
 *
 * Idempotent migrator — Phase 5: Referral program + discount codes.
 *
 * Schema:
 *   - referral_codes        (one per org, auto-generated short slug)
 *   - referral_redemptions  (logs who used which code, when, for which new org)
 *   - discount_codes        (admin-issued, percent or fixed, optional org/tier scope,
 *                            max_redemptions, valid_from/valid_until)
 *   - discount_redemptions  (audit of applied discounts per org)
 *
 * Helpers:
 *   - gen_referral_slug()          → text   (8-char base32 unique slug)
 *   - apply_referral(p_code,p_org) → boolean (logs redemption if valid & unused for org)
 *   - validate_discount(p_code, p_org, p_tier) → table(valid, reason, percent_off, amount_off)
 *   - redeem_discount(p_code, p_org)          → boolean
 *
 * Triggers:
 *   - trg_referral_codes_updated_at
 *   - trg_discount_codes_updated_at
 *   - trg_auto_create_referral_code on organizations (AFTER INSERT)
 *
 * Backfill: ensure every existing organization has a referral_code row.
 *
 * Auth: admin only.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MIGRATION_SQL = /* sql */ `
BEGIN;

-- 1. Slug generator (base32 Crockford-ish, no ambiguous chars) ---------------
CREATE OR REPLACE FUNCTION public.gen_referral_slug()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; -- no 0/O/1/I/L/U
  out text := '';
  i int;
BEGIN
  FOR i IN 1..8 LOOP
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN out;
END;
$$;

-- 2. referral_codes ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE,
  code            text NOT NULL UNIQUE,
  is_active       boolean NOT NULL DEFAULT true,
  total_redemptions int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON public.referral_codes (code);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members view referral code" ON public.referral_codes;
CREATE POLICY "members view referral code"
  ON public.referral_codes FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admin manages referral codes" ON public.referral_codes;
CREATE POLICY "admin manages referral codes"
  ON public.referral_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_referral_codes_updated_at ON public.referral_codes;
CREATE TRIGGER trg_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. referral_redemptions ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id    uuid NOT NULL,
  referred_org_id     uuid NOT NULL UNIQUE, -- one org can only be referred once
  redeemed_by         uuid,
  redeemed_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referral_red_code ON public.referral_redemptions (referral_code_id);

ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members view own referral redemptions" ON public.referral_redemptions;
CREATE POLICY "members view own referral redemptions"
  ON public.referral_redemptions FOR SELECT TO authenticated
  USING (
    public.is_org_member(referred_org_id)
    OR EXISTS (
      SELECT 1 FROM public.referral_codes rc
      WHERE rc.id = referral_code_id AND public.is_org_member(rc.organization_id)
    )
    OR public.has_role(auth.uid(), 'admin')
  );
DROP POLICY IF EXISTS "admin manages referral redemptions" ON public.referral_redemptions;
CREATE POLICY "admin manages referral redemptions"
  ON public.referral_redemptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. discount_codes ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discount_codes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL UNIQUE,
  description       text,
  percent_off       numeric(5,2),
  amount_off        numeric(10,2),
  scope_tier        public.subscription_tier, -- null = any tier
  scope_org_id      uuid,                     -- null = any org
  max_redemptions   int,                       -- null = unlimited
  total_redemptions int NOT NULL DEFAULT 0,
  valid_from        timestamptz,
  valid_until       timestamptz,
  is_active         boolean NOT NULL DEFAULT true,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (percent_off IS NOT NULL AND amount_off IS NULL)
    OR (percent_off IS NULL AND amount_off IS NOT NULL)
  ),
  CHECK (percent_off IS NULL OR (percent_off > 0 AND percent_off <= 100)),
  CHECK (amount_off  IS NULL OR amount_off > 0)
);
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON public.discount_codes (code);

ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin manages discount codes" ON public.discount_codes;
CREATE POLICY "admin manages discount codes"
  ON public.discount_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
-- non-admins cannot list codes directly; they validate via SECURITY DEFINER fn

DROP TRIGGER IF EXISTS trg_discount_codes_updated_at ON public.discount_codes;
CREATE TRIGGER trg_discount_codes_updated_at
  BEFORE UPDATE ON public.discount_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. discount_redemptions ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discount_redemptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id uuid NOT NULL,
  organization_id  uuid NOT NULL,
  redeemed_by      uuid,
  redeemed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discount_code_id, organization_id) -- each org redeems a code at most once
);
CREATE INDEX IF NOT EXISTS idx_discount_red_org ON public.discount_redemptions (organization_id);

ALTER TABLE public.discount_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members view org discount redemptions" ON public.discount_redemptions;
CREATE POLICY "members view org discount redemptions"
  ON public.discount_redemptions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admin manages discount redemptions" ON public.discount_redemptions;
CREATE POLICY "admin manages discount redemptions"
  ON public.discount_redemptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Auto-create referral code on new org ----------------------------------
CREATE OR REPLACE FUNCTION public.auto_create_referral_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slug text;
  v_tries int := 0;
BEGIN
  LOOP
    v_slug := public.gen_referral_slug();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = v_slug);
    v_tries := v_tries + 1;
    IF v_tries > 10 THEN
      RAISE EXCEPTION 'could not generate unique referral slug';
    END IF;
  END LOOP;

  INSERT INTO public.referral_codes (organization_id, code)
  VALUES (NEW.id, v_slug)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_referral_code ON public.organizations;
CREATE TRIGGER trg_auto_create_referral_code
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_referral_code();

-- 7. apply_referral helper --------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_referral(p_code text, p_org uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rc_id uuid;
  v_rc_org uuid;
BEGIN
  SELECT id, organization_id INTO v_rc_id, v_rc_org
  FROM public.referral_codes
  WHERE code = upper(p_code) AND is_active = true;
  IF v_rc_id IS NULL THEN RETURN false; END IF;
  IF v_rc_org = p_org THEN RETURN false; END IF; -- cannot self-refer

  INSERT INTO public.referral_redemptions (referral_code_id, referred_org_id, redeemed_by)
  VALUES (v_rc_id, p_org, auth.uid())
  ON CONFLICT (referred_org_id) DO NOTHING;

  UPDATE public.referral_codes
     SET total_redemptions = total_redemptions + 1
   WHERE id = v_rc_id;
  RETURN true;
END;
$$;

-- 8. validate_discount + redeem_discount -----------------------------------
CREATE OR REPLACE FUNCTION public.validate_discount(p_code text, p_org uuid, p_tier public.subscription_tier)
RETURNS TABLE(valid boolean, reason text, percent_off numeric, amount_off numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.discount_codes%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.discount_codes WHERE code = upper(p_code);
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'not_found'::text, NULL::numeric, NULL::numeric; RETURN; END IF;
  IF NOT r.is_active THEN RETURN QUERY SELECT false, 'inactive', NULL::numeric, NULL::numeric; RETURN; END IF;
  IF r.valid_from IS NOT NULL AND now() < r.valid_from THEN
    RETURN QUERY SELECT false, 'not_yet_valid', NULL::numeric, NULL::numeric; RETURN;
  END IF;
  IF r.valid_until IS NOT NULL AND now() > r.valid_until THEN
    RETURN QUERY SELECT false, 'expired', NULL::numeric, NULL::numeric; RETURN;
  END IF;
  IF r.scope_org_id IS NOT NULL AND r.scope_org_id <> p_org THEN
    RETURN QUERY SELECT false, 'wrong_org', NULL::numeric, NULL::numeric; RETURN;
  END IF;
  IF r.scope_tier IS NOT NULL AND r.scope_tier <> p_tier THEN
    RETURN QUERY SELECT false, 'wrong_tier', NULL::numeric, NULL::numeric; RETURN;
  END IF;
  IF r.max_redemptions IS NOT NULL AND r.total_redemptions >= r.max_redemptions THEN
    RETURN QUERY SELECT false, 'exhausted', NULL::numeric, NULL::numeric; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.discount_redemptions
              WHERE discount_code_id = r.id AND organization_id = p_org) THEN
    RETURN QUERY SELECT false, 'already_redeemed', NULL::numeric, NULL::numeric; RETURN;
  END IF;
  RETURN QUERY SELECT true, 'ok', r.percent_off, r.amount_off;
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_discount(p_code text, p_org uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tier public.subscription_tier;
  v_id uuid;
  v_valid boolean;
BEGIN
  SELECT tier INTO v_tier FROM public.organization_subscriptions WHERE organization_id = p_org;
  IF v_tier IS NULL THEN RETURN false; END IF;

  SELECT valid INTO v_valid FROM public.validate_discount(p_code, p_org, v_tier) LIMIT 1;
  IF NOT v_valid THEN RETURN false; END IF;

  SELECT id INTO v_id FROM public.discount_codes WHERE code = upper(p_code);
  INSERT INTO public.discount_redemptions (discount_code_id, organization_id, redeemed_by)
  VALUES (v_id, p_org, auth.uid())
  ON CONFLICT DO NOTHING;
  UPDATE public.discount_codes SET total_redemptions = total_redemptions + 1 WHERE id = v_id;
  RETURN true;
END;
$$;

-- 9. Backfill referral codes for existing orgs -----------------------------
DO $$
DECLARE r record; v_slug text; v_tries int;
BEGIN
  FOR r IN SELECT id FROM public.organizations o
            WHERE NOT EXISTS (SELECT 1 FROM public.referral_codes rc WHERE rc.organization_id = o.id)
  LOOP
    v_tries := 0;
    LOOP
      v_slug := public.gen_referral_slug();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = v_slug);
      v_tries := v_tries + 1;
      EXIT WHEN v_tries > 10;
    END LOOP;
    INSERT INTO public.referral_codes (organization_id, code) VALUES (r.id, v_slug)
    ON CONFLICT (organization_id) DO NOTHING;
  END LOOP;
END $$;

COMMIT;
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing Authorization header" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthenticated" }, 401);
  const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr || !isAdmin) return json({ error: "forbidden: admin only" }, 403);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  try {
    await sql.unsafe(MIGRATION_SQL);
    const codes = await sql`
      SELECT o.name, rc.code, rc.total_redemptions
        FROM public.referral_codes rc
        JOIN public.organizations o ON o.id = rc.organization_id
       ORDER BY o.created_at`;
    const discounts = await sql`
      SELECT code, percent_off, amount_off, scope_tier, max_redemptions,
             total_redemptions, is_active, valid_until
        FROM public.discount_codes ORDER BY created_at DESC`;
    return json({
      ok: true,
      phase: 5,
      message: "Phase 5 migration complete",
      referral_codes: codes,
      discount_codes: discounts,
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
