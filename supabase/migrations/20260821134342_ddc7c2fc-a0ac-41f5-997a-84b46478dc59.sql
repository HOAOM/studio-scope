-- 1. Fix consumer: tick_subscription_lifecycle -> is_platform_admin()
CREATE OR REPLACE FUNCTION public.tick_subscription_lifecycle()
 RETURNS TABLE(org_id uuid, old_status subscription_status, new_status subscription_status)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  grace_days int;
  purge_days int;
  v_old public.subscription_status;
  v_new public.subscription_status;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR r IN SELECT * FROM public.organization_subscriptions LOOP
    grace_days := CASE r.tier WHEN 'starter' THEN 15 WHEN 'pro' THEN 30 ELSE 90 END;
    purge_days := CASE r.tier WHEN 'starter' THEN 30 WHEN 'pro' THEN 60 ELSE 180 END;
    v_old := r.status;
    v_new := r.status;

    IF v_new = 'active' AND r.current_period_end < now() THEN
      v_new := 'grace';
    END IF;
    IF v_new = 'grace'
       AND r.current_period_end + (grace_days || ' days')::interval < now() THEN
      v_new := 'suspended';
    END IF;
    IF v_new = 'suspended'
       AND r.current_period_end + (purge_days || ' days')::interval < now() THEN
      v_new := 'purge_pending';
    END IF;

    IF v_new <> v_old THEN
      UPDATE public.organization_subscriptions
         SET status      = v_new,
             grace_until = CASE WHEN v_new = 'grace'
                                THEN r.current_period_end + (grace_days || ' days')::interval
                                ELSE grace_until END,
             suspend_at  = CASE WHEN v_new = 'suspended' THEN now() ELSE suspend_at END,
             purge_at    = CASE WHEN v_new = 'purge_pending' THEN now() ELSE purge_at END,
             updated_at  = now()
       WHERE id = r.id;

      org_id := r.organization_id; old_status := v_old; new_status := v_new;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

-- 2. Fix consumer: org_primary_email_domain -> membership or platform admin
CREATE OR REPLACE FUNCTION public.org_primary_email_domain(p_org uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT lower(split_part(p.email, '@', 2))
  FROM public.organization_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.organization_id = p_org
    AND p.email IS NOT NULL
    AND (public.is_org_member(p_org) OR public.is_platform_admin())
  ORDER BY m.is_owner DESC, m.joined_at ASC
  LIMIT 1
$function$;

-- 3. Retire the org-agnostic role check for good
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 4. Platform-only functions: never executable by app users
REVOKE ALL ON FUNCTION public.tick_subscription_lifecycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_subscription_lifecycle() TO service_role;

REVOKE ALL ON FUNCTION public.org_primary_email_domain(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_primary_email_domain(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_platform_owner(uuid) FROM PUBLIC, anon;
