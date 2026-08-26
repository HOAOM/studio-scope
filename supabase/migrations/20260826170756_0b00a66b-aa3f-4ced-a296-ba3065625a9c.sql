BEGIN;

-- 1. Email infrastructure tables: scope policies to service_role explicitly
REVOKE ALL ON public.email_send_state FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.email_send_log FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.suppressed_emails FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.email_unsubscribe_tokens FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.email_send_state TO service_role;
GRANT ALL ON public.email_send_log TO service_role;
GRANT ALL ON public.suppressed_emails TO service_role;
GRANT ALL ON public.email_unsubscribe_tokens TO service_role;

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state" ON public.email_send_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can insert send log" ON public.email_send_log
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read send log" ON public.email_send_log
  FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can update send log" ON public.email_send_log
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens
  FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- 2. user_roles: org admins cannot touch their own role rows nor grant
--    admin-equivalent roles (admin, ceo, coo). Owners/platform admins unchanged.
DROP POLICY IF EXISTS "Org admins insert org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins update org roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins delete org roles" ON public.user_roles;

CREATE POLICY "Org admins insert org roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(organization_id)
    AND user_id <> auth.uid()
    AND role NOT IN ('admin'::public.app_role, 'ceo'::public.app_role, 'coo'::public.app_role)
  );

CREATE POLICY "Org admins update org roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(organization_id)
    AND user_id <> auth.uid()
    AND role NOT IN ('admin'::public.app_role, 'ceo'::public.app_role, 'coo'::public.app_role)
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    AND user_id <> auth.uid()
    AND role NOT IN ('admin'::public.app_role, 'ceo'::public.app_role, 'coo'::public.app_role)
  );

CREATE POLICY "Org admins delete org roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.is_org_admin(organization_id)
    AND user_id <> auth.uid()
    AND role NOT IN ('admin'::public.app_role, 'ceo'::public.app_role, 'coo'::public.app_role)
  );

COMMIT;