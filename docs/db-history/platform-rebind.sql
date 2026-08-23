-- Archived from edge function run-migration-platform-rebind (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

------------------------------------------------------------------ helpers
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p_org IS NOT NULL AND (
    public.is_org_owner(p_org)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.organization_id = p_org
        AND ur.role = 'admin'::public.app_role
    )
  )
$fn$;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_project_org_admin(p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.is_org_admin((SELECT p.organization_id FROM public.projects p WHERE p.id = p_project))
$fn$;
REVOKE ALL ON FUNCTION public.is_project_org_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_org_admin(uuid) TO authenticated, service_role;

------------------------------------------------------------------ admin_* RPCs
CREATE OR REPLACE FUNCTION public.admin_list_all_orgs()
RETURNS TABLE(organization_id uuid, name text, slug text, created_at timestamptz,
              owner_email text, owner_user_id uuid, tier text, status text,
              current_period_end timestamptz, active_projects integer, project_limit integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT o.id, o.name, o.slug, o.created_at, p.email, p.id,
         COALESCE(public.get_org_effective_tier(o.id)::text, 'starter'),
         COALESCE(s.status::text, 'suspended'),
         s.current_period_end,
         public.get_org_active_project_count(o.id),
         public.tier_project_limit(public.get_org_effective_tier(o.id))
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
$fn$;

CREATE OR REPLACE FUNCTION public.admin_get_org(p_org uuid)
RETURNS TABLE(id uuid, name text, slug text, tier text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT o.id, o.name, o.slug,
         COALESCE(public.get_org_effective_tier(o.id)::text, 'starter'),
         COALESCE(s.status::text, 'suspended')
  FROM public.organizations o
  LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
  WHERE o.id = p_org AND public.is_platform_admin();
$fn$;

CREATE OR REPLACE FUNCTION public.admin_global_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'total_orgs', (SELECT count(*) FROM public.organizations),
    'orgs_by_tier', (
      SELECT jsonb_object_agg(tier, c) FROM (
        SELECT COALESCE(s.tier::text,'starter') AS tier, count(*) c
        FROM public.organizations o
        LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
        GROUP BY 1) x),
    'orgs_by_status', (
      SELECT jsonb_object_agg(status, c) FROM (
        SELECT COALESCE(s.status::text,'suspended') AS status, count(*) c
        FROM public.organizations o
        LEFT JOIN public.organization_subscriptions s ON s.organization_id = o.id
        GROUP BY 1) x),
    'new_orgs_30d', (SELECT count(*) FROM public.organizations WHERE created_at > now() - interval '30 days'),
    'total_projects', (SELECT count(*) FROM public.projects WHERE archived_at IS NULL),
    'top_orgs', (
      SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT o.name, count(p.id) AS active_projects
        FROM public.organizations o
        LEFT JOIN public.projects p ON p.organization_id = o.id AND p.archived_at IS NULL
        GROUP BY o.id, o.name ORDER BY count(p.id) DESC LIMIT 5) t)
  )
  WHERE public.is_platform_admin();
$fn$;

CREATE OR REPLACE FUNCTION public.admin_set_org_tier(p_org uuid, p_tier text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.organization_subscriptions (organization_id, tier, status, current_period_end)
  VALUES (p_org, p_tier::public.subscription_tier, 'active'::public.subscription_status, now() + interval '1 year')
  ON CONFLICT (organization_id) DO UPDATE
    SET tier = EXCLUDED.tier, updated_at = now();
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_set_org_status(p_org uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.organization_subscriptions
     SET status = p_status::public.subscription_status, updated_at = now()
   WHERE organization_id = p_org;
END;
$fn$;

------------------------------------------------------------------ other definer functions
CREATE OR REPLACE FUNCTION public.can_access_project_file(p_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_project uuid;
BEGIN
  BEGIN
    v_project := (split_part(p_name, '/', 1))::uuid;
  EXCEPTION WHEN OTHERS THEN RETURN false;
  END;
  RETURN public.is_project_in_my_org(v_project)
      OR public.is_project_member(v_project)
      OR public.is_project_owner(v_project)
      OR public.is_platform_admin();
END;
$fn$;

CREATE OR REPLACE FUNCTION public.item_cost_values(p_item_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT to_jsonb(x)
  FROM (
    SELECT i.unit_cost, i.budget_unit_cost, i.budget_estimate, i.selling_price,
           i.margin_percentage, i.delivery_cost, i.installation_cost,
           i.insurance_cost, i.duty_cost, i.custom_cost, i.boxing_cost,
           i.shifting_cost, i.extra_safe_cost
    FROM public.project_items i
    WHERE i.id = p_item_id
      AND public.can_see_costs()
      AND (
        public.is_project_in_my_org(i.project_id)
        OR public.is_project_member(i.project_id)
        OR public.is_project_owner(i.project_id)
      )
  ) x
$fn$;

CREATE OR REPLACE FUNCTION public.directory_profiles(p_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(id uuid, display_name text, avatar_url text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p.id, p.display_name, p.avatar_url,
    CASE
      WHEN p.id = auth.uid()
        OR public.is_platform_admin()
        OR EXISTS (
             SELECT 1 FROM public.organization_members a
             JOIN public.organization_members b ON a.organization_id = b.organization_id
             WHERE a.user_id = auth.uid()
               AND (a.is_owner OR public.is_org_admin(a.organization_id))
               AND b.user_id = p.id)
      THEN p.email ELSE NULL
    END AS email
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND (p_ids IS NULL OR p.id = ANY(p_ids))
    AND (
      p.id = auth.uid()
      OR public.is_platform_admin()
      OR EXISTS (
           SELECT 1 FROM public.organization_members a
           JOIN public.organization_members b ON a.organization_id = b.organization_id
           WHERE a.user_id = auth.uid() AND b.user_id = p.id)
    )
$fn$;

CREATE OR REPLACE FUNCTION public.record_invite_domain(p_org uuid, p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_primary text;
  v_domain  text := lower(split_part(p_email, '@', 2));
BEGIN
  IF NOT (public.is_org_member(p_org) OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_primary := public.org_primary_email_domain(p_org);
  IF v_primary IS NULL OR v_domain = '' OR v_domain = v_primary THEN
    RETURN jsonb_build_object('mismatch', false, 'primary_domain', v_primary);
  END IF;
  INSERT INTO public.organization_domain_audit (organization_id, primary_domain, foreign_domain, email)
  VALUES (p_org, v_primary, v_domain, lower(p_email))
  ON CONFLICT (organization_id, email) DO NOTHING;
  RETURN jsonb_build_object('mismatch', true, 'primary_domain', v_primary, 'domain', v_domain);
END;
$fn$;

------------------------------------------------------------------ tier bypass
CREATE OR REPLACE FUNCTION public.enforce_project_archive_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_is_platform boolean := public.is_platform_admin();
  v_unarchive  boolean := FALSE;
  v_create_act boolean := FALSE;
  v_limit      integer;
  v_count      integer;
  v_tier       public.subscription_tier;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' AND NEW.archived_at IS NULL THEN
    v_create_act := TRUE;
  ELSIF TG_OP = 'UPDATE' AND OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL THEN
    v_unarchive := TRUE;
  END IF;
  IF NOT (v_create_act OR v_unarchive) THEN RETURN NEW; END IF;

  IF v_is_platform THEN
    IF v_unarchive THEN
      INSERT INTO public.project_reopen_log (project_id, organization_id, reopened_by)
      VALUES (NEW.id, NEW.organization_id, auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  SELECT tier INTO v_tier FROM public.organization_subscriptions
   WHERE organization_id = NEW.organization_id;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'organization has no subscription' USING ERRCODE = '22023';
  END IF;
  v_limit := public.tier_project_limit(v_tier);

  SELECT count(*) INTO v_count FROM public.projects
   WHERE organization_id = NEW.organization_id AND archived_at IS NULL AND id <> NEW.id;
  IF v_count + 1 > v_limit THEN
    RAISE EXCEPTION 'active project limit reached for tier % (limit %)', v_tier, v_limit
      USING ERRCODE = '22023';
  END IF;

  IF v_unarchive THEN
    IF public.org_reopen_count_this_month(NEW.organization_id) >= 2 THEN
      RAISE EXCEPTION 'reopen quota exceeded for this month (max 2)' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.project_reopen_log (project_id, organization_id, reopened_by)
    VALUES (NEW.id, NEW.organization_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$fn$;

------------------------------------------------------------------ RLS: cross-org reads/writes
-- audit_log
DROP POLICY IF EXISTS admin_coo_view_all_audit ON public.audit_log;
CREATE POLICY platform_or_org_view_audit ON public.audit_log
  FOR SELECT TO authenticated USING (
    public.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.project_items pi
               WHERE pi.id = audit_log.entity_id
                 AND public.is_project_in_my_org(pi.project_id))
  );

-- boq_coverage
DROP POLICY IF EXISTS "Org members can access org boq coverage" ON public.boq_coverage;
CREATE POLICY "Org members can access org boq coverage" ON public.boq_coverage
  FOR ALL TO authenticated
  USING (public.is_project_in_my_org(project_id) OR public.is_platform_admin())
  WITH CHECK (public.is_project_in_my_org(project_id) OR public.is_platform_admin());

-- discount codes / redemptions
DROP POLICY IF EXISTS "admin manages discount codes" ON public.discount_codes;
CREATE POLICY "platform staff read discount codes" ON public.discount_codes
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY "platform owner manages discount codes" ON public.discount_codes
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

DROP POLICY IF EXISTS "admin manages discount redemptions" ON public.discount_redemptions;
DROP POLICY IF EXISTS "members view org discount redemptions" ON public.discount_redemptions;
CREATE POLICY "members view org discount redemptions" ON public.discount_redemptions
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY "platform owner manages discount redemptions" ON public.discount_redemptions
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

-- referral codes / redemptions
DROP POLICY IF EXISTS "admin manages referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "members view referral code" ON public.referral_codes;
CREATE POLICY "members view referral code" ON public.referral_codes
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY "platform owner manages referral codes" ON public.referral_codes
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

DROP POLICY IF EXISTS "admin manages referral redemptions" ON public.referral_redemptions;
DROP POLICY IF EXISTS "members view own referral redemptions" ON public.referral_redemptions;
CREATE POLICY "members view own referral redemptions" ON public.referral_redemptions
  FOR SELECT TO authenticated USING (
    public.is_org_member(referred_org_id)
    OR EXISTS (SELECT 1 FROM public.referral_codes rc
               WHERE rc.id = referral_redemptions.referral_code_id
                 AND public.is_org_member(rc.organization_id))
    OR public.is_platform_admin());
CREATE POLICY "platform owner manages referral redemptions" ON public.referral_redemptions
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

-- organization_domain_audit
DROP POLICY IF EXISTS "Org members view domain audit" ON public.organization_domain_audit;
CREATE POLICY "Org members view domain audit" ON public.organization_domain_audit
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());

-- organization_invites (client admin keeps control of their OWN org)
DROP POLICY IF EXISTS "owners can manage invites" ON public.organization_invites;
DROP POLICY IF EXISTS "members can view invites" ON public.organization_invites;
CREATE POLICY "members can view invites" ON public.organization_invites
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY "owners can manage invites" ON public.organization_invites
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_admin(organization_id) OR public.is_platform_admin());

-- organization_members
DROP POLICY IF EXISTS "members can view org members" ON public.organization_members;
DROP POLICY IF EXISTS "owners can manage org members" ON public.organization_members;
CREATE POLICY "members can view org members" ON public.organization_members
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY "owners can manage org members" ON public.organization_members
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_admin(organization_id) OR public.is_platform_admin());

-- organization_role_labels
DROP POLICY IF EXISTS "members can view role labels" ON public.organization_role_labels;
DROP POLICY IF EXISTS "owners can manage role labels" ON public.organization_role_labels;
CREATE POLICY "members can view role labels" ON public.organization_role_labels
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY "owners can manage role labels" ON public.organization_role_labels
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_admin(organization_id) OR public.is_platform_admin());

-- organization_subscriptions (billing = platform owner only)
DROP POLICY IF EXISTS "members view their subscription" ON public.organization_subscriptions;
DROP POLICY IF EXISTS "admin manages subscriptions" ON public.organization_subscriptions;
CREATE POLICY "members view their subscription" ON public.organization_subscriptions
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY "platform owner manages subscriptions" ON public.organization_subscriptions
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

-- organizations
DROP POLICY IF EXISTS "members can view their org" ON public.organizations;
DROP POLICY IF EXISTS "owners and admins can update org" ON public.organizations;
DROP POLICY IF EXISTS "admins can manage all orgs" ON public.organizations;
CREATE POLICY "members can view their org" ON public.organizations
  FOR SELECT TO authenticated USING (public.is_org_member(id) OR public.is_platform_admin());
CREATE POLICY "owners and admins can update org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_admin(id) OR public.is_platform_admin());
CREATE POLICY "platform owner manages all orgs" ON public.organizations
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());

-- profiles
DROP POLICY IF EXISTS admins_manage_profiles ON public.profiles;
DROP POLICY IF EXISTS users_read_profiles ON public.profiles;
CREATE POLICY platform_owner_manage_profiles ON public.profiles
  FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
CREATE POLICY users_read_profiles ON public.profiles
  FOR SELECT TO authenticated USING (
    id = auth.uid()
    OR public.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.organization_members a
               JOIN public.organization_members b ON a.organization_id = b.organization_id
               WHERE a.user_id = auth.uid() AND b.user_id = profiles.id));

-- project-scoped tables
DROP POLICY IF EXISTS "Manage project assignments" ON public.project_assignments;
CREATE POLICY "Manage project assignments" ON public.project_assignments
  FOR ALL TO authenticated
  USING (public.is_project_owner(project_id) OR public.is_project_org_owner(project_id)
         OR public.is_project_org_admin(project_id) OR public.is_platform_admin())
  WITH CHECK (public.is_project_owner(project_id) OR public.is_project_org_owner(project_id)
         OR public.is_project_org_admin(project_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "Org members can access org project items" ON public.project_items;
CREATE POLICY "Org members can access org project items" ON public.project_items
  FOR ALL TO authenticated
  USING (public.is_project_in_my_org(project_id) OR public.is_platform_admin())
  WITH CHECK (public.is_project_in_my_org(project_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "Org members can view org project members" ON public.project_members;
DROP POLICY IF EXISTS owners_manage_members ON public.project_members;
CREATE POLICY "Org members can view org project members" ON public.project_members
  FOR SELECT TO authenticated USING (public.is_project_in_my_org(project_id) OR public.is_platform_admin());
CREATE POLICY owners_manage_members ON public.project_members
  FOR ALL TO authenticated
  USING (public.is_project_owner(project_id) OR public.is_project_org_admin(project_id) OR public.is_platform_admin())
  WITH CHECK (public.is_project_owner(project_id) OR public.is_project_org_admin(project_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "Org members can access org milestones" ON public.project_milestones;
CREATE POLICY "Org members can access org milestones" ON public.project_milestones
  FOR ALL TO authenticated
  USING (public.is_project_in_my_org(project_id) OR public.is_platform_admin())
  WITH CHECK (public.is_project_in_my_org(project_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "Org members can access org project tasks" ON public.project_tasks;
CREATE POLICY "Org members can access org project tasks" ON public.project_tasks
  FOR ALL TO authenticated
  USING (public.is_project_in_my_org(project_id) OR public.is_platform_admin())
  WITH CHECK (public.is_project_in_my_org(project_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS "members view reopen log" ON public.project_reopen_log;
DROP POLICY IF EXISTS "admin manages reopen log" ON public.project_reopen_log;
CREATE POLICY "members view reopen log" ON public.project_reopen_log
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY "platform manages reopen log" ON public.project_reopen_log
  FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Org members can view org projects" ON public.projects;
DROP POLICY IF EXISTS "Org owners can update org projects" ON public.projects;
DROP POLICY IF EXISTS "Org owners can delete org projects" ON public.projects;
CREATE POLICY "Org members can view org projects" ON public.projects
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY "Org owners can update org projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_admin(organization_id) OR public.is_platform_admin());
CREATE POLICY "Org owners can delete org projects" ON public.projects
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin());

-- security flags
DROP POLICY IF EXISTS "Admins view security flags" ON public.security_flags;
CREATE POLICY "Admins view security flags" ON public.security_flags
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR public.is_org_admin(organization_id));

-- suppliers / supplier comments
DROP POLICY IF EXISTS members_read_suppliers ON public.suppliers;
DROP POLICY IF EXISTS members_update_suppliers ON public.suppliers;
DROP POLICY IF EXISTS admin_delete_suppliers ON public.suppliers;
CREATE POLICY members_read_suppliers ON public.suppliers
  FOR SELECT TO authenticated USING (
    created_by = auth.uid() OR public.is_platform_admin()
    OR (created_by IS NOT NULL AND public.shares_org_with(created_by)));
CREATE POLICY members_update_suppliers ON public.suppliers
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_platform_admin()
         OR (created_by IS NOT NULL AND public.has_role(auth.uid(),'admin'::public.app_role)
             AND public.shares_org_with(created_by)))
  WITH CHECK (created_by = auth.uid() OR public.is_platform_admin()
         OR (created_by IS NOT NULL AND public.has_role(auth.uid(),'admin'::public.app_role)
             AND public.shares_org_with(created_by)));
CREATE POLICY admin_delete_suppliers ON public.suppliers
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_platform_admin()
         OR (created_by IS NOT NULL AND public.has_role(auth.uid(),'admin'::public.app_role)
             AND public.shares_org_with(created_by)));

DROP POLICY IF EXISTS members_read_supplier_comments ON public.supplier_comments;
DROP POLICY IF EXISTS authors_delete_supplier_comments ON public.supplier_comments;
CREATE POLICY members_read_supplier_comments ON public.supplier_comments
  FOR SELECT TO authenticated USING (
    author_id = auth.uid() OR public.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.suppliers s
               WHERE s.id = supplier_comments.supplier_id
                 AND (s.created_by = auth.uid()
                      OR (s.created_by IS NOT NULL AND public.shares_org_with(s.created_by)))));
CREATE POLICY authors_delete_supplier_comments ON public.supplier_comments
  FOR DELETE TO authenticated USING (
    author_id = auth.uid() OR public.is_platform_admin()
    OR (author_id IS NOT NULL AND public.has_role(auth.uid(),'admin'::public.app_role)
        AND public.shares_org_with(author_id)));

-- login sessions
DROP POLICY IF EXISTS "Users view own login sessions" ON public.user_login_sessions;
CREATE POLICY "Users view own login sessions" ON public.user_login_sessions
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.is_platform_admin()
    OR (public.has_role(auth.uid(),'admin'::public.app_role) AND public.shares_org_with(user_id)));

-- user_roles: client admin manages roles ONLY inside their own organization
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Org admins view org roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin(organization_id) OR public.is_platform_admin());
CREATE POLICY "Org admins insert org roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id) OR public.is_platform_admin());
CREATE POLICY "Org admins update org roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_admin(organization_id) OR public.is_platform_admin());
CREATE POLICY "Org admins delete org roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.is_platform_admin());

COMMIT;

