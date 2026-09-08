
CREATE OR REPLACE FUNCTION public.next_tier(t public.subscription_tier)
RETURNS public.subscription_tier LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE t WHEN 'basic' THEN 'advanced' WHEN 'advanced' THEN 'pro' ELSE 'enterprise' END::public.subscription_tier
$$;

REVOKE EXECUTE ON FUNCTION public.trial_enabled() FROM anon;
REVOKE EXECUTE ON FUNCTION public.domain_is_available(text) FROM anon;
