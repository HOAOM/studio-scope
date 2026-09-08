CREATE OR REPLACE FUNCTION public.request_tier_upgrade(p_org uuid, p_target subscription_tier)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_rank jsonb := '{"basic":1,"advanced":2,"pro":3,"enterprise":4}'::jsonb;
  v_current subscription_tier;
BEGIN
  IF NOT (public.is_org_admin(p_org) OR public.is_org_owner(p_org) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Non autorizzato' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT tier INTO v_current FROM public.organization_entitlements WHERE organization_id = p_org;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Nessun piano attivo per questa organizzazione' USING ERRCODE='no_data_found';
  END IF;

  IF (v_rank->>p_target::text)::int <= (v_rank->>v_current::text)::int THEN
    RAISE EXCEPTION 'Questa operazione consente solo il passaggio a un piano superiore'
      USING ERRCODE='check_violation';
  END IF;

  UPDATE public.organization_entitlements
     SET tier = p_target, updated_at = now()
   WHERE organization_id = p_org;

  RETURN jsonb_build_object('ok', true, 'tier', p_target::text, 'previous_tier', v_current::text);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.request_tier_upgrade(uuid, subscription_tier) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_tier_upgrade(uuid, subscription_tier) TO authenticated, service_role;