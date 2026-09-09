CREATE OR REPLACE FUNCTION public.admin_set_org_tier(p_org uuid, p_tier text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.organization_subscriptions (organization_id, tier, status, current_period_end)
  VALUES (p_org, p_tier::public.subscription_tier, 'active'::public.subscription_status, now() + interval '1 year')
  ON CONFLICT (organization_id) DO UPDATE
    SET tier = EXCLUDED.tier, updated_at = now();

  INSERT INTO public.organization_entitlements (organization_id, tier, status, current_period_end)
  VALUES (p_org, p_tier::public.subscription_tier, 'active'::public.entitlement_status, now() + interval '1 year')
  ON CONFLICT (organization_id) DO UPDATE
    SET tier = EXCLUDED.tier,
        status = CASE WHEN public.organization_entitlements.status IN ('suspended','canceled')
                      THEN 'active'::public.entitlement_status
                      ELSE public.organization_entitlements.status END,
        updated_at = now();
END;
$$;