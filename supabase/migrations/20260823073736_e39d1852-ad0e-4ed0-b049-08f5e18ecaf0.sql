-- record_referral_payment: solo processi server (service_role), mai dal client.
REVOKE EXECUTE ON FUNCTION public.record_referral_payment(uuid, numeric, text, timestamptz) FROM authenticated, anon, PUBLIC;

-- refresh_referral_payout_status: usata dal pannello super-admin, aggiunge il gate interno.
CREATE OR REPLACE FUNCTION public.refresh_referral_payout_status()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT (public.is_platform_admin() OR auth.role() = 'service_role') THEN
    RETURN 0;
  END IF;

  UPDATE public.referral_payouts
     SET status = 'claimable'
   WHERE status = 'pending_hold'
     AND claimable_from <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_referral_payout_status() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_referral_payout_status() TO authenticated, service_role;