CREATE OR REPLACE FUNCTION public.admin_list_all_orgs()
RETURNS TABLE(organization_id uuid, name text, slug text, created_at timestamp with time zone, owner_email text, owner_user_id uuid, tier text, status text, current_period_end timestamp with time zone, active_projects integer, project_limit integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT o.id, o.name, o.slug, o.created_at, p.email, p.id,
         COALESCE(public.get_org_effective_tier(o.id)::text, 'basic'),
         COALESCE(s.status::text, 'suspended'),
         s.current_period_end,
         public.get_org_active_project_count(o.id),
         COALESCE((public.get_tier_limits(o.id)).max_active_projects, 2147483647)
  FROM public.organizations o
  LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
  LEFT JOIN LATERAL (
    SELECT m.user_id FROM public.organization_members m
    WHERE m.organization_id = o.id AND m.is_owner = true
    ORDER BY m.joined_at ASC LIMIT 1
  ) ow ON true
  LEFT JOIN public.profiles p ON p.id = ow.user_id
  WHERE public.is_platform_admin()
  ORDER BY o.created_at DESC;
$function$;