-- Archived from edge function run-migration-secfix10 (già applicata in produzione)
-- Storico: non rieseguire automaticamente.

BEGIN;

-- ---------------------------------------------------------------
-- 1. organization_members: solo owner (o platform admin) toccano is_owner
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "owners can manage org members" ON public.organization_members;
DROP POLICY IF EXISTS org_owners_manage_members ON public.organization_members;
DROP POLICY IF EXISTS org_admins_manage_non_owner_members ON public.organization_members;

CREATE POLICY org_owners_manage_members ON public.organization_members
  FOR ALL TO authenticated
  USING (public.is_org_owner(organization_id) OR public.is_platform_admin())
  WITH CHECK (public.is_org_owner(organization_id) OR public.is_platform_admin());

-- Gli admin di org gestiscono solo membri non-owner e non possono creare
-- né promuovere righe con is_owner = true.
CREATE POLICY org_admins_manage_non_owner_members ON public.organization_members
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) AND is_owner = false)
  WITH CHECK (public.is_org_admin(organization_id) AND is_owner = false);

-- ---------------------------------------------------------------
-- 2. user_roles: gli admin di org non possono conferire il ruolo 'admin'
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Org admins insert org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins update org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins delete org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Platform admins manage roles" ON public.user_roles;

CREATE POLICY "Org admins insert org roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id) AND role <> 'admin'::public.app_role);

CREATE POLICY "Org admins update org roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id) AND role <> 'admin'::public.app_role)
  WITH CHECK (public.is_org_admin(organization_id) AND role <> 'admin'::public.app_role);

CREATE POLICY "Org admins delete org roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) AND role <> 'admin'::public.app_role);

-- I platform admin restano pienamente operativi su tutte le org.
CREATE POLICY "Platform admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ---------------------------------------------------------------
-- 3. platform_admins: nessuna scrittura dai ruoli client
-- ---------------------------------------------------------------
REVOKE ALL ON public.platform_admins FROM anon;
REVOKE ALL ON public.platform_admins FROM authenticated;
REVOKE ALL ON public.platform_admins FROM PUBLIC;
GRANT SELECT ON public.platform_admins TO authenticated; -- letture filtrate da RLS
GRANT ALL ON public.platform_admins TO service_role;

COMMIT;

